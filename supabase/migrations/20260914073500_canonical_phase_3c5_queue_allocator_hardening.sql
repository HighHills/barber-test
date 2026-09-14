-- ============================================================================
-- CANONICAL MIGRATION: PHASE 3C.5 QUEUE ALLOCATOR & WALK-IN HARDENING
-- Version: 20260914073500 (Timestamp > 20260914064739)
--
-- Target Production Deployment:
--   Follows the latest verified production migration 20260914064739.
--   Reconciles the final authoritative state for Phase 3C.5 without relying
--   on unapplied historical development migrations (000001, 000002, 000003).
--
-- Key Components:
--   1. Schema private and shared queue number allocator with PostgreSQL
--      transaction advisory lock (hash-based on outlet_id and business_date).
--   2. Authoritative RPC public.create_walk_in_queue for atomic walk-in creation.
--   3. Authoritative RPC public.check_in_appointment_to_queue aligned to the
--      same shared allocator.
--   4. Strict barber position validation: requires active employee, active
--      outlet assignment, and position matching barber/kapster semantics.
--   5. Hardened SECURITY DEFINER search_path = '' with full schema qualification.
--   6. Privilege lockdown: Revoke INSERT and UPDATE on public.queues from
--      authenticated and anon; grant EXECUTE on public RPCs to authenticated;
--      restrict private allocator to service_role only.
--   7. Automated verification and assertion block.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Private Internal Schema & Shared Queue Number Allocator
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.allocate_queue_number(
  p_outlet_id UUID,
  OUT allocated_number INT,
  OUT start_of_day TIMESTAMPTZ,
  OUT business_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_timezone pg_catalog.text;
BEGIN
  -- 1. Fetch outlet timezone
  SELECT timezone INTO v_timezone
  FROM public.outlets
  WHERE id = p_outlet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outlet % tidak ditemukan', p_outlet_id
      USING ERRCODE = '22023';
  END IF;

  v_timezone := pg_catalog.coalesce(v_timezone, 'Asia/Jakarta');

  -- 2. Determine business date and start of day for this outlet
  business_date := (pg_catalog.clock_timestamp() AT TIME ZONE v_timezone)::pg_catalog.date;
  start_of_day := ((business_date::pg_catalog.text || ' 00:00:00')::pg_catalog.timestamp AT TIME ZONE v_timezone);

  -- 3. Acquire transaction-scoped advisory lock for outlet + business date
  -- Both walk-in and appointment check-in serialize on this exact same lock key.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('queue-number-allocator:' || p_outlet_id::pg_catalog.text || ':' || business_date::pg_catalog.text, 0)
  );

  -- 4. Calculate next sequential queue number
  SELECT pg_catalog.coalesce(pg_catalog.max(q.queue_number), 0) + 1
  INTO allocated_number
  FROM public.queues q
  WHERE q.outlet_id = p_outlet_id
    AND q.joined_at >= start_of_day;
END;
$$;

REVOKE ALL ON FUNCTION private.allocate_queue_number(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.allocate_queue_number(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Authoritative RPC: create_walk_in_queue (SECURITY DEFINER, search_path = '')
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_walk_in_queue(
  p_outlet_id UUID,
  p_customer_id UUID,
  p_barber_id UUID DEFAULT NULL
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor pg_catalog.uuid;
  v_outlet RECORD;
  v_customer RECORD;
  v_barber RECORD;
  v_alloc RECORD;
  v_queue_id pg_catalog.uuid;
  v_joined_at pg_catalog.timestamptz := pg_catalog.clock_timestamp();
BEGIN
  -- 1. Authentication check
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: pengguna tidak terautentikasi'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Outlet authorization check
  IF NOT public.current_user_has_outlet_access(p_outlet_id) THEN
    RAISE EXCEPTION 'Akses ditolak: pengguna tidak memiliki izin di outlet ini'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Outlet existence & active validation
  SELECT id, name, is_active, timezone
  INTO v_outlet
  FROM public.outlets
  WHERE id = p_outlet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outlet % tidak ditemukan', p_outlet_id
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_outlet.is_active THEN
    RAISE EXCEPTION 'Outlet % sedang tidak aktif', v_outlet.name
      USING ERRCODE = '22023';
  END IF;

  -- 4. Customer existence & active validation
  SELECT id, full_name, is_active
  INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pelanggan % tidak ditemukan', p_customer_id
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_customer.is_active THEN
    RAISE EXCEPTION 'Pelanggan % sedang tidak aktif', v_customer.full_name
      USING ERRCODE = '22023';
  END IF;

  -- 5. Barber validation (optional)
  IF p_barber_id IS NOT NULL THEN
    SELECT e.id, e.full_name, e.position, e.is_active
    INTO v_barber
    FROM public.employees e
    JOIN public.employee_outlets eo ON eo.employee_id = e.id AND eo.outlet_id = p_outlet_id AND eo.is_active = TRUE
    WHERE e.id = p_barber_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barber % tidak ditemukan atau tidak ditugaskan aktif di outlet ini', p_barber_id
        USING ERRCODE = '22023';
    END IF;

    IF NOT v_barber.is_active THEN
      RAISE EXCEPTION 'Barber % sedang tidak aktif', v_barber.full_name
        USING ERRCODE = '22023';
    END IF;

    IF NOT (
      pg_catalog.lower(v_barber.position) LIKE '%barber%'
      OR pg_catalog.lower(v_barber.position) LIKE '%kapster%'
    ) THEN
      RAISE EXCEPTION 'Karyawan % bukan merupakan barber/kapster (posisi: %)', v_barber.full_name, v_barber.position
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 6. Allocate queue number using shared serialized lock
  SELECT * INTO v_alloc FROM private.allocate_queue_number(p_outlet_id);

  -- 7. Insert queue record atomically
  INSERT INTO public.queues (
    queue_number,
    outlet_id,
    customer_id,
    appointment_id,
    barber_id,
    status,
    joined_at
  ) VALUES (
    v_alloc.allocated_number,
    p_outlet_id,
    p_customer_id,
    NULL,
    p_barber_id,
    'WAITING'::public.queue_status_enum,
    v_joined_at
  )
  RETURNING id INTO v_queue_id;

  -- 8. Return created queue details
  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'queue_id', v_queue_id,
    'queue_number', v_alloc.allocated_number,
    'outlet_id', p_outlet_id,
    'customer_id', p_customer_id,
    'customer_name', v_customer.full_name,
    'barber_id', p_barber_id,
    'status', 'WAITING',
    'joined_at', v_joined_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_walk_in_queue(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_walk_in_queue(UUID, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_walk_in_queue(UUID, UUID, UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Authoritative RPC Alignment: check_in_appointment_to_queue (SECURITY DEFINER, search_path = '')
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_in_appointment_to_queue(
  p_appointment_id UUID,
  p_outlet_id UUID,
  p_barber_id UUID DEFAULT NULL
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor pg_catalog.uuid;
  v_outlet RECORD;
  v_apt RECORD;
  v_barber RECORD;
  v_effective_barber_id pg_catalog.uuid;
  v_alloc RECORD;
  v_queue_id pg_catalog.uuid;
  v_joined_at pg_catalog.timestamptz := pg_catalog.clock_timestamp();
BEGIN
  -- 1. Authentication check
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: pengguna tidak terautentikasi'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Outlet authorization check
  IF NOT public.current_user_has_outlet_access(p_outlet_id) THEN
    RAISE EXCEPTION 'Akses ditolak: pengguna tidak memiliki izin di outlet ini'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Outlet existence & active validation
  SELECT id, name, is_active, timezone
  INTO v_outlet
  FROM public.outlets
  WHERE id = p_outlet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outlet % tidak ditemukan', p_outlet_id
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_outlet.is_active THEN
    RAISE EXCEPTION 'Outlet % sedang tidak aktif', v_outlet.name
      USING ERRCODE = '22023';
  END IF;

  -- 4. Appointment validation with row lock
  SELECT id, appointment_number, customer_id, barber_id, service_id, status, start_at
  INTO v_apt
  FROM public.appointments
  WHERE id = p_appointment_id AND outlet_id = p_outlet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Janji temu % tidak ditemukan pada outlet ini', p_appointment_id
      USING ERRCODE = '22023';
  END IF;

  IF v_apt.status = 'ARRIVED'::public.appointment_status_enum THEN
    RAISE EXCEPTION 'Janji temu #% sudah pernah check-in sebelumnya', v_apt.appointment_number
      USING ERRCODE = '22023';
  END IF;

  IF v_apt.status NOT IN ('PENDING'::public.appointment_status_enum, 'CONFIRMED'::public.appointment_status_enum) THEN
    RAISE EXCEPTION 'Janji temu #% dengan status % tidak dapat di-check-in', v_apt.appointment_number, v_apt.status
      USING ERRCODE = '22023';
  END IF;

  -- Prevent duplicate active queue for this appointment
  IF EXISTS (
    SELECT 1 FROM public.queues
    WHERE appointment_id = p_appointment_id
      AND status NOT IN ('CANCELLED'::public.queue_status_enum, 'NO_SHOW'::public.queue_status_enum)
  ) THEN
    RAISE EXCEPTION 'Janji temu #% sudah terdaftar pada antrean aktif', v_apt.appointment_number
      USING ERRCODE = '23505';
  END IF;

  -- 5. Barber resolution & validation
  v_effective_barber_id := pg_catalog.coalesce(p_barber_id, v_apt.barber_id);
  IF v_effective_barber_id IS NOT NULL THEN
    SELECT e.id, e.full_name, e.position, e.is_active
    INTO v_barber
    FROM public.employees e
    JOIN public.employee_outlets eo ON eo.employee_id = e.id AND eo.outlet_id = p_outlet_id AND eo.is_active = TRUE
    WHERE e.id = v_effective_barber_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barber % tidak ditemukan atau tidak ditugaskan aktif di outlet ini', v_effective_barber_id
        USING ERRCODE = '22023';
    END IF;

    IF NOT v_barber.is_active THEN
      RAISE EXCEPTION 'Barber % sedang tidak aktif', v_barber.full_name
        USING ERRCODE = '22023';
    END IF;

    IF NOT (
      pg_catalog.lower(v_barber.position) LIKE '%barber%'
      OR pg_catalog.lower(v_barber.position) LIKE '%kapster%'
    ) THEN
      RAISE EXCEPTION 'Karyawan % bukan merupakan barber/kapster (posisi: %)', v_barber.full_name, v_barber.position
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 6. Allocate queue number using shared serialized lock
  SELECT * INTO v_alloc FROM private.allocate_queue_number(p_outlet_id);

  -- 7. Insert queue record atomically
  INSERT INTO public.queues (
    queue_number,
    outlet_id,
    customer_id,
    appointment_id,
    barber_id,
    status,
    joined_at
  ) VALUES (
    v_alloc.allocated_number,
    p_outlet_id,
    v_apt.customer_id,
    v_apt.id,
    v_effective_barber_id,
    'WAITING'::public.queue_status_enum,
    v_joined_at
  )
  RETURNING id INTO v_queue_id;

  -- 8. Transition appointment status to ARRIVED
  UPDATE public.appointments
  SET status = 'ARRIVED'::public.appointment_status_enum, updated_at = pg_catalog.clock_timestamp()
  WHERE id = v_apt.id;

  -- 9. Return composite check-in receipt
  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'queue_id', v_queue_id,
    'queue_number', v_alloc.allocated_number,
    'appointment_id', v_apt.id,
    'appointment_number', v_apt.appointment_number,
    'status', 'WAITING',
    'joined_at', v_joined_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_appointment_to_queue(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_in_appointment_to_queue(UUID, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_in_appointment_to_queue(UUID, UUID, UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Enforce Table Privilege Lockdown on public.queues
-- ----------------------------------------------------------------------------
REVOKE INSERT, UPDATE ON TABLE public.queues FROM authenticated;
REVOKE INSERT, UPDATE ON TABLE public.queues FROM anon;

GRANT SELECT ON TABLE public.queues TO authenticated;
GRANT ALL ON TABLE public.queues TO service_role;

COMMENT ON TABLE public.queues IS
  'Live queues table. Direct client INSERT/UPDATE revoked; queue creation requires create_walk_in_queue or check_in_appointment_to_queue RPCs, and status transitions require transition_queue_status RPC.';

-- ----------------------------------------------------------------------------
-- 5. Automated Privilege & Security Assertions
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- 1. Check create_walk_in_queue privileges
  IF NOT has_function_privilege('authenticated', 'public.create_walk_in_queue(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated cannot EXECUTE create_walk_in_queue';
  END IF;

  IF has_function_privilege('anon', 'public.create_walk_in_queue(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: anon has EXECUTE on create_walk_in_queue';
  END IF;

  -- 2. Check check_in_appointment_to_queue privileges
  IF NOT has_function_privilege('authenticated', 'public.check_in_appointment_to_queue(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated cannot EXECUTE check_in_appointment_to_queue';
  END IF;

  IF has_function_privilege('anon', 'public.check_in_appointment_to_queue(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: anon has EXECUTE on check_in_appointment_to_queue';
  END IF;

  -- 3. Check queues table INSERT lockdown
  IF has_table_privilege('authenticated', 'public.queues', 'INSERT') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated still has INSERT on public.queues';
  END IF;

  IF has_table_privilege('anon', 'public.queues', 'INSERT') THEN
    RAISE EXCEPTION 'Security assertion failed: anon still has INSERT on public.queues';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.queues', 'INSERT') THEN
    RAISE EXCEPTION 'Security assertion failed: service_role lost INSERT on public.queues';
  END IF;

  -- 4. Check queues table UPDATE lockdown
  IF has_table_privilege('authenticated', 'public.queues', 'UPDATE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated still has UPDATE on public.queues';
  END IF;

  IF has_table_privilege('anon', 'public.queues', 'UPDATE') THEN
    RAISE EXCEPTION 'Security assertion failed: anon still has UPDATE on public.queues';
  END IF;

  -- 5. Check private.allocate_queue_number privileges
  IF has_function_privilege('anon', 'private.allocate_queue_number(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: anon has EXECUTE on private.allocate_queue_number';
  END IF;

  IF has_function_privilege('authenticated', 'private.allocate_queue_number(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated has EXECUTE on private.allocate_queue_number';
  END IF;

  IF NOT has_function_privilege('service_role', 'private.allocate_queue_number(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: service_role lost EXECUTE on private.allocate_queue_number';
  END IF;
END;
$$;
