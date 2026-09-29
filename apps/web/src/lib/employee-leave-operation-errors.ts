/**
 * Employee Leave Operation Error Mapping Library (Web)
 *
 * Enforces fail-closed sanitization for employee leave operations:
 * - Sanitizes PostgreSQL internals, SQLSTATEs, relation names, and syntax errors.
 * - Maps known authorization and business validation exceptions to safe Indonesian messages.
 * - Zero raw err.message or database internals leaked to operator UI.
 */

export type LeaveOperation = 'load' | 'save' | 'status';

export const LEAVE_PERMISSION_DENIED_MESSAGE =
  'Akses ditolak. Hanya Owner/Admin yang dapat mengelola cuti staff.';

export const LEAVE_INVALID_RANGE_MESSAGE =
  'Rentang waktu cuti tidak valid. Periksa kembali waktu mulai dan selesai.';

export const LEAVE_STAFF_UNASSIGNED_MESSAGE =
  'Staff belum ditugaskan aktif pada cabang tersebut.';

export const LEAVE_NOT_FOUND_MESSAGE =
  'Data cuti tidak ditemukan atau sudah berubah.';

export const LEAVE_REASON_REQUIRED_MESSAGE =
  'Alasan cuti wajib diisi.';

export const GENERIC_LOAD_LEAVE_ERROR_MESSAGE =
  'Gagal memuat data cuti karena kendala sistem. Silakan muat ulang halaman.';

export const GENERIC_SAVE_LEAVE_ERROR_MESSAGE =
  'Gagal menyimpan data cuti karena kendala sistem.';

export const GENERIC_STATUS_LEAVE_ERROR_MESSAGE =
  'Gagal memperbarui status cuti karena kendala sistem.';

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  error?: unknown;
}

function extractErrorInfo(err: unknown): { code: string; message: string } {
  if (!err) {
    return { code: '', message: '' };
  }

  if (typeof err === 'string') {
    return { code: '', message: err.trim() };
  }

  if (err instanceof Error) {
    const code =
      'code' in err && typeof (err as ErrorLike).code === 'string'
        ? String((err as ErrorLike).code).trim()
        : '';
    return { code, message: (err.message || '').trim() };
  }

  if (typeof err === 'object') {
    const obj = err as ErrorLike;
    const code = typeof obj.code === 'string' ? obj.code.trim() : '';
    const candidates = [obj.message, obj.error, obj.details, obj.hint];
    const rawMessage =
      candidates.find((candidate) => typeof candidate === 'string') as
        | string
        | undefined;
    return { code, message: (rawMessage || '').trim() };
  }

  return { code: '', message: String(err).trim() };
}

function getGenericMessage(operation: LeaveOperation): string {
  if (operation === 'save') return GENERIC_SAVE_LEAVE_ERROR_MESSAGE;
  if (operation === 'status') return GENERIC_STATUS_LEAVE_ERROR_MESSAGE;
  return GENERIC_LOAD_LEAVE_ERROR_MESSAGE;
}

/**
 * Sanitizes errors from leave operations (load, save, status) to safe Indonesian operational messages.
 * Fail-closed: Never returns raw PostgreSQL errors, SQLSTATEs, or internal details to UI.
 */
export function mapEmployeeLeaveOperationError(
  err: unknown,
  operation: LeaveOperation = 'load'
): string {
  const { code, message } = extractErrorInfo(err);
  const normalized = message.toLowerCase();

  // 1. Authorization / Permission Denied (SQLSTATE 42501 or permission text)
  if (
    code === '42501' ||
    normalized.includes('permission denied') ||
    normalized.includes('akses ditolak') ||
    normalized.includes('insufficient_privilege') ||
    normalized.includes('hanya owner/admin') ||
    normalized.includes('not authorized') ||
    normalized.includes('authentication required')
  ) {
    return LEAVE_PERMISSION_DENIED_MESSAGE;
  }

  // 2. Staff not actively assigned to outlet (must be checked before generic 22023)
  if (
    normalized.includes('staff belum ditugaskan aktif') ||
    normalized.includes('belum memiliki penugasan cabang aktif') ||
    normalized.includes('penugasan cabang karyawan untuk data cuti ini sudah tidak aktif')
  ) {
    return LEAVE_STAFF_UNASSIGNED_MESSAGE;
  }

  // 3. Leave not found (SQLSTATE P0002 or data cuti tidak ditemukan)
  if (
    code === 'P0002' ||
    normalized.includes('data cuti tidak ditemukan') ||
    normalized.includes('leave not found')
  ) {
    return LEAVE_NOT_FOUND_MESSAGE;
  }

  // 4. Invalid time range (SQLSTATE 22023 or rentang cuti tidak valid)
  if (
    code === '22023' ||
    normalized.includes('rentang cuti tidak valid') ||
    normalized.includes('waktu selesai cuti harus lebih besar') ||
    normalized.includes('waktu selesai cuti harus lebih lambat') ||
    normalized.includes('tanggal mulai dan selesai cuti wajib diisi')
  ) {
    return LEAVE_INVALID_RANGE_MESSAGE;
  }

  // 5. Reason required
  if (normalized.includes('alasan cuti wajib diisi')) {
    return LEAVE_REASON_REQUIRED_MESSAGE;
  }

  // Fail closed to generic safe message without leaking SQLSTATE or PostgreSQL internals
  return getGenericMessage(operation);
}

export function mapLoadLeaveError(err: unknown): string {
  return mapEmployeeLeaveOperationError(err, 'load');
}

export function mapSaveLeaveError(err: unknown): string {
  return mapEmployeeLeaveOperationError(err, 'save');
}

export function mapStatusLeaveError(err: unknown): string {
  return mapEmployeeLeaveOperationError(err, 'status');
}
