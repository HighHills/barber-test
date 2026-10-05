export type AccountingOperation = 'load' | 'open-session' | 'close-session' | 'close-period';

function rawMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const candidate = error as { message?: unknown; code?: unknown };
  return `${typeof candidate.code === 'string' ? candidate.code : ''} ${typeof candidate.message === 'string' ? candidate.message : ''}`.toLowerCase();
}

/** Maps server failures to operator-safe messages. Never expose database/RPC internals. */
export function mapAccountingOperationError(error: unknown, operation: AccountingOperation): string {
  const message = rawMessage(error);
  if (message.includes('42501') || message.includes('permission') || message.includes('akses ditolak') || message.includes('finance.')) {
    return 'Akses ditolak. Anda tidak memiliki izin untuk menjalankan operasi keuangan ini.';
  }
  if (message.includes('periode') && (message.includes('closed') || message.includes('ditutup') || message.includes('terkunci'))) {
    return 'Periode buku sudah ditutup dan tidak dapat diubah.';
  }
  if (message.includes('sesi') && (message.includes('open') || message.includes('aktif') || message.includes('already'))) {
    return 'Sesi kasir untuk register ini masih aktif atau statusnya sudah berubah.';
  }
  if (message.includes('tidak ditemukan') || message.includes('not found') || message.includes('p0002')) {
    return 'Data keuangan tidak ditemukan atau sudah berubah. Silakan muat ulang halaman.';
  }
  switch (operation) {
    case 'open-session': return 'Gagal membuka sesi kasir karena kendala sistem.';
    case 'close-session': return 'Gagal menutup sesi kasir karena kendala sistem.';
    case 'close-period': return 'Gagal menutup periode buku karena kendala sistem.';
    default: return 'Gagal memuat data akuntansi karena kendala sistem. Silakan muat ulang halaman.';
  }
}
