/**
 * Web Appointment Check-In Validator & Error Mapping Library (Phase 4E)
 * Enforces strict fail-closed validation and operational error translation for appointment check-in.
 */

export interface ValidatedCheckInData {
  queueId: string;
  queueNumber: number;
  appointmentId: string;
  appointmentNumber: string;
  status: 'WAITING';
  joinedAt: string;
}

export interface CheckInValidationResult {
  valid: boolean;
  data: ValidatedCheckInData | null;
  error: string | null;
}

/**
 * Validates authoritative RPC response for check_in_appointment_to_queue.
 * Fails closed if any required field is missing, synthetic, or malformed:
 * - queue_id: required, non-empty string, authoritative only (never fallback to record.id)
 * - queue_number: required, number, integer, > 0, authoritative only
 * - appointment_id: required, non-empty string, authoritative only (never synthesized),
 *   MUST equal expectedAppointmentId when expectedAppointmentId is supplied
 * - appointment_number: if returned, MUST be string
 * - status: required, MUST equal exactly WAITING
 * - joined_at: required, non-empty string, must parse as a valid timestamp
 *
 * Never synthesize:
 * - queue_id
 * - queue_number
 * - appointment_id
 * - joined_at
 * - status
 *
 * No fallback:
 * - record.id as queue_id
 * - queue_number = 0
 * - status = WAITING
 * - expectedAppointmentId as fallback appointment_id
 * - current timestamp
 * - generated queue ID
 */
export function validateCheckInResponse(
  payload: unknown,
  expectedAppointmentId?: string
): CheckInValidationResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      valid: false,
      data: null,
      error: 'Respons server tidak valid saat memproses check-in.',
    };
  }

  const record = payload as Record<string, unknown>;

  // queue_id: required, non-empty string, authoritative only (never fallback to record.id)
  const rawQueueId = record.queue_id;
  if (typeof rawQueueId !== 'string' || rawQueueId.trim().length === 0) {
    return {
      valid: false,
      data: null,
      error: 'Server tidak mengembalikan ID antrean yang valid.',
    };
  }
  const queueId = rawQueueId.trim();

  // queue_number: required, number, integer, > 0
  const rawQueueNumber = record.queue_number;
  if (
    typeof rawQueueNumber !== 'number' ||
    !Number.isInteger(rawQueueNumber) ||
    rawQueueNumber <= 0
  ) {
    return {
      valid: false,
      data: null,
      error: 'Server tidak mengembalikan nomor antrean yang valid.',
    };
  }
  const queueNumber = rawQueueNumber;

  // joined_at: required, non-empty string, must parse as a valid timestamp
  const rawJoinedAt = record.joined_at;
  if (typeof rawJoinedAt !== 'string' || rawJoinedAt.trim().length === 0) {
    return {
      valid: false,
      data: null,
      error: 'Server tidak mengembalikan waktu bergabung antrean (joined_at).',
    };
  }
  const joinedAtDate = new Date(rawJoinedAt);
  if (Number.isNaN(joinedAtDate.getTime())) {
    return {
      valid: false,
      data: null,
      error: 'Waktu bergabung antrean (joined_at) tidak valid.',
    };
  }
  const joinedAt = rawJoinedAt.trim();

  // status: required, MUST equal exactly WAITING
  const rawStatus = record.status;
  if (rawStatus !== 'WAITING') {
    return {
      valid: false,
      data: null,
      error: 'Status antrean dari server tidak valid (harus WAITING).',
    };
  }
  const status: 'WAITING' = 'WAITING';

  // appointment_id: required, authoritative only, non-empty string, must match requested appointment
  const rawApptId = record.appointment_id;
  if (typeof rawApptId !== 'string' || rawApptId.trim().length === 0) {
    return {
      valid: false,
      data: null,
      error: 'Server tidak mengembalikan ID janji temu yang valid pada respons antrean.',
    };
  }
  const appointmentId = rawApptId.trim();
  if (expectedAppointmentId && appointmentId !== expectedAppointmentId.trim()) {
    return {
      valid: false,
      data: null,
      error: 'ID janji temu pada respons antrean tidak cocok dengan janji temu yang diminta.',
    };
  }

  // appointment_number: if returned, MUST be string
  const rawApptNumber = record.appointment_number;
  let appointmentNumber = '';
  if (rawApptNumber !== undefined && rawApptNumber !== null) {
    if (typeof rawApptNumber !== 'string') {
      return {
        valid: false,
        data: null,
        error: 'Nomor janji temu pada respons antrean tidak valid.',
      };
    }
    appointmentNumber = rawApptNumber.trim();
  }

  return {
    valid: true,
    data: {
      queueId,
      queueNumber,
      appointmentId,
      appointmentNumber,
      status,
      joinedAt,
    },
    error: null,
  };
}

/**
 * Maps non-operational backend/database error strings into humane operational guidance.
 * Ensures SQLSTATE, BARBER_NOT_OPERATIONALLY_AVAILABLE, and raw PostgreSQL internals
 * are never exposed to the visible operator UI.
 * Unknown errors fail closed to a safe generic message.
 */
export function mapAppointmentCheckInError(rawMessage: string): string {
  if (!rawMessage || typeof rawMessage !== 'string' || rawMessage.trim().length === 0) {
    return 'Gagal melakukan check-in janji temu karena kendala sistem.';
  }

  if (rawMessage.includes('BARBER_NOT_OPERATIONALLY_AVAILABLE')) {
    return 'Kapster tidak tersedia secara operasional saat ini.';
  }
  if (rawMessage.includes('Appointment has an active queue and must be managed through queue transitions')) {
    return 'Status antrean sudah berubah. Data telah diperbarui.';
  }
  if (rawMessage.includes('sudah pernah check-in sebelumnya')) {
    return 'Janji temu ini sudah pernah melakukan check-in sebelumnya.';
  }
  if (rawMessage.includes('sudah terdaftar pada antrean aktif')) {
    return 'Janji temu ini sudah terdaftar pada antrean aktif di sistem.';
  }
  if (rawMessage.includes('Akses ditolak: pengguna tidak memiliki izin di outlet ini')) {
    return 'Akses ditolak: Anda tidak memiliki izin operasional di cabang ini.';
  }
  if (rawMessage.includes('Akses ditolak')) {
    return 'Sesi autentikasi tidak valid atau akses ditolak.';
  }
  if (rawMessage.includes('bukan merupakan barber/kapster')) {
    return 'Karyawan yang dipilih bukan merupakan kapster/barber yang valid.';
  }
  if (rawMessage.includes('Barber') && rawMessage.includes('tidak aktif')) {
    return 'Kapster yang dipilih sedang tidak aktif.';
  }
  if (rawMessage.includes('Barber') && rawMessage.includes('tidak ditemukan')) {
    return 'Kapster tidak terdaftar atau tidak ditugaskan aktif di cabang ini.';
  }
  if (
    rawMessage.includes('Status janji temu saat ini') ||
    rawMessage.includes('Status antrean saat ini') ||
    rawMessage.includes('tidak sesuai dengan yang diharapkan') ||
    rawMessage.toLowerCase().includes('conflict') ||
    rawMessage.toLowerCase().includes('stale')
  ) {
    return 'Status antrean sudah berubah. Data telah diperbarui.';
  }
  if (rawMessage.includes('tidak dapat di-check-in')) {
    return 'Hanya janji temu dengan status MENUNGGU atau TERKONFIRMASI yang dapat di-check-in.';
  }
  if (rawMessage.includes('Outlet') && rawMessage.includes('tidak aktif')) {
    return 'Cabang sedang tidak aktif.';
  }

  // Any unknown, internal PostgreSQL, SQLSTATE, or arbitrary backend error fails closed to a safe generic message
  return 'Gagal melakukan check-in janji temu karena kendala sistem.';
}
