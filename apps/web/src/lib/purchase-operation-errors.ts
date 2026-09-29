export type PurchaseOperation =
  | 'load'
  | 'create'
  | 'receive'
  | 'payment'
  | 'supplier_load'
  | 'supplier_save'
  | 'supplier_delete';

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

function getErrorText(error: unknown): { code: string; text: string } {
  if (!error || typeof error !== 'object') {
    return { code: '', text: typeof error === 'string' ? error : '' };
  }
  const value = error as ErrorLike;
  return {
    code: typeof value.code === 'string' ? value.code.toUpperCase() : '',
    text: [value.message, value.details, value.hint]
      .filter((part): part is string => typeof part === 'string')
      .join(' ')
      .trim(),
  };
}

function genericMessage(operation: PurchaseOperation): string {
  switch (operation) {
    case 'supplier_load': return 'Gagal memuat data supplier. Silakan coba lagi.';
    case 'create': return 'Gagal membuat pesanan pembelian karena kendala sistem.';
    case 'receive': return 'Gagal memproses penerimaan barang karena kendala sistem.';
    case 'payment': return 'Gagal mencatat pembayaran supplier karena kendala sistem.';
    case 'supplier_save': return 'Gagal menyimpan data supplier karena kendala sistem.';
    case 'supplier_delete': return 'Gagal menghapus atau menonaktifkan supplier karena kendala sistem.';
    case 'load':
    default: return 'Gagal memuat data pengadaan. Silakan coba lagi.';
  }
}

/** Fail-closed mapping for all purchase, AP, and supplier UI errors. */
export function mapPurchaseOperationError(error: unknown, operation: PurchaseOperation): string {
  const { code, text } = getErrorText(error);
  const lower = text.toLowerCase();

  if (code === '42501' || /permission denied|akses ditolak|insufficient privilege/.test(lower)) {
    return 'Akses ditolak. Pastikan akun Anda memiliki hak pengadaan/inventori yang sesuai.';
  }
  if (new Set(['42P01', '42P02', '42601', '57014', '08000', '08003', '08006', '23502', '23503', '42883', 'XX000']).has(code)) {
    return genericMessage(operation);
  }
  if (code === '23505' || /duplicate key|already exists|sudah digunakan|duplikat/.test(lower)) {
    return operation === 'supplier_save'
      ? 'Kode supplier atau data unik lainnya sudah digunakan.'
      : 'Data pengadaan sudah tercatat sebelumnya. Periksa kembali lalu coba lagi.';
  }
  if (code === 'P0002' || /tidak ditemukan|not found/.test(lower)) {
    if (operation === 'payment') return 'Faktur pembelian tidak ditemukan atau sudah berubah.';
    if (operation === 'receive') return 'Faktur pembelian tidak ditemukan atau sudah diproses.';
    if (operation === 'supplier_delete') return 'Supplier tidak ditemukan atau sudah dihapus.';
    return 'Data pengadaan tidak ditemukan atau sudah berubah.';
  }
  if (/melebihi sisa hutang|exceed.*debt|lebih besar dari sisa hutang/.test(lower)) {
    return 'Nominal pembayaran melebihi sisa hutang supplier.';
  }
  if (/belum diterima|harus.*received|status.*draft|sudah lunas|already paid/.test(lower)) {
    return 'Status faktur belum memungkinkan untuk operasi tersebut.';
  }
  if (/supplier.*wajib|supplier.*required/.test(lower)) return 'Supplier wajib dipilih.';
  if (/produk.*wajib|product.*required/.test(lower)) return 'Produk wajib dipilih.';
  if (/kuantitas.*lebih besar|quantity.*greater|jumlah.*lebih besar/.test(lower)) return 'Kuantitas produk harus lebih besar dari 0.';
  if (/harga modal.*negatif|unit cost.*negative/.test(lower)) return 'Harga modal produk tidak boleh negatif.';
  if (/nominal pembayaran|amount.*greater|amount.*invalid/.test(lower)) return 'Nominal pembayaran harus lebih besar dari 0 dan valid.';
  if (/nama supplier.*wajib|supplier\/vendor.*wajib/.test(lower)) return 'Nama supplier/vendor wajib diisi.';

  return genericMessage(operation);
}
