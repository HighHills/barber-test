export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'ARRIVED'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface Appointment {
  id: string;
  appointment_number: string;
  customer_id: string | null;
  guest_customer_name?: string | null;
  guest_customer_phone?: string | null;
  guest_customer_email?: string | null;
  outlet_id: string;
  service_id: string;
  barber_id: string;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  notes: string | null;
  created_by: string | null; // null represents public guest booking
  created_at: string;
  updated_at: string;
}

export type QueueStatus =
  | 'WAITING'
  | 'CALLED'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface Queue {
  id: string;
  queue_number: number;
  outlet_id: string;
  customer_id: string | null;
  appointment_id: string | null;
  barber_id: string | null;
  status: QueueStatus;
  joined_at: string;
  called_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}
