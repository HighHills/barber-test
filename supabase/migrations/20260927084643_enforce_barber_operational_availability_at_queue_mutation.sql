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
declare
  v_status text;
begin
  if p_outlet_id is null or p_barber_id is null then
    raise exception 'BARBER_REQUIRED'
      using errcode = '22023';
  end if;

  select a.availability_status
    into v_status
  from public.get_outlet_barber_availability(p_outlet_id) a
  where a.employee_id = p_barber_id;

  if not found then
    raise exception 'BARBER_NOT_FOUND_OR_NOT_ASSIGNED'
      using errcode = '22023';
  end if;

  if v_status <> 'SHIFT_ACTIVE' then
    raise exception 'BARBER_NOT_OPERATIONALLY_AVAILABLE: %', v_status
      using errcode = 'P0006';
  end if;

  return v_status;
end;
$$;

REVOKE ALL ON FUNCTION private.assert_barber_operationally_available(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

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
  v_queue public.queues%rowtype;
  v_now timestamptz := statement_timestamp();
  v_appointment_status public.appointment_status_enum;
BEGIN
  -- 1. Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Outlet authorization check
  IF NOT public.current_user_has_outlet_access(p_outlet_id) THEN
    RAISE EXCEPTION 'Access denied for outlet %', p_outlet_id
      USING ERRCODE = '42501';
  END IF;

  -- 3. Fetch and lock queue row
  SELECT *
  INTO v_queue
  FROM public.queues
  WHERE id = p_queue_id AND outlet_id = p_outlet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue % was not found in outlet %', p_queue_id, p_outlet_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Expected status validation
  IF p_expected_current_status IS NOT NULL AND v_queue.status <> p_expected_current_status THEN
    RAISE EXCEPTION 'Queue status changed by another operator (current: %)', v_queue.status
      USING ERRCODE = 'P0003';
  END IF;

  -- 5. Exact existing queue state machine
  IF v_queue.status = 'WAITING'::public.queue_status_enum THEN
    IF p_target_status NOT IN ('CALLED'::public.queue_status_enum, 'CANCELLED'::public.queue_status_enum) THEN
      RAISE EXCEPTION 'Invalid queue transition from WAITING to %', p_target_status
        USING ERRCODE = 'P0004';
    END IF;
  ELSIF v_queue.status = 'CALLED'::public.queue_status_enum THEN
    IF p_target_status NOT IN ('IN_SERVICE'::public.queue_status_enum, 'NO_SHOW'::public.queue_status_enum, 'CANCELLED'::public.queue_status_enum) THEN
      RAISE EXCEPTION 'Invalid queue transition from CALLED to %', p_target_status
        USING ERRCODE = 'P0004';
    END IF;
  ELSIF v_queue.status = 'IN_SERVICE'::public.queue_status_enum THEN
    IF p_target_status <> 'COMPLETED'::public.queue_status_enum THEN
      RAISE EXCEPTION 'Invalid queue transition from IN_SERVICE to %', p_target_status
        USING ERRCODE = 'P0004';
    END IF;
  ELSIF v_queue.status IN ('COMPLETED'::public.queue_status_enum, 'CANCELLED'::public.queue_status_enum, 'NO_SHOW'::public.queue_status_enum) THEN
    RAISE EXCEPTION 'Queue is already terminal and cannot be changed'
      USING ERRCODE = 'P0004';
  ELSE
    RAISE EXCEPTION 'Unsupported current queue status %', v_queue.status
      USING ERRCODE = 'P0004';
  END IF;

  -- 6. CALLED validations & barber assignment enforcement
  IF p_target_status = 'CALLED'::public.queue_status_enum THEN
    IF p_barber_id IS NULL THEN
      RAISE EXCEPTION 'A barber is required when calling a queue'
        USING ERRCODE = '22004';
    END IF;

    -- Validate active barber assignment
    IF NOT EXISTS (
      SELECT 1
      FROM public.employee_outlets eo
      JOIN public.employees e ON e.id = eo.employee_id
      WHERE eo.employee_id = p_barber_id
        AND eo.outlet_id = p_outlet_id
        AND eo.is_active = TRUE
        AND e.is_active = TRUE
        AND (
          lower(trim(e.position)) LIKE '%barber%'
          OR lower(trim(e.position)) LIKE '%kapster%'
        )
    ) THEN
      RAISE EXCEPTION 'Barber % is not an active barber assigned to outlet %', p_barber_id, p_outlet_id
        USING ERRCODE = '42501';
    END IF;

    -- Phase 4B Operational Availability Enforcement
    PERFORM private.assert_barber_operationally_available(p_outlet_id, p_barber_id);

    -- Advisory lock
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'queue-barber:' || p_outlet_id::text || ':' || p_barber_id::text,
        0
      )
    );

    -- Duplicate active barber assignment protection
    IF EXISTS (
      SELECT 1
      FROM public.queues
      WHERE outlet_id = p_outlet_id
        AND barber_id = p_barber_id
        AND status IN ('CALLED'::public.queue_status_enum, 'IN_SERVICE'::public.queue_status_enum)
        AND id <> p_queue_id
    ) THEN
      RAISE EXCEPTION 'Barber % already has an active queue assignment at this outlet', p_barber_id
        USING ERRCODE = 'P0005';
    END IF;
  ELSIF p_barber_id IS NOT NULL THEN
    RAISE EXCEPTION 'Barber assignment is only allowed when transitioning to CALLED'
      USING ERRCODE = 'P0004';
  END IF;

  -- 8. Linked appointment consistency check
  IF v_queue.appointment_id IS NOT NULL THEN
    PERFORM 1
    FROM public.appointments a
    WHERE a.id = v_queue.appointment_id
      AND a.outlet_id = p_outlet_id
      AND a.barber_id = coalesce(p_barber_id, v_queue.barber_id);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked appointment is inconsistent with queue outlet or barber'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 9. Update queue row with branch-specific update semantics
  IF p_target_status = 'CALLED'::public.queue_status_enum THEN
    UPDATE public.queues
    SET
      status = p_target_status,
      barber_id = p_barber_id,
      called_at = coalesce(called_at, v_now)
    WHERE id = p_queue_id;
  ELSIF p_target_status = 'IN_SERVICE'::public.queue_status_enum THEN
    UPDATE public.queues
    SET
      status = p_target_status,
      started_at = coalesce(started_at, v_now)
    WHERE id = p_queue_id;
  ELSIF p_target_status = 'COMPLETED'::public.queue_status_enum THEN
    UPDATE public.queues
    SET
      status = p_target_status,
      completed_at = coalesce(completed_at, v_now)
    WHERE id = p_queue_id;
  ELSE
    UPDATE public.queues
    SET
      status = p_target_status
    WHERE id = p_queue_id;
  END IF;

  -- 10. Linked appointment status synchronization
  IF v_queue.appointment_id IS NOT NULL THEN
    v_appointment_status := CASE p_target_status
      WHEN 'IN_SERVICE'::public.queue_status_enum THEN 'IN_SERVICE'::public.appointment_status_enum
      WHEN 'COMPLETED'::public.queue_status_enum THEN 'COMPLETED'::public.appointment_status_enum
      WHEN 'CANCELLED'::public.queue_status_enum THEN 'CANCELLED'::public.appointment_status_enum
      WHEN 'NO_SHOW'::public.queue_status_enum THEN 'NO_SHOW'::public.appointment_status_enum
      ELSE NULL
    END;

    IF v_appointment_status IS NOT NULL THEN
      UPDATE public.appointments
      SET
        status = v_appointment_status,
        updated_at = v_now
      WHERE id = v_queue.appointment_id
        AND outlet_id = p_outlet_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Linked appointment update failed'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  -- 11. Return receipt contract
  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'queue_id', p_queue_id,
    'outlet_id', p_outlet_id,
    'status', p_target_status::text,
    'barber_id', coalesce(p_barber_id, v_queue.barber_id)
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
