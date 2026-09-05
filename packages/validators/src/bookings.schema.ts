import { z } from 'zod';

export const createAppointmentSchema = z.object({
  customer_id: z.string().uuid(),
  outlet_id: z.string().uuid(),
  service_id: z.string().uuid(),
  barber_id: z.string().uuid(),
  start_at: z.string(),
  end_at: z.string(),
  notes: z.string().nullable().optional(),
}).refine(
  (data) => new Date(data.end_at) > new Date(data.start_at),
  { message: 'End time must be after start time' }
);

export const createPublicGuestBookingSchema = z.object({
  customer_name: z.string().min(2, 'Name must be at least 2 characters'),
  customer_phone: z.string().min(8, 'Phone number must be at least 8 digits'),
  outlet_id: z.string().uuid(),
  service_id: z.string().uuid(),
  barber_id: z.string().uuid(),
  start_at: z.string(),
  notes: z.string().nullable().optional(),
});
