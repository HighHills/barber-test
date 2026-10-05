function rawMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const value = error as { code?: unknown; message?: unknown };
  return `${typeof value.code === 'string' ? value.code : ''} ${typeof value.message === 'string' ? value.message : ''}`.toLowerCase();
}

/** Fail-closed analytics error mapping: database internals never reach executives. */
export function mapAnalyticsOperationError(error: unknown): string {
  const message = rawMessage(error);
  if (message.includes('42501') || message.includes('permission') || message.includes('akses ditolak')) {
    return 'Akses ditolak. Anda tidak memiliki izin untuk melihat analitik ini.';
  }
  if (message.includes('not found') || message.includes('tidak ditemukan') || message.includes('p0002')) {
    return 'Data analitik tidak ditemukan atau sudah berubah. Silakan muat ulang.';
  }
  return 'Gagal memuat analitik karena kendala sistem. Silakan muat ulang halaman.';
}
