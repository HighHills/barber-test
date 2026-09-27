/**
 * Barbershop Operating System — Web Barber Parser & Validation
 * Strictly enforces authoritative RPC contract and fail-closed rules
 * for public.get_outlet_barber_availability(p_outlet_id uuid)
 */

import {
  BarberEmployee,
  RawBarberAvailabilityRow,
  isValidBarberAvailabilityStatus,
} from '../types/pos';

export interface ParseBarbersResult {
  barbers: BarberEmployee[];
  error: string | null;
}

/**
 * Validates and transforms raw RPC response rows into typed BarberEmployee models.
 * Strictly enforces fail-closed validation:
 * 1. Non-array data -> fail closed
 * 2. Missing employee_id -> fail closed
 * 3. Outlet mismatch -> fail closed
 * 4. Duplicate employee_id -> fail closed
 * 5. Invalid availability_status -> fail closed
 * 6. Incomplete operational metadata -> fail closed
 */
export function parseAuthoritativeBarbers(
  data: unknown,
  outletId: string
): ParseBarbersResult {
  const trimmedOutletId = outletId?.trim();
  if (!trimmedOutletId) {
    return { barbers: [], error: 'ID Cabang tidak valid.' };
  }

  if (!data || !Array.isArray(data)) {
    return {
      barbers: [],
      error: 'Data ketersediaan kapster tidak valid dari server.',
    };
  }

  const rows = data as RawBarberAvailabilityRow[];
  const seen = new Set<string>();
  const nextBarbers: BarberEmployee[] = [];

  for (const row of rows) {
    // Validation 1: Required employee_id
    if (!row.employee_id || typeof row.employee_id !== 'string') {
      return {
        barbers: [],
        error: 'Data kapster tidak konsisten: employee_id wajib ada.',
      };
    }

    // Validation 2: Fail closed if outlet_id does not match requested outlet
    if (row.outlet_id !== trimmedOutletId) {
      return {
        barbers: [],
        error: 'Data ketersediaan kapster tidak sesuai dengan cabang yang sedang aktif.',
      };
    }

    // Validation 3: Duplicate employee detection
    if (seen.has(row.employee_id)) {
      return {
        barbers: [],
        error: 'Data kapster tidak konsisten: ditemukan duplikasi penugasan.',
      };
    }
    seen.add(row.employee_id);

    // Validation 4: Fail closed if availability_status is outside enum contract
    if (!isValidBarberAvailabilityStatus(row.availability_status)) {
      return {
        barbers: [],
        error: `Data ketersediaan kapster tidak valid: status "${row.availability_status}" di luar kontrak.`,
      };
    }

    // Validation 5: Incomplete operational metadata
    if (
      row.outlet_timezone == null ||
      row.observed_at == null ||
      row.local_date == null ||
      row.local_time == null ||
      row.day_of_week == null
    ) {
      return {
        barbers: [],
        error: 'Data ketersediaan kapster tidak konsisten: metadata operasional server tidak lengkap.',
      };
    }

    // Filter: employee must be active AND assignment must be active
    if (!row.employee_is_active || !row.assignment_is_active) {
      continue;
    }

    // Filter: semantic barber / kapster position
    const position = (row.barber_position || '').trim().toLowerCase();
    const isBarber = position.includes('barber') || position.includes('kapster');
    if (!isBarber) {
      continue;
    }

    // In Phase 4A: all active barbers with active assignments are included regardless of whether they are SHIFT_ACTIVE, UNCONFIGURED, DAY_OFF, OUTSIDE_SHIFT, ON_BREAK, ON_LEAVE
    nextBarbers.push({
      id: row.employee_id,
      employee_code: row.employee_code || 'BARBER',
      full_name: (row.full_name || '').trim(),
      position: row.barber_position || 'Kapster',
      is_active: Boolean(row.employee_is_active),
      availability_status: row.availability_status,
      is_available_now: Boolean(row.is_available_now),
      schedule_configured: Boolean(row.schedule_configured),
      today_schedule_active: Boolean(row.today_schedule_active),
      shift_start: row.shift_start ? row.shift_start.slice(0, 5) : null,
      shift_end: row.shift_end ? row.shift_end.slice(0, 5) : null,
      break_start: row.break_start ? row.break_start.slice(0, 5) : null,
      break_end: row.break_end ? row.break_end.slice(0, 5) : null,
      observed_at: row.observed_at,
      outlet_timezone: row.outlet_timezone,
      local_date: row.local_date,
      local_time: row.local_time,
      day_of_week: Number(row.day_of_week),
    });
  }

  nextBarbers.sort((a, b) => a.full_name.localeCompare(b.full_name));
  return { barbers: nextBarbers, error: null };
}
