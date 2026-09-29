/** Safe operator-facing error mapping for operational expense operations. */

export type ExpenseOperation = 'load' | 'create' | 'void';

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  error?: unknown;
};

function readError(error: unknown): { code: string | null; rawMessage: string } {
  if (typeof error === 'string') return { code: null, rawMessage: error.trim() };
  if (!error || typeof error !== 'object') return { code: null, rawMessage: '' };

  const value = error as ErrorLike;
  const code = typeof value.code === 'string' ? value.code.trim() : null;
  const candidates = [value.message, value.error, value.details, value.hint];
  const message = candidates.find((candidate) => typeof candidate === 'string') as string | undefined;
  return { code, rawMessage: message?.trim() || '' };
}

function genericMessage(operation: ExpenseOperation): string {
  if (operation === 'create') return 'Gagal mencatat biaya operasional. Silakan coba lagi.';
  if (operation === 'void') return 'Gagal membatalkan biaya operasional. Silakan coba lagi.';
  return 'Gagal memuat data biaya operasional. Silakan muat ulang halaman.';
}

export function mapExpenseOperationError(error: unknown, operation: ExpenseOperation): string {
  const { code, rawMessage } = readError(error);
  const normalized = rawMessage.toLowerCase();

  if (
    code === '42501' ||
    /permission denied|insufficient_privilege|akses ditolak|not authorized|tidak memiliki izin/.test(normalized)
  ) {
    return operation === 'void'
      ? 'Akses ditolak. Hanya Owner/Admin yang dapat membatalkan biaya operasional.'
      : 'Akses ditolak. Anda tidak memiliki izin mengelola biaya operasional pada cabang ini.';
  }

  if (code === 'P0002' || /data pengeluaran .* tidak ditemukan|expense .* not found/.test(normalized)) {
    return 'Data biaya operasional tidak ditemukan atau sudah berubah.';
  }

  if (/nominal .* (wajib|harus)|amount .* (required|greater)|lebih besar dari rp 0/.test(normalized)) {
    return 'Nominal pengeluaran harus lebih besar dari Rp 0.';
  }

  if (/cabang outlet .* (wajib|tidak valid|tidak aktif)|outlet .* (required|invalid|inactive)/.test(normalized)) {
    return 'Cabang outlet tidak valid atau belum dipilih.';
  }

  if (/kategori pengeluaran wajib|category .* required/.test(normalized)) {
    return 'Kategori pengeluaran wajib dipilih.';
  }

  if (/akun pembayaran|payment account/.test(normalized)) {
    return 'Akun pembayaran kas/bank belum terkonfigurasi.';
  }

  return genericMessage(operation);
}

