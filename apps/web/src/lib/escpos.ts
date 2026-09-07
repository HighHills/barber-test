import type { CompletedSale } from '../types/pos';
import { formatCurrency, formatDateTime } from './formatters';

export type PaperWidth = '58mm' | '80mm';

export interface ReceiptPrintSettings {
  paperWidth: PaperWidth;
  businessName?: string;
  customFooter?: string;
  autoCut?: boolean;
}

/**
 * Pure ESC/POS Command Encoder for Web Bluetooth & Raw Thermal Printing
 */
export class EscPosEncoder {
  private buffer: number[] = [];
  private encoder: TextEncoder = new TextEncoder();

  // Initialize printer
  init(): this {
    this.buffer.push(0x1b, 0x40); // ESC @
    return this;
  }

  // Text alignment: 'left' | 'center' | 'right'
  align(alignment: 'left' | 'center' | 'right'): this {
    const code = alignment === 'center' ? 1 : alignment === 'right' ? 2 : 0;
    this.buffer.push(0x1b, 0x61, code); // ESC a n
    return this;
  }

  // Bold text
  bold(enable: boolean = true): this {
    this.buffer.push(0x1b, 0x45, enable ? 1 : 0); // ESC E n
    return this;
  }

  // Font size multiplier (double height & width for header)
  doubleSize(enable: boolean = true): this {
    if (enable) {
      this.buffer.push(0x1d, 0x21, 0x11); // GS ! 0x11 (double width & height)
    } else {
      this.buffer.push(0x1d, 0x21, 0x00); // GS ! 0x00 (normal size)
    }
    return this;
  }

  // Underline
  underline(enable: boolean = true): this {
    this.buffer.push(0x1b, 0x2d, enable ? 1 : 0); // ESC - n
    return this;
  }

  // Append raw text
  text(str: string): this {
    const bytes = this.encoder.encode(str);
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]);
    }
    return this;
  }

  // Append text with a newline
  line(str: string = ''): this {
    this.text(str);
    this.buffer.push(0x0a); // LF
    return this;
  }

  // Print empty feed lines
  feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  // Two columns justified (Left text, Right text with space padding)
  twoColumns(left: string, right: string, maxCols: number): this {
    const rightLen = right.length;
    const maxLeftLen = Math.max(1, maxCols - rightLen - 1);
    const truncatedLeft = left.length > maxLeftLen ? left.substring(0, maxLeftLen) : left;
    const spacesNeeded = Math.max(1, maxCols - truncatedLeft.length - rightLen);
    const spacePadding = ' '.repeat(spacesNeeded);
    return this.line(`${truncatedLeft}${spacePadding}${right}`);
  }

  // Full-width divider line
  divider(char: string = '-', maxCols: number): this {
    return this.line(char.repeat(maxCols));
  }

  // Paper cut command
  cut(full: boolean = false): this {
    this.feed(3);
    this.buffer.push(0x1d, 0x56, full ? 0 : 1); // GS V n
    return this;
  }

  // Return final Uint8Array
  encode(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Generate full binary ESC/POS payload for a CompletedSale
 */
export function generateSaleEscPos(
  sale: CompletedSale,
  settings: ReceiptPrintSettings = { paperWidth: '58mm' }
): Uint8Array {
  const encoder = new EscPosEncoder();
  const is58mm = settings.paperWidth === '58mm';
  const cols = is58mm ? 32 : 48; // Standard characters per line for 58mm vs 80mm

  encoder.init();

  // 1. Header: Store Name & Outlet Info
  encoder.align('center');
  encoder.bold(true).doubleSize(true);
  const storeName = (settings.businessName || 'BARBERSHOP').toUpperCase();
  encoder.line(storeName);
  encoder.doubleSize(false).bold(false);

  if (sale.outlet_name) {
    encoder.line(sale.outlet_name);
  }

  encoder.divider('-', cols);

  // 2. Meta Info (Invoice, Date, Cashier, Customer)
  encoder.align('left');
  encoder.twoColumns('No. Nota:', sale.invoice_number, cols);
  encoder.twoColumns('Tanggal :', formatDateTime(sale.sold_at), cols);
  encoder.twoColumns('Kasir   :', sale.cashier_name || '-', cols);

  if (sale.customer_name) {
    const custLabel = sale.customer_tier
      ? `${sale.customer_name} (${sale.customer_tier})`
      : sale.customer_name;
    encoder.twoColumns('Tamu    :', custLabel, cols);
  }

  encoder.divider('-', cols);

  // 3. Line Items
  encoder.bold(true).line('LAYANAN & PRODUK:').bold(false);
  for (const item of sale.items) {
    const qtyPrice = `${item.quantity}x ${formatCurrency(item.unit_price)}`;
    const lineTotal = formatCurrency(item.total_amount);

    encoder.bold(true).line(item.description).bold(false);
    if (item.barber_name) {
      encoder.line(`  Kapster: ${item.barber_name}`);
    }
    encoder.twoColumns(`  ${qtyPrice}`, lineTotal, cols);
  }

  encoder.divider('-', cols);

  // 4. Totals Breakdown
  encoder.twoColumns('Subtotal', formatCurrency(sale.subtotal), cols);

  if (sale.discount_amount > 0) {
    encoder.twoColumns('Diskon', `-${formatCurrency(sale.discount_amount)}`, cols);
  }

  if (sale.tax_amount > 0) {
    encoder.twoColumns('PPN', formatCurrency(sale.tax_amount), cols);
  }

  encoder.divider('=', cols);
  encoder.bold(true);
  encoder.twoColumns('TOTAL BAYAR', formatCurrency(sale.total_amount), cols);
  encoder.bold(false);
  encoder.divider('=', cols);

  // 5. Payment Details & Change
  for (const p of sale.payments) {
    encoder.twoColumns(p.method_name, formatCurrency(p.amount), cols);
  }

  if ((sale.tendered_amount ?? 0) > sale.total_amount) {
    encoder.twoColumns('Tunai Diterima', formatCurrency(sale.tendered_amount || 0), cols);
    encoder.bold(true);
    encoder.twoColumns('Kembalian', formatCurrency(sale.change_amount || 0), cols);
    encoder.bold(false);
  }

  // 6. Loyalty Points (if member)
  if (sale.customer_points !== undefined && sale.customer_points !== null) {
    encoder.divider('-', cols);
    encoder.align('center');
    encoder.line(`Poin Loyalitas Member: ${sale.customer_points.toLocaleString('id-ID')} Pts`);
  }

  encoder.divider('-', cols);

  // 7. Footer Thank You
  encoder.align('center');
  encoder.bold(true).line('Terima Kasih atas Kunjungan Anda!').bold(false);
  encoder.line(settings.customFooter || 'Gaya Terbaik untuk Pria Berkelas');

  // 8. Cut paper if enabled
  if (settings.autoCut !== false) {
    encoder.cut(false);
  } else {
    encoder.feed(3);
  }

  return encoder.encode();
}
