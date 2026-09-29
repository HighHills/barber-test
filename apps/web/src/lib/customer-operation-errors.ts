/**
 * Customer Operation Error Mapping Library
 *
 * Enforces fail-closed sanitization for customer operations:
 * - Specific BLOCKED message when RPC is not found on backend.
 * - Exact mapping for actual Supabase / PostgreSQL RPC error messages.
 * - Humane operational translation for known business errors in Bahasa Indonesia.
 * - Strict sanitization of PostgreSQL internals, SQLSTATEs, relation names, and syntax errors.
 * - Zero raw err.message or rpcErr.message leaks to operator.
 */

export const BLOCKED_HAIRCUT_RPC_MESSAGE =
  'Fitur simpan catatan pangkas belum aktif di database Supabase (RPC add_customer_haircut_record: BLOCKED). Perubahan skema belum dideploy oleh administrator.';

export const BLOCKED_POINTS_RPC_MESSAGE =
  'Fitur penyesuaian poin loyalitas belum aktif di database Supabase (RPC adjust_customer_loyalty_points: BLOCKED). Perubahan skema belum dideploy oleh administrator.';

export const GENERIC_HAIRCUT_ERROR_MESSAGE =
  'Gagal menyimpan catatan pangkas rambut karena kendala sistem.';

export const GENERIC_POINTS_ERROR_MESSAGE =
  'Gagal menyesuaikan poin loyalitas pelanggan karena kendala sistem.';

export const GENERIC_LOAD_CUSTOMER_ERROR_MESSAGE =
  'Gagal memuat data pelanggan CRM karena kendala sistem. Silakan muat ulang halaman.';

export const GENERIC_SAVE_CUSTOMER_ERROR_MESSAGE =
  'Gagal menyimpan data pelanggan karena kendala sistem.';

export const GENERIC_SAVE_TIER_ERROR_MESSAGE =
  'Gagal memperbarui aturan tier karena kendala sistem.';

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

function extractErrorInfo(err: unknown): { code: string; message: string } {
  if (!err) {
    return { code: '', message: '' };
  }

  if (typeof err === 'string') {
    return { code: '', message: err };
  }

  if (err instanceof Error) {
    const code = 'code' in err && typeof (err as ErrorLike).code === 'string'
      ? String((err as ErrorLike).code)
      : '';
    return { code, message: err.message || '' };
  }

  if (typeof err === 'object') {
    const obj = err as ErrorLike;
    const code = typeof obj.code === 'string' ? obj.code : '';
    const message = typeof obj.message === 'string' ? obj.message : '';
    return { code, message };
  }

  return { code: '', message: String(err) };
}

/**
 * Checks if the error indicates a missing RPC function on the PostgreSQL/Supabase database.
 */
function isRpcMissing(err: unknown, rpcName: string): boolean {
  const { code, message } = extractErrorInfo(err);

  // PostgreSQL 42883 is undefined_function
  if (code === '42883') {
    return true;
  }

  const normalized = message.toLowerCase();
  const normalizedRpc = rpcName.toLowerCase();

  if (
    normalized.includes(normalizedRpc) &&
    (normalized.includes('does not exist') ||
      normalized.includes('not found') ||
      normalized.includes('could not find'))
  ) {
    return true;
  }

  if (
    normalized.includes('could not find the function') ||
    normalized.includes('function public.' + normalizedRpc)
  ) {
    return true;
  }

  return false;
}

/**
 * Maps errors from add_customer_haircut_record RPC to safe operational messages.
 * Matches exact Supabase function error messages and sanitizes PostgreSQL internals.
 */
export function mapSaveHaircutRecordError(err: unknown): string {
  if (isRpcMissing(err, 'add_customer_haircut_record')) {
    return BLOCKED_HAIRCUT_RPC_MESSAGE;
  }

  const { code, message } = extractErrorInfo(err);

  // 1. Exact Supabase RPC error strings & specific business validations
  // Note: PostgreSQL add_customer_haircut_record raises "Barber % tidak aktif..." with ERRCODE 42501,
  // so check specific business conditions before the generic 42501 permission check.

  // Actual RPC: "Customer % tidak ditemukan atau tidak aktif"
  if (
    message.includes('tidak ditemukan atau tidak aktif') ||
    message.includes('CUSTOMER_NOT_FOUND') ||
    message.includes('Pelanggan tidak ditemukan')
  ) {
    return 'Data pelanggan tidak ditemukan atau berstatus tidak aktif.';
  }

  // Actual RPC: "Nama style pangkas wajib diisi"
  if (
    message.includes('Nama style pangkas wajib diisi') ||
    message.includes('STYLE_NAME_REQUIRED') ||
    message.includes('Nama gaya wajib diisi')
  ) {
    return 'Nama gaya pangkas rambut wajib diisi.';
  }

  // Actual RPC: "Barber % tidak aktif atau tidak ditugaskan pada outlet %"
  if (
    message.includes('tidak aktif atau tidak ditugaskan pada outlet') ||
    message.includes('BARBER_NOT_FOUND') ||
    message.includes('Kapster tidak ditemukan')
  ) {
    return 'Kapster tidak aktif atau tidak ditugaskan pada cabang ini.';
  }

  if (message.includes('OUTLET_NOT_FOUND') || message.includes('Cabang tidak ditemukan')) {
    return 'Cabang operasional tidak valid.';
  }

  // 2. Authorization / Permission check
  if (
    code === '42501' ||
    message.includes('PERMISSION_DENIED') ||
    message.includes('Akses ditolak') ||
    message.includes('Authentication required') ||
    message.toLowerCase().includes('forbidden')
  ) {
    return 'Akses ditolak: Anda tidak memiliki izin untuk menyimpan catatan pangkas rambut.';
  }

  // Fail closed to generic safe message without leaking SQLSTATE or PostgreSQL internals
  return GENERIC_HAIRCUT_ERROR_MESSAGE;
}

/**
 * Maps errors from adjust_customer_loyalty_points RPC to safe operational messages.
 * Matches exact Supabase function error messages and sanitizes PostgreSQL internals.
 */
export function mapAdjustPointsError(err: unknown): string {
  if (isRpcMissing(err, 'adjust_customer_loyalty_points')) {
    return BLOCKED_POINTS_RPC_MESSAGE;
  }

  const { code, message } = extractErrorInfo(err);

  // 1. Exact Supabase RPC error strings & business codes
  // Actual RPC: "Customer % tidak ditemukan atau tidak aktif"
  if (
    message.includes('tidak ditemukan atau tidak aktif') ||
    message.includes('CUSTOMER_NOT_FOUND') ||
    message.includes('Pelanggan tidak ditemukan')
  ) {
    return 'Data pelanggan tidak ditemukan atau berstatus tidak aktif.';
  }

  // Actual RPC: "Perubahan poin tidak boleh 0"
  if (
    message.includes('Perubahan poin tidak boleh 0') ||
    message.includes('POINTS_ZERO') ||
    message.includes('POINTS_MUST_BE_NON_ZERO') ||
    message.includes('Poin tidak boleh bernilai nol')
  ) {
    return 'Jumlah poin penyesuaian tidak boleh bernilai 0.';
  }

  // Actual RPC: "Koreksi poin melebihi saldo customer % (saldo: %, pengurangan: %)"
  if (
    message.includes('Koreksi poin melebihi saldo customer') ||
    message.includes('INSUFFICIENT_POINTS') ||
    message.includes('Saldo poin tidak mencukupi')
  ) {
    return 'Pengurangan poin melebihi saldo poin aktif pelanggan.';
  }

  // Actual RPC: "Alasan koreksi poin wajib diisi"
  if (
    message.includes('Alasan koreksi poin wajib diisi') ||
    message.includes('REASON_REQUIRED') ||
    message.includes('Alasan wajib diisi')
  ) {
    return 'Alasan penyesuaian poin wajib diisi.';
  }

  if (message.includes('INVALID_BALANCE_RETURNED') || message.includes('saldo yang tidak valid')) {
    return 'Gagal menyesuaikan poin: respon saldo dari server tidak valid.';
  }

  // 2. Authorization / Permission check
  if (
    code === '42501' ||
    message.includes('PERMISSION_DENIED') ||
    message.includes('Akses ditolak') ||
    message.includes('Authentication required') ||
    message.toLowerCase().includes('forbidden')
  ) {
    return 'Akses ditolak: Anda tidak memiliki izin untuk melakukan koreksi poin loyalitas.';
  }

  // Fail closed to generic safe message without leaking SQLSTATE or PostgreSQL internals
  return GENERIC_POINTS_ERROR_MESSAGE;
}

/**
 * Maps errors during customer query/load to a safe operational message.
 */
export function mapLoadCustomerError(err: unknown): string {
  const { code, message } = extractErrorInfo(err);

  if (code === '42501' || message.includes('PERMISSION_DENIED') || message.includes('Akses ditolak')) {
    return 'Akses ditolak: Anda tidak memiliki izin untuk melihat data pelanggan.';
  }

  return GENERIC_LOAD_CUSTOMER_ERROR_MESSAGE;
}

/**
 * Maps errors during customer creation/update to a safe operational message.
 */
export function mapSaveCustomerError(err: unknown): string {
  const { code, message } = extractErrorInfo(err);

  if (
    code === '42501' ||
    message.includes('PERMISSION_DENIED') ||
    message.includes('CUSTOMER_CREATE_FORBIDDEN') ||
    message.includes('Akses ditolak') ||
    message.includes('AUTH_REQUIRED')
  ) {
    return 'Akses ditolak: Anda tidak memiliki izin untuk mendaftarkan atau memperbarui data pelanggan.';
  }

  if (message.includes('Nama pelanggan wajib diisi') || message.includes('CUSTOMER_NAME_REQUIRED')) {
    return 'Nama pelanggan wajib diisi.';
  }

  if (message.includes('Nomor telepon pelanggan wajib diisi') || message.includes('CUSTOMER_PHONE_REQUIRED')) {
    return 'Nomor telepon pelanggan wajib diisi.';
  }

  if (message.includes('INVALID_CUSTOMER_TIER') || message.includes('Tier loyalitas pelanggan tidak valid')) {
    return 'Tingkatan (tier) loyalitas pelanggan tidak valid.';
  }

  if (
    message.includes('INVALID_PREFERRED_BARBER') ||
    message.includes('Kapster pilihan tidak valid') ||
    message.includes('tidak aktif atau tidak ditugaskan pada outlet')
  ) {
    return 'Kapster pilihan tidak valid atau tidak ditugaskan pada cabang ini.';
  }

  if (
    code === '23505' ||
    message.toLowerCase().includes('duplicate key') ||
    message.toLowerCase().includes('unique constraint') ||
    message.toLowerCase().includes('phone')
  ) {
    return 'Nomor telepon pelanggan sudah terdaftar di sistem.';
  }

  return GENERIC_SAVE_CUSTOMER_ERROR_MESSAGE;
}

/**
 * Maps errors during tier configuration save to a safe operational message.
 */
export function mapSaveTierError(err: unknown): string {
  const { code, message } = extractErrorInfo(err);

  if (code === '42501' || message.includes('PERMISSION_DENIED') || message.includes('Akses ditolak')) {
    return 'Akses ditolak: Anda tidak memiliki izin untuk mengubah aturan tier loyalitas.';
  }

  if (code === '23505' || message.toLowerCase().includes('duplicate key') || message.toLowerCase().includes('unique constraint')) {
    return 'Nama atau kode aturan tier loyalitas sudah terdaftar.';
  }

  return GENERIC_SAVE_TIER_ERROR_MESSAGE;
}
