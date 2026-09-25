// apps/web/src/lib/booking-service.ts
// Service layer for Public Customer Self-Booking Portal

import { createClient } from './supabase/client';
import type {
  PublicOutlet,
  PublicService,
  PublicBarber,
  BookingTimeSlot,
  PublicBookingPayload,
  BookingConfirmation,
} from '../types/booking';

/**
 * Safe error classifier for public booking
 * Guarantees no raw Supabase/PostgreSQL error leaks to the public client UI.
 */
export function classifyBookingError(error: any): { code: string; message: string } {
  const rawMsg = typeof error?.message === 'string' ? error.message : '';
  const rawCode = typeof error?.code === 'string' ? error.code : '';
  const lower = (rawMsg + ' ' + rawCode).toLowerCase();

  // Rate limit
  if (
    lower.includes('rate_limit') ||
    lower.includes('terlalu banyak') ||
    lower.includes('too many') ||
    lower.includes('429')
  ) {
    return {
      code: 'RATE_LIMIT',
      message:
        'Anda sudah melakukan beberapa reservasi dalam waktu singkat. Silakan coba beberapa menit lagi.',
    };
  }

  // Duration overrun
  if (
    lower.includes('duration_overrun') ||
    lower.includes('jam tutup') ||
    lower.includes('melewati jam') ||
    lower.includes('operating hours')
  ) {
    return {
      code: 'DURATION_OVERRUN',
      message:
        'Waktu pengerjaan layanan melewati jam operasional barbershop. Silakan atur waktu kedatangan lebih awal.',
    };
  }

  // Outside operating hours
  if (
    lower.includes('outside_hours') ||
    lower.includes('di luar jam') ||
    lower.includes('outside operating')
  ) {
    return {
      code: 'OUTSIDE_HOURS',
      message:
        'Waktu booking berada di luar jam operasional barbershop. Silakan pilih waktu saat cabang beroperasi.',
    };
  }

  // Barber unavailable / schedule collision
  if (
    lower.includes('barber_unavailable') ||
    lower.includes('barber_conflict') ||
    lower.includes('sudah memiliki jadwal') ||
    lower.includes('overlapping') ||
    lower.includes('bentrok')
  ) {
    return {
      code: 'BARBER_UNAVAILABLE',
      message: 'Barber yang dipilih sudah memiliki jadwal janji temu pada jam tersebut.',
    };
  }

  // Slot taken / race condition / full
  if (
    lower.includes('slot_taken') ||
    lower.includes('slot_full') ||
    lower.includes('penuh') ||
    lower.includes('tidak tersedia') ||
    lower.includes('terisi')
  ) {
    return {
      code: 'SLOT_TAKEN',
      message:
        'Slot jam tersebut baru saja terisi oleh pelanggan lain. Silakan pilih jam kedatangan lain.',
    };
  }

  // Generic safe fallback for all other raw database/Postgres/Supabase errors
  return {
    code: 'UNKNOWN',
    message: 'Reservasi gagal diproses. Silakan pilih jadwal lain atau coba lagi.',
  };
}

/**
 * Fetch list of active public outlets
 */
export async function fetchPublicOutlets(): Promise<PublicOutlet[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_public_booking_outlets');

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching public outlets:', error.code, error.message);
    }
    throw new Error('Gagal memuat daftar cabang. Silakan coba beberapa saat lagi.');
  }

  return (data || []).map((o: any) => ({
    id: o.id,
    code: o.code,
    name: o.name,
    address: o.address || null,
    phone: o.phone || null,
    timezone: o.timezone || 'Asia/Jakarta',
    operating_hours: o.operating_hours || '09:00 - 21:00 WIB',
  })) as PublicOutlet[];
}

/**
 * Fetch available services for a specific outlet
 */
export async function fetchPublicServices(outletId: string): Promise<PublicService[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_public_booking_services', {
    p_outlet_id: outletId,
  });

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching public services:', error.code, error.message);
    }
    throw new Error('Gagal memuat daftar layanan. Silakan coba beberapa saat lagi.');
  }

  return (data || []).map((s: any) => ({
    ...s,
    selling_price: Number(s.selling_price) || 0,
    duration_minutes: Number(s.duration_minutes) || 45,
  })) as PublicService[];
}

/**
 * Fetch active barbers for an outlet
 */
export async function fetchPublicBarbers(outletId: string): Promise<PublicBarber[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_public_booking_barbers', {
    p_outlet_id: outletId,
  });

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching public barbers:', error.code, error.message);
    }
    throw new Error('Gagal memuat data barber. Silakan coba beberapa saat lagi.');
  }

  return (data || []).map((b: any) => ({
    id: b.id,
    full_name: b.full_name,
    position: b.barber_position || b.position || 'Barber / Stylist',
  })) as PublicBarber[];
}

/**
 * Fetch available booking slots for date, outlet, barber, and service
 */
export async function fetchPublicAvailableSlots(
  outletId: string,
  dateStr: string,
  barberId: string | null = null,
  serviceId: string | null = null
): Promise<BookingTimeSlot[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_public_booking_slots', {
    p_outlet_id: outletId,
    p_date: dateStr,
    p_barber_id: barberId || null,
    p_service_id: serviceId || null,
  });

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching public slots:', error.code, error.message);
    }
    throw new Error('Gagal memeriksa ketersediaan slot waktu. Silakan coba beberapa saat lagi.');
  }

  return (data || []) as BookingTimeSlot[];
}

/**
 * Submit public customer booking
 */
export async function submitPublicBooking(
  payload: PublicBookingPayload
): Promise<BookingConfirmation> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_public_booking', {
    p_outlet_id: payload.outlet_id,
    p_service_id: payload.service_id,
    p_booking_date: payload.booking_date,
    p_booking_time: payload.booking_time,
    p_customer_name: payload.customer_name,
    p_customer_phone: payload.customer_phone,
    p_barber_id: payload.barber_id || null,
    p_customer_email: payload.customer_email || null,
    p_notes: payload.notes || null,
  });

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error submitting public booking:', error.code, error.message);
    }
    const classified = classifyBookingError(error);
    const err = new Error(classified.message);
    (err as any).code = classified.code;
    throw err;
  }

  return data as BookingConfirmation;
}

/**
 * Format phone to international WhatsApp standard (e.g. 0812 -> 62812)
 */
export function formatWhatsAppPhone(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('08')) {
    return '62' + cleaned.substring(1);
  }
  if (cleaned.startsWith('8')) {
    return '62' + cleaned;
  }
  return cleaned;
}

/**
 * Generate WhatsApp URL to send or open booking ticket
 */
export function buildWhatsAppTicketUrl(phone: string, message: string): string {
  const waPhone = formatWhatsAppPhone(phone);
  const encodedMsg = encodeURIComponent(message);
  return `https://api.whatsapp.com/send?phone=${waPhone}&text=${encodedMsg}`;
}
