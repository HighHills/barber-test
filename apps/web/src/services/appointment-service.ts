import { createClient } from '../lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateAppointmentInput {
  customer_id: string;
  outlet_id: string;
  service_id: string;
  barber_id: string;
  start_at: string;
  notes?: string | null;
  status?: 'PENDING' | 'CONFIRMED';
}

export interface AuthoritativeAppointment {
  id: string;
  appointment_number: string;
  customer_id: string;
  customer_name: string;
  outlet_id: string;
  service_id: string;
  service_name: string;
  barber_id: string;
  barber_name: string;
  start_at: string;
  end_at: string;
  status: 'PENDING' | 'CONFIRMED';
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// STRICT VALIDATORS (FAIL CLOSED)
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseStrictAuthoritativeUUID(val: unknown, fieldName: string): string {
  if (typeof val !== 'string' || !UUID_REGEX.test(val.trim())) {
    throw new Error(
      `Integritas UUID server tidak sah pada field "${fieldName}": ${String(val)}. Fail closed.`
    );
  }
  return val.trim();
}

function parseStrictAuthoritativeString(val: unknown, fieldName: string): string {
  if (typeof val !== 'string' || !val.trim()) {
    throw new Error(
      `Integritas string server tidak sah pada field "${fieldName}": tidak boleh kosong. Fail closed.`
    );
  }
  return val.trim();
}

function parseStrictAuthoritativeDate(val: unknown, fieldName: string): string {
  if (typeof val !== 'string' || isNaN(Date.parse(val))) {
    throw new Error(
      `Integritas timestamp server tidak sah pada field "${fieldName}": ${String(val)}. Fail closed.`
    );
  }
  return val.trim();
}

function parseAuthoritativeAppointment(payload: unknown): AuthoritativeAppointment {
  let raw: unknown = payload;

  if (typeof payload === 'string') {
    try {
      raw = JSON.parse(payload);
    } catch {
      throw new Error(
        'Format data JSON create_appointment dari server tidak valid. Fail closed.'
      );
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      'Respon create_appointment dari server tidak valid: diharapkan payload object JSON. Fail closed.'
    );
  }

  const obj = raw as Record<string, unknown>;

  const id = parseStrictAuthoritativeUUID(obj.id, 'appointment.id');
  const appointment_number = parseStrictAuthoritativeString(
    obj.appointment_number,
    'appointment.appointment_number'
  );
  const customer_id = parseStrictAuthoritativeUUID(obj.customer_id, 'appointment.customer_id');
  const customer_name = parseStrictAuthoritativeString(
    obj.customer_name,
    'appointment.customer_name'
  );
  const outlet_id = parseStrictAuthoritativeUUID(obj.outlet_id, 'appointment.outlet_id');
  const service_id = parseStrictAuthoritativeUUID(obj.service_id, 'appointment.service_id');
  const service_name = parseStrictAuthoritativeString(obj.service_name, 'appointment.service_name');
  const barber_id = parseStrictAuthoritativeUUID(obj.barber_id, 'appointment.barber_id');
  const barber_name = parseStrictAuthoritativeString(obj.barber_name, 'appointment.barber_name');
  const start_at = parseStrictAuthoritativeDate(obj.start_at, 'appointment.start_at');
  const end_at = parseStrictAuthoritativeDate(obj.end_at, 'appointment.end_at');

  if (obj.status !== 'PENDING' && obj.status !== 'CONFIRMED') {
    throw new Error(
      `Status janji temu tidak valid dari server: "${String(obj.status)}". Fail closed.`
    );
  }
  const status = obj.status;

  const notes =
    typeof obj.notes === 'string' && obj.notes.trim() ? obj.notes.trim() : null;

  const created_by = parseStrictAuthoritativeUUID(obj.created_by, 'appointment.created_by');
  const created_at = parseStrictAuthoritativeDate(obj.created_at, 'appointment.created_at');
  const updated_at = parseStrictAuthoritativeDate(obj.updated_at, 'appointment.updated_at');

  return {
    id,
    appointment_number,
    customer_id,
    customer_name,
    outlet_id,
    service_id,
    service_name,
    barber_id,
    barber_name,
    start_at,
    end_at,
    status,
    notes,
    created_by,
    created_at,
    updated_at,
  };
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client || createClient();
}

export function mapAppointmentRpcError(error: { code?: string; message?: string } | string): string {
  const msg = typeof error === 'string' ? error : error.message || '';
  const code = typeof error === 'object' && error.code ? error.code : '';

  // Intercept PostgreSQL exclusion constraint violation (code 23P01)
  if (code === '23P01' || msg.includes('exclude_overlapping_barber_appointment')) {
    return 'Tabrakan Jadwal: Barber ini sudah terisi janji temu lain di jam yang sama (Proteksi DB GIST). Silakan pilih jam atau barber lain.';
  }

  if (msg.includes('AUTH_REQUIRED')) {
    return 'Sesi login diperlukan untuk membuat janji temu.';
  }
  if (msg.includes('APPOINTMENT_REQUIRED_FIELDS_MISSING')) {
    return 'Data janji temu belum lengkap. Pastikan pelanggan, cabang, layanan, kapster, dan jam mulai telah diisi.';
  }
  if (msg.includes('INVALID_INITIAL_APPOINTMENT_STATUS')) {
    return 'Status awal janji temu tidak valid. Hanya PENDING atau CONFIRMED yang diizinkan.';
  }
  if (msg.includes('APPOINTMENT_OUTLET_ACCESS_FORBIDDEN')) {
    return 'Akses ditolak: Anda tidak memiliki izin untuk mengelola janji temu di cabang ini.';
  }
  if (msg.includes('OUTLET_NOT_FOUND')) {
    return 'Cabang tidak ditemukan dalam sistem.';
  }
  if (msg.includes('OUTLET_INACTIVE')) {
    return 'Cabang yang dipilih sedang nonaktif.';
  }
  if (msg.includes('ACTIVE_PROFILE_REQUIRED')) {
    return 'Profil pengguna aktif diperlukan untuk membuat janji temu.';
  }
  if (msg.includes('CUSTOMER_NOT_FOUND')) {
    return 'Data pelanggan tidak ditemukan.';
  }
  if (msg.includes('CUSTOMER_INACTIVE')) {
    return 'Pelanggan ini sedang berstatus nonaktif.';
  }
  if (msg.includes('SERVICE_NOT_FOUND')) {
    return 'Layanan pangkas tidak ditemukan.';
  }
  if (msg.includes('SERVICE_INACTIVE')) {
    return 'Layanan pangkas yang dipilih sedang nonaktif.';
  }
  if (msg.includes('SERVICE_DURATION_INVALID')) {
    return 'Durasi layanan pangkas tidak valid.';
  }
  if (msg.includes('BARBER_NOT_ASSIGNED_TO_OUTLET')) {
    return 'Kapster tidak ditugaskan aktif di cabang ini.';
  }
  if (msg.includes('BARBER_INACTIVE')) {
    return 'Kapster yang dipilih sedang tidak aktif.';
  }
  if (msg.includes('EMPLOYEE_IS_NOT_BARBER')) {
    return 'Karyawan yang dipilih bukan merupakan kapster/barber yang valid.';
  }
  if (msg.includes('APPOINTMENT_TIME_RANGE_INVALID')) {
    return 'Rentang waktu janji temu tidak valid.';
  }
  if (msg.includes('APPOINTMENT_NUMBER_ALLOCATION_FAILED')) {
    return 'Gagal mengalokasikan nomor janji temu unik. Silakan coba kembali.';
  }

  return msg || 'Terjadi kesalahan sistem saat membuat janji temu.';
}

// ============================================================================
// APPOINTMENT SERVICE
// ============================================================================

export const appointmentService = {
  /**
   * Creates an appointment through authoritative PostgreSQL RPC: create_appointment.
   * Strictly NO direct INSERT on appointments table.
   * Appointment number and end_at are derived/generated by the server.
   * Response is strictly validated against fail-closed contract.
   */
  async createAppointment(
    input: CreateAppointmentInput,
    client?: SupabaseClient
  ): Promise<AuthoritativeAppointment> {
    const customerId = input.customer_id?.trim();
    const outletId = input.outlet_id?.trim();
    const serviceId = input.service_id?.trim();
    const barberId = input.barber_id?.trim();
    const startAt = input.start_at?.trim();

    if (!customerId) {
      throw new Error('ID Pelanggan wajib diisi.');
    }
    if (!outletId) {
      throw new Error('ID Cabang wajib diisi.');
    }
    if (!serviceId) {
      throw new Error('ID Layanan wajib diisi.');
    }
    if (!barberId) {
      throw new Error('ID Kapster wajib diisi.');
    }
    if (!startAt || isNaN(Date.parse(startAt))) {
      throw new Error('Waktu mulai janji temu tidak valid.');
    }

    const supabase = getSupabase(client);

    const rpcPayload = {
      p_customer_id: customerId,
      p_outlet_id: outletId,
      p_service_id: serviceId,
      p_barber_id: barberId,
      p_start_at: startAt,
      p_notes: input.notes?.trim() || null,
      p_status: input.status || 'CONFIRMED',
    };

    const { data, error } = await supabase.rpc('create_appointment', rpcPayload);

    if (error) {
      const friendlyMsg = mapAppointmentRpcError(error);
      throw new Error(friendlyMsg);
    }

    if (!data) {
      throw new Error('Server tidak mengembalikan data janji temu baru. Fail closed.');
    }

    return parseAuthoritativeAppointment(data);
  },
};
