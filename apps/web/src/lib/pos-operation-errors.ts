export interface ValidatedPosSaleResponse {
  saleId: string;
  invoiceNumber: string;
  journalId: string;
  totalAmount: number;
  isDuplicate: boolean;
  newPointsBalance: number | null;
}

function messageOf(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const value = error as { code?: unknown; message?: unknown };
  return `${typeof value.code === 'string' ? value.code : ''} ${typeof value.message === 'string' ? value.message : ''}`.toLowerCase();
}

export function mapPosOperationError(error: unknown): string {
  const message = messageOf(error);
  if (message.includes('42501') || message.includes('permission') || message.includes('authentication')) {
    return 'Akses ditolak atau sesi login telah berakhir. Silakan masuk kembali.';
  }
  if (message.includes('cash session') || message.includes('sesi kasir')) {
    return 'Sesi kasir tidak aktif atau sudah berubah. Muat ulang POS sebelum membayar.';
  }
  if (message.includes('stock') || message.includes('inventory') || message.includes('insufficient')) {
    return 'Stok produk tidak mencukupi atau sudah berubah. Periksa kembali keranjang.';
  }
  if (message.includes('idempotency conflict')) {
    return 'Permintaan pembayaran ini tidak lagi valid. Periksa riwayat nota sebelum mencoba kembali.';
  }
  return 'Transaksi tidak dapat diproses karena kendala sistem. Tidak ada nota yang dibuat.';
}

/** Safe feedback for read-only receipt and history queries. */
export function mapPosHistoryError(error: unknown): string {
  const message = messageOf(error);
  if (message.includes('42501') || message.includes('permission') || message.includes('authentication')) {
    return 'Akses ditolak atau sesi login telah berakhir. Silakan masuk kembali.';
  }
  return 'Gagal memuat riwayat nota karena kendala sistem. Silakan muat ulang.';
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Success is accepted only when the server returns a complete authoritative POS contract. */
export function parsePosSaleResponse(payload: unknown): ValidatedPosSaleResponse {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('POS_RESPONSE_INVALID');
  }
  const value = payload as Record<string, unknown>;
  const saleId = nonEmptyString(value.sale_id);
  const invoiceNumber = nonEmptyString(value.invoice_number);
  const journalId = nonEmptyString(value.journal_id);
  const totalAmount = Number(value.total_amount);
  const isDuplicate = value.is_duplicate;
  if (!saleId || !invoiceNumber || !journalId || !Number.isFinite(totalAmount) || totalAmount < 0 || typeof isDuplicate !== 'boolean') {
    throw new Error('POS_RESPONSE_INVALID');
  }
  const points = value.new_points_balance;
  const newPointsBalance = points === null || points === undefined ? null : Number(points);
  if (newPointsBalance !== null && (!Number.isInteger(newPointsBalance) || newPointsBalance < 0)) {
    throw new Error('POS_RESPONSE_INVALID');
  }
  return { saleId, invoiceNumber, journalId, totalAmount, isDuplicate, newPointsBalance };
}
