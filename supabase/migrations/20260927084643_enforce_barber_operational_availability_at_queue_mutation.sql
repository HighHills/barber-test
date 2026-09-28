-- 20260927084643_enforce_barber_operational_availability_at_queue_mutation.sql
-- Phase 4B: Enforce Authoritative Barber Operational Availability at Queue Mutation Boundaries

-- ============================================================================
-- 0. Purge any errant overload if previously created in development
-- ============================================================================
DROP FUNCTION IF EXISTS private.transition_queue_status_internal(uuid, uuid, text, text, uuid);

-- ============================================================================
-- 1. Helper function: private.assert_barber_operationally_available
-- ============================================================================
CREATE OR REPLACE FUNCTION private.assert_barber_operationally_available(
  p_outlet_id uuid,
  p_barber_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_availability RECORD;
BEGIN
  IF p_outlet_id IS NULL OR p_barber_id IS NULL THEN
    RAISE EXCEPTION 'BARBER_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_availability
  FROM public.get_outlet_barber_availability(p_outlet_id)
  WHERE employee_id = p_barber_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BARBER_NOT_FOUND_OR_NOT_ASSIGNED'
      USING ERRCODE = '22023';
  END IF;

  IF v_availability.availability_status <> 'SHIFT_ACTIVE' THEN
    RAISE EXCEPTION 'BARBER_NOT_OPERATIONALLY_AVAILABLE: %', v_availability.availability_status
      USING ERRCODE = 'P0006';
  END IF;

  RETURN v_availability.availability_status;
END;
$$;

-- Must NOT grant EXECUTE to service_role/authenticated/anon/public

-- ============================================================================
-- 2. Authoritative Walk-in Queue Creation Enforcement
-- ============================================================================
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

  -- 5. Barber validation & Phase 4B Operational Availability Enforcement
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

    -- Phase 4B: Assert authoritative operational availability (must be SHIFT_ACTIVE)
    PERFORM private.assert_barber_operationally_available(p_outlet_id, p_barber_id);
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

-- ============================================================================
-- 3. Authoritative Queue Status Transition Enforcement (Internal)
-- ============================================================================
CREATE OR REPLACE FUNCTION private.transition_queue_status_internal(
  p_queue_id uuid,
  p_outlet_id uuid,
  p_target_status public.queue_status_enum,
  p_expected_current_status public.queue_status_enum DEFAULT NULL,
  p_barber_id uuid DEFAULT NULL
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor pg_catalog.uuid;
  v_queue public.queues%rowtype;
  v_now timestamptz := statement_timestamp();
  v_appointment_status public.appointment_status_enum;
  v_appointment public.appointments%rowtype;
  v_barber RECORD;
  v_effective_barber_id pg_catalog.uuid;
  v_advisory_key pg_catalog.int8;
  v_rows_updated integer;
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

  -- 3. Fetch and lock queue row
  SELECT *
  INTO v_queue
  FROM public.queues
  WHERE id = p_queue_id AND outlet_id = p_outlet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUEUE_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Optional expected-current-status validation
  IF p_expected_current_status IS NOT NULL AND v_queue.status IS DISTINCT FROM p_expected_current_status THEN
    RAISE EXCEPTION 'Status antrean saat ini (%) tidak sesuai dengan yang diharapkan (%)',
      v_queue.status, p_expected_current_status
      USING ERRCODE = '22023';
  END IF;

  -- 5. Exact existing queue state machine
  IF v_queue.status = 'WAITING'::public.queue_status_enum THEN
    IF p_target_status NOT IN ('CALLED'::public.queue_status_enum, 'CANCELLED'::public.queue_status_enum) THEN
      RAISE EXCEPTION 'INVALID_QUEUE_TRANSITION: % to %', v_queue.status, p_target_status
        USING ERRCODE = '22023';
    END IF;
  ELSIF v_queue.status = 'CALLED'::public.queue_status_enum THEN
    IF p_target_status NOT IN ('IN_SERVICE'::public.queue_status_enum, 'NO_SHOW'::public.queue_status_enum, 'CANCELLED'::public.queue_status_enum) THEN
      RAISE EXCEPTION 'INVALID_QUEUE_TRANSITION: % to %', v_queue.status, p_target_status
        USING ERRCODE = '22023';
    END IF;
  ELSIF v_queue.status = 'IN_SERVICE'::public.queue_status_enum THEN
    IF p_target_status <> 'COMPLETED'::public.queue_status_enum THEN
      RAISE EXCEPTION 'INVALID_QUEUE_TRANSITION: % to %', v_queue.status, p_target_status
        USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'TERMINAL_QUEUE_STATUS: %', v_queue.status
      USING ERRCODE = '22023';
  END IF;

  -- 6. Non-CALLED barber assignment rejection
  IF p_target_status <> 'CALLED'::public.queue_status_enum THEN
    IF p_barber_id IS NOT NULL THEN
      RAISE EXCEPTION 'Barber assignment is only allowed when transitioning to CALLED'
        USING ERRCODE = 'P0004';
    END IF;
    v_effective_barber_id := v_queue.barber_id;
  ELSE
    -- 7. CALLED validations
    IF p_barber_id IS NULL THEN
      RAISE EXCEPTION 'BARBER_REQUIRED'
        USING ERRCODE = '22023';
    END IF;

    -- Validate active barber assignment
    SELECT e.id, e.full_name, e.position, e.is_active
    INTO v_barber
    FROM public.employees e
    JOIN public.employee_outlets eo
      ON eo.employee_id = e.id
     AND eo.outlet_id = p_outlet_id
     AND eo.is_active = TRUE
    WHERE e.id = p_barber_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'BARBER_NOT_FOUND_OR_NOT_ASSIGNED'
        USING ERRCODE = '22023';
    END IF;

    IF NOT v_barber.is_active THEN
      RAISE EXCEPTION 'BARBER_INACTIVE'
        USING ERRCODE = '22023';
    END IF;

    -- Semantic barber/kapster validation
    IF NOT (
      pg_catalog.lower(v_barber.position) LIKE '%barber%'
      OR pg_catalog.lower(v_barber.position) LIKE '%kapster%'
    ) THEN
      RAISE EXCEPTION 'INVALID_BARBER_ROLE'
        USING ERRCODE = '22023';
    END IF;

    -- Operational availability assertion (Phase 4B)
    PERFORM private.assert_barber_operationally_available(p_outlet_id, p_barber_id);

    -- Advisory lock
    v_advisory_key := pg_catalog.hashtextextended('queue-barber-assignment:' || p_outlet_id::text || ':' || p_barber_id::text, 0);
    PERFORM pg_catalog.pg_advisory_xact_lock(v_advisory_key);

    -- Duplicate active barber assignment protection
    IF EXISTS (
      SELECT 1
      FROM public.queues
      WHERE outlet_id = p_outlet_id
        AND barber_id = p_barber_id
        AND status IN ('CALLED'::public.queue_status_enum, 'IN_SERVICE'::public.queue_status_enum)
        AND id <> p_queue_id
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_ACTIVE_BARBER_ASSIGNMENT'
        USING ERRCODE = '22023';
    END IF;

    v_effective_barber_id := p_barber_id;
  END IF;

  -- 8. Linked appointment consistency check
  IF v_queue.appointment_id IS NOT NULL THEN
    SELECT *
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_queue.appointment_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'LINKED_APPOINTMENT_NOT_FOUND'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_appointment.outlet_id <> p_outlet_id THEN
      RAISE EXCEPTION 'LINKED_APPOINTMENT_OUTLET_MISMATCH'
        USING ERRCODE = '22023';
    END IF;

    IF v_appointment.barber_id IS NOT NULL AND v_appointment.barber_id <> v_effective_barber_id THEN
      RAISE EXCEPTION 'LINKED_APPOINTMENT_BARBER_MISMATCH'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 9. Update queue row with timestamps
  UPDATE public.queues
  SET
    status = p_target_status,
    barber_id = v_effective_barber_id,
    called_at = CASE WHEN p_target_status = 'CALLED'::public.queue_status_enum AND called_at IS NULL THEN v_now ELSE called_at END,
    started_at = CASE WHEN p_target_status = 'IN_SERVICE'::public.queue_status_enum AND started_at IS NULL THEN v_now ELSE started_at END,
    completed_at = CASE WHEN p_target_status IN ('COMPLETED'::public.queue_status_enum, 'CANCELLED'::public.queue_status_enum, 'NO_SHOW'::public.queue_status_enum) AND completed_at IS NULL THEN v_now ELSE completed_at END
  WHERE id = p_queue_id;

  -- 10. Linked appointment status synchronization & failed update protection
  IF v_queue.appointment_id IS NOT NULL THEN
    v_appointment_status := CASE
      WHEN p_target_status = 'IN_SERVICE'::public.queue_status_enum THEN 'IN_SERVICE'::public.appointment_status_enum
      WHEN p_target_status = 'COMPLETED'::public.queue_status_enum THEN 'COMPLETED'::public.appointment_status_enum
      WHEN p_target_status = 'CANCELLED'::public.queue_status_enum THEN 'CANCELLED'::public.appointment_status_enum
      WHEN p_target_status = 'NO_SHOW'::public.queue_status_enum THEN 'NO_SHOW'::public.appointment_status_enum
      ELSE NULL
    END;

    IF v_appointment_status IS NOT NULL THEN
      UPDATE public.appointments
      SET
        status = v_appointment_status,
        barber_id = COALESCE(v_effective_barber_id, barber_id),
        updated_at = v_now
      WHERE id = v_queue.appointment_id;

      GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
      IF v_rows_updated = 0 THEN
        RAISE EXCEPTION 'LINKED_APPOINTMENT_UPDATE_FAILED'
          USING ERRCODE = 'P0002';
      END IF;
    ELSIF v_effective_barber_id IS NOT NULL AND v_appointment.barber_id IS NULL THEN
      UPDATE public.appointments
      SET
        barber_id = v_effective_barber_id,
        updated_at = v_now
      WHERE id = v_queue.appointment_id;

      GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
      IF v_rows_updated = 0 THEN
        RAISE EXCEPTION 'LINKED_APPOINTMENT_UPDATE_FAILED'
          USING ERRCODE = 'P0002';
      END IF;
    END IF;
  END IF;

  -- 11. Return receipt contract
  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'queue_id', p_queue_id,
    'outlet_id', p_outlet_id,
    'status', p_target_status::text,
    'barber_id', v_effective_barber_id
  );
END;
$$;

REVOKE ALL ON FUNCTION private.transition_queue_status_internal(uuid, uuid, public.queue_status_enum, public.queue_status_enum, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.transition_queue_status_internal(uuid, uuid, public.queue_status_enum, public.queue_status_enum, uuid) TO service_role;

-- ============================================================================
-- 4. Authoritative Public Wrapper: transition_queue_status
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transition_queue_status(
  p_queue_id uuid,
  p_outlet_id uuid,
  p_target_status public.queue_status_enum,
  p_expected_current_status public.queue_status_enum DEFAULT NULL,
  p_barber_id uuid DEFAULT NULL
)
RETURNS pg_catalog.jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.transition_queue_status_internal($1, $2, $3, $4, $5);
$$;

REVOKE ALL ON FUNCTION public.transition_queue_status(uuid, uuid, public.queue_status_enum, public.queue_status_enum, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_queue_status(uuid, uuid, public.queue_status_enum, public.queue_status_enum, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_queue_status(uuid, uuid, public.queue_status_enum, public.queue_status_enum, uuid) TO authenticated, service_role;
