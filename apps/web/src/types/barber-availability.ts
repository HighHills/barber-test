/**
 * Barbershop Operating System — Web Barber Availability Contract
 * Strictly adheres to backend authoritative RPC: public.get_outlet_barber_availability(p_outlet_id uuid)
 */

export type BarberAvailabilityStatus =
  | 'SHIFT_ACTIVE'
  | 'ON_BREAK'
  | 'OUTSIDE_SHIFT'
  | 'DAY_OFF'
  | 'ON_LEAVE'
  | 'UNCONFIGURED'
  | 'INACTIVE';

export const BARBER_AVAILABILITY_STATUSES: readonly BarberAvailabilityStatus[] = [
  'SHIFT_ACTIVE',
  'ON_BREAK',
  'OUTSIDE_SHIFT',
  'DAY_OFF',
  'ON_LEAVE',
  'UNCONFIGURED',
  'INACTIVE',
] as const;

export function isValidBarberAvailabilityStatus(
  status: unknown
): status is BarberAvailabilityStatus {
  if (typeof status !== 'string') return false;
  return (BARBER_AVAILABILITY_STATUSES as readonly string[]).includes(status);
}

export const BARBER_AVAILABILITY_LABELS: Record<BarberAvailabilityStatus, string> = {
  SHIFT_ACTIVE: 'Sedang Bertugas',
  ON_BREAK: 'Sedang Istirahat',
  OUTSIDE_SHIFT: 'Di Luar Shift',
  DAY_OFF: 'Hari Libur',
  ON_LEAVE: 'Sedang Cuti',
  UNCONFIGURED: 'Jadwal Belum Diatur',
  INACTIVE: 'Nonaktif',
};

export type BarberAvailabilityVariant = 'success' | 'warning' | 'info' | 'neutral' | 'error';

export const BARBER_AVAILABILITY_VARIANTS: Record<BarberAvailabilityStatus, BarberAvailabilityVariant> = {
  SHIFT_ACTIVE: 'success',
  ON_BREAK: 'warning',
  OUTSIDE_SHIFT: 'neutral',
  DAY_OFF: 'neutral',
  ON_LEAVE: 'neutral',
  UNCONFIGURED: 'warning',
  INACTIVE: 'neutral',
};

/**
 * Visual badge CSS classes (Tailwind) matching visual semantics
 */
export const BARBER_AVAILABILITY_BADGE_CLASSES: Record<BarberAvailabilityStatus, string> = {
  SHIFT_ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20',
  ON_BREAK: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20',
  ON_LEAVE: 'bg-sky-50 text-sky-700 border-sky-200 ring-sky-500/20',
  OUTSIDE_SHIFT: 'bg-slate-100 text-slate-600 border-slate-200 ring-slate-400/20',
  DAY_OFF: 'bg-slate-100 text-slate-600 border-slate-200 ring-slate-400/20',
  UNCONFIGURED: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20',
  INACTIVE: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20',
};

/**
 * Raw response row returned from public.get_outlet_barber_availability RPC
 */
export interface RawBarberAvailabilityRow {
  employee_id: string;
  employee_code: string | null;
  full_name: string | null;
  barber_position: string | null;
  outlet_id: string;
  outlet_timezone: string;
  employee_is_active: boolean;
  assignment_is_active: boolean;
  availability_status: string;
  is_available_now: boolean;
  observed_at: string;
  local_date: string;
  local_time: string;
  day_of_week: number;
  schedule_configured: boolean;
  today_schedule_active: boolean;
  shift_start: string | null;
  shift_end: string | null;
  break_start: string | null;
  break_end: string | null;
}
