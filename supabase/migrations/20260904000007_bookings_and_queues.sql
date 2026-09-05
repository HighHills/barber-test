-- 20260904000007_bookings_and_queues.sql
-- Appointments with PostgreSQL Exclusion Constraint Collision Guard, and Real-time Queues

-- 40. appointments
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  barber_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status appointment_status_enum NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL, -- NULL = public guest booking
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_appointment_times CHECK (end_at > start_at),
  -- Database-level race-condition prevention: No two active appointments for the same barber can overlap
  CONSTRAINT exclude_overlapping_barber_appointment
  EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status NOT IN ('CANCELLED', 'NO_SHOW'))
);

CREATE INDEX idx_appointments_outlet_start ON appointments(outlet_id, start_at);
CREATE INDEX idx_appointments_barber_start ON appointments(barber_id, start_at);

-- 41. queues
CREATE TABLE queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_number INT NOT NULL,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  barber_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  status queue_status_enum NOT NULL DEFAULT 'WAITING',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  called_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_queues_outlet_status ON queues(outlet_id, status, joined_at);
