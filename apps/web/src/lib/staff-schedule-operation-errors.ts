export type StaffOperation = 'load' | 'save' | 'status' | 'assignment';
export type ScheduleOperation = 'load' | 'save';

export const STAFF_PERMISSION_DENIED_MESSAGE =
  'Akses ditolak. Hanya Owner/Admin yang dapat mengelola staff.';
export const STAFF_REQUIRED_MESSAGE = 'Kode staff dan nama staff wajib diisi.';
export const STAFF_NOT_FOUND_MESSAGE = 'Data staff tidak ditemukan atau sudah berubah.';
export const STAFF_DUPLICATE_CODE_MESSAGE = 'Kode staff sudah digunakan.';
export const OUTLET_NOT_FOUND_MESSAGE = 'Cabang outlet tidak ditemukan.';

export const GENERIC_STAFF_LOAD_MESSAGE =
  'Gagal memuat data staff karena kendala sistem. Silakan muat ulang halaman.';
export const GENERIC_STAFF_SAVE_MESSAGE = 'Gagal menyimpan data staff karena kendala sistem.';
export const GENERIC_STAFF_STATUS_MESSAGE =
  'Gagal memperbarui status staff karena kendala sistem.';
export const GENERIC_STAFF_ASSIGNMENT_MESSAGE =
  'Gagal memperbarui penugasan cabang karena kendala sistem.';

export const SCHEDULE_PERMISSION_DENIED_MESSAGE =
  'Akses ditolak. Hanya Owner/Admin yang dapat mengelola jadwal staff.';
export const SCHEDULE_STAFF_REQUIRED_MESSAGE = 'Staff dan outlet wajib dipilih.';
export const SCHEDULE_STAFF_NOT_FOUND_MESSAGE = 'Staff aktif tidak ditemukan.';
export const SCHEDULE_UNASSIGNED_MESSAGE =
  'Staff belum ditugaskan aktif pada cabang tersebut.';
export const SCHEDULE_OUTLET_NOT_FOUND_MESSAGE = 'Cabang outlet tidak ditemukan.';
export const SCHEDULE_VALIDATION_MESSAGE =
  'Data jadwal tidak valid. Periksa kembali jam kerja dan jam istirahat.';

export const GENERIC_SCHEDULE_LOAD_MESSAGE =
  'Gagal memuat jadwal kerja staff karena kendala sistem. Silakan muat ulang halaman.';
export const GENERIC_SCHEDULE_SAVE_MESSAGE =
  'Gagal menyimpan jadwal kerja staff karena kendala sistem.';

interface ExtractedErrorInfo {
  code: string;
  message: string;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractErrorInfo(error: unknown): ExtractedErrorInfo {
  if (typeof error === 'string') {
    return { code: '', message: error.trim() };
  }

  if (error instanceof Error) {
    const candidate = error as Error & {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    return {
      code: asText(candidate.code),
      message: [candidate.message, candidate.details, candidate.hint]
        .map(asText)
        .filter(Boolean)
        .join(' '),
    };
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>;
    return {
      code: asText(candidate.code),
      message: [candidate.message, candidate.details, candidate.hint]
        .map(asText)
        .filter(Boolean)
        .join(' '),
    };
  }

  return { code: '', message: '' };
}

function containsAny(value: string, fragments: readonly string[]): boolean {
  return fragments.some((fragment) => value.includes(fragment));
}

function staffGenericMessage(operation: StaffOperation): string {
  switch (operation) {
    case 'load':
      return GENERIC_STAFF_LOAD_MESSAGE;
    case 'save':
      return GENERIC_STAFF_SAVE_MESSAGE;
    case 'status':
      return GENERIC_STAFF_STATUS_MESSAGE;
    case 'assignment':
      return GENERIC_STAFF_ASSIGNMENT_MESSAGE;
  }
}

function scheduleGenericMessage(operation: ScheduleOperation): string {
  return operation === 'load' ? GENERIC_SCHEDULE_LOAD_MESSAGE : GENERIC_SCHEDULE_SAVE_MESSAGE;
}

export function mapStaffOperationError(error: unknown, operation: StaffOperation): string {
  const { code, message } = extractErrorInfo(error);
  const normalized = message.toLowerCase();

  if (
    code === '42501' ||
    containsAny(normalized, [
      'permission denied',
      'insufficient_privilege',
      'akses ditolak',
      'hanya owner/admin',
      'not authorized',
      'authentication required',
    ])
  ) {
    return STAFF_PERMISSION_DENIED_MESSAGE;
  }

  if (code === '23505' || normalized.includes('kode staff sudah digunakan')) {
    return STAFF_DUPLICATE_CODE_MESSAGE;
  }

  if (code === 'P0002' || normalized.includes('staff tidak ditemukan')) {
    return STAFF_NOT_FOUND_MESSAGE;
  }

  if (
    code === '22023' &&
    containsAny(normalized, ['kode staff dan nama staff wajib diisi', 'nama staff wajib diisi'])
  ) {
    return STAFF_REQUIRED_MESSAGE;
  }

  if (normalized.includes('outlet tidak ditemukan')) {
    return OUTLET_NOT_FOUND_MESSAGE;
  }

  return staffGenericMessage(operation);
}

export function mapScheduleOperationError(
  error: unknown,
  operation: ScheduleOperation
): string {
  const { code, message } = extractErrorInfo(error);
  const normalized = message.toLowerCase();

  if (
    code === '42501' ||
    containsAny(normalized, [
      'permission denied',
      'insufficient_privilege',
      'akses ditolak',
      'hanya owner/admin',
      'not authorized',
      'authentication required',
    ])
  ) {
    return SCHEDULE_PERMISSION_DENIED_MESSAGE;
  }

  if (containsAny(normalized, ['staff belum ditugaskan aktif', 'belum memiliki penugasan cabang'])) {
    return SCHEDULE_UNASSIGNED_MESSAGE;
  }

  if (normalized.includes('staff dan outlet wajib dipilih')) {
    return SCHEDULE_STAFF_REQUIRED_MESSAGE;
  }

  if (normalized.includes('staff aktif tidak ditemukan')) {
    return SCHEDULE_STAFF_NOT_FOUND_MESSAGE;
  }

  if (normalized.includes('outlet tidak ditemukan')) {
    return SCHEDULE_OUTLET_NOT_FOUND_MESSAGE;
  }

  if (
    code === '22023' ||
    containsAny(normalized, [
      'jadwal mingguan harus berisi tepat 7 hari',
      'jadwal mingguan tidak lengkap',
      'data jadwal tidak lengkap',
      'hari jadwal harus unik',
      'format jadwal tidak valid',
      'jam kerja tidak valid',
      'jam istirahat harus diisi lengkap',
      'jam istirahat tidak valid',
      'jam istirahat harus berada di dalam jam kerja',
    ])
  ) {
    return SCHEDULE_VALIDATION_MESSAGE;
  }

  return scheduleGenericMessage(operation);
}
