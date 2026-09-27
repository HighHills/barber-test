-- 20260927084643_enforce_barber_operational_availability_at_queue_mutation.sql
-- Phase 4B: Enforce Authoritative Barber Operational Availability at Queue Mutation Boundaries

-- ============================================================================
-- 1. Helper function: private.assert_barber_operationally_available
-- ============================================================================
CREATE OR REPLACE FUNCTION private.assert_barber_operationally_available(
  p_outlet_id uuid,
  p_barber_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_availability RECORD;
BEGIN
  IF p_barber_id IS NULL THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_availability
  FROM public.get_outlet_barber_availability(p_outlet_id)
  WHERE employee_id = p_barber_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BARBER_NOT_OPERATIONALLY_AVAILABLE: INACTIVE'
      USING ERRCODE = 'P0006';
  END IF;

  IF v_availability.availability_status <> 'SHIFT_ACTIVE' THEN
    RAISE EXCEPTION 'BARBER_NOT_OPERATIONALLY_AVAILABLE: %', v_availability.availability_status
      USING ERRCODE = 'P0006';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_barber_operationally_available(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assert_barber_operationally_available(uuid, uuid) TO service_role;

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
-- 3. Authoritative Queue Status Transition Enforcement
-- ============================================================================
CREATE OR REPLACE FUNCTION private.transition_queue_status_internal(
  p_queue_id uuid,
  p_outlet_id uuid,
  p_target_status text,
  p_expected_current_status text,
  p_barber_id uuid DEFAULT NULL
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_queue RECORD;
  v_effective_barber_id uuid;
  v_target_enum public.queue_status_enum;
  v_now timestamptz := clock_timestamp();
BEGIN
  -- 1. Fetch and lock queue record
  SELECT *
  INTO v_queue
  FROM public.queues
  WHERE id = p_queue_id AND outlet_id = p_outlet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Antrean tidak ditemukan atau outlet tidak sesuai'
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Validate expected current status
  IF v_queue.status::text <> p_expected_current_status THEN
    RAISE EXCEPTION 'Status antrean saat ini (%) tidak sesuai dengan yang diharapkan (%)',
      v_queue.status, p_expected_current_status
      USING ERRCODE = '22023';
  END IF;

  v_target_enum := p_target_status::public.queue_status_enum;
  v_effective_barber_id := COALESCE(p_barber_id, v_queue.barber_id);

  -- 3. Phase 4B Operational Availability Enforcement on CALLED
  IF v_target_enum = 'CALLED'::public.queue_status_enum THEN
    IF v_effective_barber_id IS NULL THEN
      RAISE EXCEPTION 'Barber wajib ditentukan saat memanggil antrean'
        USING ERRCODE = '22023';
    END IF;

    -- Assert authoritative operational availability
    PERFORM private.assert_barber_operationally_available(p_outlet_id, v_effective_barber_id);
  END IF;

  -- 4. Transition status and timestamps
  UPDATE public.queues
  SET
    status = v_target_enum,
    barber_id = v_effective_barber_id,
    called_at = CASE WHEN v_target_enum = 'CALLED' AND called_at IS NULL THEN v_now ELSE called_at END,
    started_at = CASE WHEN v_target_enum = 'IN_SERVICE' AND started_at IS NULL THEN v_now ELSE started_at END,
    completed_at = CASE WHEN v_target_enum IN ('COMPLETED', 'CANCELLED', 'NO_SHOW') AND completed_at IS NULL THEN v_now ELSE completed_at END
  WHERE id = p_queue_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'queue_id', p_queue_id,
    'outlet_id', p_outlet_id,
    'status', p_target_status,
    'barber_id', v_effective_barber_id
  );
END;
$$;

REVOKE ALL ON FUNCTION private.transition_queue_status_internal(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.transition_queue_status_internal(uuid, uuid, text, text, uuid) TO service_role;
