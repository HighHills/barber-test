/** Safe operator-facing error mapping for inventory operations. */

export type InventoryOperation = 'load' | 'adjustment_save' | 'transfer_save';

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

function genericMessage(operation: InventoryOperation): string {
  switch (operation) {
    case 'adjustment_save':
      return 'Gagal memproses stok opname. Silakan coba lagi.';
    case 'transfer_save':
      return 'Gagal memproses transfer stok. Silakan coba lagi.';
    default:
      return 'Gagal memuat data persediaan. Silakan muat ulang halaman.';
  }
}

export function mapInventoryOperationError(error: unknown, operation: InventoryOperation): string {
  const { code, rawMessage } = readError(error);
  const normalized = rawMessage.toLowerCase();

  if (
    code === '42501' ||
    /permission denied|insufficient_privilege|akses ditolak|not authorized|tidak memiliki izin/.test(normalized)
  ) {
    return 'Akses ditolak. Anda tidak memiliki izin untuk mengelola persediaan pada cabang ini.';
  }

  if (code === '22023' || /alasan .* wajib|jumlah .* tidak valid|produk duplikat|cabang .* wajib/.test(normalized)) {
    return operation === 'adjustment_save'
      ? 'Data stok opname tidak valid. Periksa alasan, produk, dan jumlah stok.'
      : 'Data transfer stok tidak valid. Periksa cabang, produk, dan jumlah stok.';
  }

  if (code === 'P0002' || /produk .* tidak ditemukan|cabang .* tidak ditemukan|outlet .* tidak ditemukan/.test(normalized)) {
    return 'Data produk atau cabang tidak ditemukan atau sudah tidak aktif.';
  }

  if (/stok tidak cukup|stok tidak mencukupi|insufficient stock|saldo stok/.test(normalized)) {
    return 'Stok pada cabang asal tidak mencukupi untuk transaksi ini.';
  }

  return genericMessage(operation);
}

