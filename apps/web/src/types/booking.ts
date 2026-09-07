// apps/web/src/types/booking.ts
// Type definitions for Public Customer Self-Booking Portal & WhatsApp Notification

export interface PublicOutlet {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  operating_hours: string;
}

export interface PublicService {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category_name: string;
  duration_minutes: number;
  selling_price: number;
}

export interface PublicBarber {
  id: string;
  employee_code: string;
  full_name: string;
  position: string;
  barber_position?: string;
}

export interface BookingTimeSlot {
  time_slot: string;
  is_available: boolean;
  available_barbers_count: number;
  reason: string;
}

export interface PublicBookingPayload {
  outlet_id: string;
  service_id: string;
  booking_date: string; // 'YYYY-MM-DD'
  booking_time: string; // 'HH:MM'
  customer_name: string;
  customer_phone: string;
  barber_id?: string | null;
  customer_email?: string | null;
  notes?: string | null;
}

export interface BookingConfirmation {
  success: boolean;
  appointment_id: string;
  appointment_number: string;
  customer_name: string;
  customer_phone: string;
  outlet_id: string;
  outlet_name: string;
  outlet_address: string | null;
  outlet_phone: string | null;
  service_id: string;
  service_name: string;
  duration_minutes: number;
  price: number;
  barber_id: string;
  barber_name: string;
  booking_date: string;
  booking_time: string;
  start_at: string;
  end_at: string;
  queue_number?: number | null;
  whatsapp_message: string;
}
