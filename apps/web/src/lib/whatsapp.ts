import type { CompletedSale } from '../types/pos';
import { formatCurrency, formatDateTime } from './formatters';

export interface WhatsAppReceiptOptions {
  businessName?: string;
  customFooter?: string;
}

/**
 * Normalize Indonesian phone numbers to international standard (628...)
 * Examples:
 *   "0812-3456-789" -> "628123456789"
 *   "+62 812 3456"   -> "628123456"
 *   "8123456789"     -> "628123456789"
 */
export function normalizeIndonesianPhoneNumber(input: string): string {
  if (!input) return '';
  // Strip all non-digit characters
  let digits = input.replace(/\D/g, '');

  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  }

  return digits;
}

/**
 * Validate whether a string is a potentially valid phone number
 */
export function isValidPhoneNumber(input: string): boolean {
  const normalized = normalizeIndonesianPhoneNumber(input);
  // Indonesian numbers with 62 prefix typically range from 10 to 15 digits
  return normalized.length >= 10 && normalized.length <= 16 && normalized.startsWith('62');
}

/**
 * Build a structured, professional WhatsApp text receipt for a CompletedSale
 */
export function generateWhatsAppReceiptText(
  sale: CompletedSale,
  options: WhatsAppReceiptOptions = {}
): string {
  const storeName = (options.businessName || 'BARBERSHOP').toUpperCase();
  const outletName = sale.outlet_name ? sale.outlet_name.toUpperCase() : '';

  let msg = `✂️ *${storeName}* ✂️\n`;
  if (outletName) {
    msg += `📍 *${outletName}*\n`;
  }
  msg += `_Nota Transaksi Digital_\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `*No. Nota*  : ` + `${sale.invoice_number}\n`;
  msg += `*Waktu*     : ` + `${formatDateTime(sale.sold_at)}\n`;
  msg += `*Kasir*     : ` + `${sale.cashier_name || '-'}\n`;

  if (sale.customer_name) {
    const custInfo = sale.customer_tier
      ? `${sale.customer_name} (${sale.customer_tier})`
      : sale.customer_name;
    msg += `*Pelanggan* : ` + `${custInfo}\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💈 *RINCIAN LAYANAN & PRODUK:*\n`;

  sale.items.forEach((item, idx) => {
    msg += `${idx + 1}. *${item.description}* (${item.quantity}x)\n`;
    if (item.barber_name) {
      msg += `   • Kapster: ${item.barber_name}\n`;
    }
    msg += `   • Harga  : ${formatCurrency(item.total_amount)}\n`;
  });

  msg += `─────────────────────\n`;
  msg += `*Subtotal* : ${formatCurrency(sale.subtotal)}\n`;

  if (sale.discount_amount > 0) {
    msg += `*Diskon*   : -${formatCurrency(sale.discount_amount)}\n`;
  }

  if (sale.tax_amount > 0) {
    msg += `*PPN*      : ${formatCurrency(sale.tax_amount)}\n`;
  }

  msg += `*TOTAL*    : *${formatCurrency(sale.total_amount)}*\n`;

  // Payment Breakdown
  if (sale.payments && sale.payments.length > 0) {
    const paymentMethodsText = sale.payments
      .map((p) => `${p.method_name} (${formatCurrency(p.amount)})`)
      .join(', ');
    msg += `*Metode*   : ${paymentMethodsText} (Lunas)\n`;
  }

  if ((sale.tendered_amount ?? 0) > sale.total_amount) {
    msg += `*Diterima* : ${formatCurrency(sale.tendered_amount || 0)}\n`;
    msg += `*Kembalian*: ${formatCurrency(sale.change_amount || 0)}\n`;
  }

  // Loyalty Points
  if (sale.customer_points !== undefined && sale.customer_points !== null) {
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🎁 *Poin Loyalitas Member:*\n`;
    msg += `• Saldo Poin: *${sale.customer_points.toLocaleString('id-ID')} Pts*\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Terima kasih atas kunjungan Anda!\n`;
  msg += `_${options.customFooter || 'Gaya Terbaik untuk Pria Berkelas'}_\n`;

  return msg;
}

/**
 * Generate a direct WhatsApp send URL (works for web and mobile)
 */
export function getWhatsAppShareUrl(phoneNumber: string, messageText: string): string {
  const normalizedPhone = normalizeIndonesianPhoneNumber(phoneNumber);
  const encodedText = encodeURIComponent(messageText);
  if (normalizedPhone) {
    return `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Safe clipboard copy with fallback
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback to execCommand
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}
