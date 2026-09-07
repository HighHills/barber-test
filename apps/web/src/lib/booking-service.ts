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
 * Fetch list of active public outlets
 */
export async function fetchPublicOutlets(): Promise<PublicOutlet[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_public_booking_outlets');

  if (error) {
    console.error('Error fetching public outlets:', error);
    throw new Error(error.message || 'Gagal memuat daftar cabang');
  }

  return (data || []) as PublicOutlet[];
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
    console.error('Error fetching public services:', error);
    throw new Error(error.message || 'Gagal memuat daftar layanan');
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
    console.error('Error fetching public barbers:', error);
    throw new Error(error.message || 'Gagal memuat data barber');
  }

  return (data || []).map((b: any) => ({
    id: b.id,
    employee_code: b.employee_code,
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
    console.error('Error fetching public slots:', error);
    throw new Error(error.message || 'Gagal memeriksa slot waktu');
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
    console.error('Error submitting public booking:', error);
    throw new Error(error.message || 'Gagal memproses reservasi');
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
