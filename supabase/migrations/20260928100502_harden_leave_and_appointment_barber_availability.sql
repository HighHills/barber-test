-- 20260928100502_harden_leave_and_appointment_barber_availability.sql
-- Phase 4E: Leave -> availability -> appointment/queue enforcement
-- Also repairs save_employee_leave to use the current public.leave_status_enum type.

CREATE OR REPLACE FUNCTION public.save_employee_leave(
  p_leave_id uuid DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_outlet_id uuid DEFAULT NULL,
  p_start_at timestamptz DEFAULT NULL,
  p_end_at timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_status text DEFAULT 'APPROVED'
)
RETURNS public.employee_leaves
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.employee_leaves%ROWTYPE;
  v_actor uuid;
BEGIN
  v_actor := public._security_current_actor_profile(NULL);

  IF NOT public.is_owner_or_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya Owner/Admin yang dapat mengelola cuti staff'
      USING ERRCODE='42501';
  END IF;

  IF p_employee_id IS NULL
     OR p_outlet_id IS NULL
     OR p_start_at IS NULL
     OR p_end_at IS NULL
     OR p_start_at >= p_end_at
  THEN
    RAISE EXCEPTION 'Rentang cuti tidak valid'
      USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employee_outlets
    WHERE employee_id = p_employee_id
      AND outlet_id = p_outlet_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Staff belum ditugaskan aktif pada outlet tersebut'
      USING ERRCODE='22023';
  END IF;

  IF p_leave_id IS NULL THEN
    INSERT INTO public.employee_leaves(
      employee_id,
      outlet_id,
      start_at,
      end_at,
      reason,
      status,
      created_by
    )
    VALUES(
      p_employee_id,
      p_outlet_id,
      p_start_at,
      p_end_at,
      NULLIF(BTRIM(p_reason), ''),
      COALESCE(p_status, 'APPROVED')::public.leave_status_enum,
      v_actor
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.employee_leaves
    SET
      employee_id = p_employee_id,
      outlet_id = p_outlet_id,
      start_at = p_start_at,
      end_at = p_end_at,
      reason = NULLIF(BTRIM(p_reason), ''),
      status = COALESCE(p_status, 'APPROVED')::public.leave_status_enum
    WHERE id = p_leave_id
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'Data cuti tidak ditemukan'
        USING ERRCODE='P0002';
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_employee_leave(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.save_employee_leave(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.save_employee_leave(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text
) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.check_in_appointment_to_queue(
  p_appointment_id uuid,
  p_outlet_id uuid,
  p_barber_id uuid DEFAULT NULL
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor pg_catalog.uuid;
  v_outlet record;
  v_apt record;
  v_barber record;
  v_effective_barber_id pg_catalog.uuid;
  v_alloc record;
  v_queue_id uuid;
  v_joined_at pg_catalog.timestamptz := pg_catalog.clock_timestamp();
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: pengguna tidak terautentikasi'
      USING errcode = '42501';
  END IF;

  IF NOT public.current_user_has_outlet_access(p_outlet_id) THEN
    RAISE EXCEPTION 'Akses ditolak: pengguna tidak memiliki izin di outlet ini'
      USING errcode = '42501';
  END IF;

  SELECT id, name, is_active, timezone
  INTO v_outlet
  FROM public.outlets
  WHERE id = p_outlet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outlet % tidak ditemukan', p_outlet_id
      USING errcode = '22023';
  END IF;

  IF NOT v_outlet.is_active THEN
    RAISE EXCEPTION 'Outlet % sedang tidak aktif', v_outlet.name
      USING errcode = '22023';
  END IF;

  SELECT id, appointment_number, customer_id, barber_id, service_id, status, start_at
  INTO v_apt
  FROM public.appointments
  WHERE id = p_appointment_id
    AND outlet_id = p_outlet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Janji temu % tidak ditemukan pada outlet ini', p_appointment_id
      USING errcode = '22023';
  END IF;

  IF v_apt.status = 'ARRIVED'::public.appointment_status_enum THEN
    RAISE EXCEPTION 'Janji temu #% sudah pernah check-in sebelumnya', v_apt.appointment_number
      USING errcode = '22023';
  END IF;

  IF v_apt.status NOT IN (
    'PENDING'::public.appointment_status_enum,
    'CONFIRMED'::public.appointment_status_enum
  ) THEN
    RAISE EXCEPTION 'Janji temu #% dengan status % tidak dapat di-check-in', v_apt.appointment_number, v_apt.status
      USING errcode = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.queues
    WHERE appointment_id = p_appointment_id
      AND status NOT IN (
        'CANCELLED'::public.queue_status_enum,
        'NO_SHOW'::public.queue_status_enum
      )
  ) THEN
    RAISE EXCEPTION 'Janji temu #% sudah terdaftar pada antrean aktif', v_apt.appointment_number
      USING errcode = '23505';
  END IF;

  v_effective_barber_id := pg_catalog.coalesce(p_barber_id, v_apt.barber_id);

  IF v_effective_barber_id IS NOT NULL THEN
    SELECT e.id, e.full_name, e.position, e.is_active
    INTO v_barber
    FROM public.employees e
    JOIN public.employee_outlets eo
      ON eo.employee_id = e.id
     AND eo.outlet_id = p_outlet_id
     AND eo.is_active = true
    WHERE e.id = v_effective_barber_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barber % tidak ditemukan atau tidak ditugaskan aktif di outlet ini', v_effective_barber_id
        USING errcode = '22023';
    END IF;

    IF NOT v_barber.is_active THEN
      RAISE EXCEPTION 'Barber % sedang tidak aktif', v_barber.full_name
        USING errcode = '22023';
    END IF;

    IF NOT (
      pg_catalog.lower(pg_catalog.coalesce(v_barber.position, '')) LIKE '%barber%'
      OR pg_catalog.lower(pg_catalog.coalesce(v_barber.position, '')) LIKE '%kapster%'
    ) THEN
      RAISE EXCEPTION 'Karyawan % bukan merupakan barber/kapster (posisi: %)', v_barber.full_name, v_barber.position
        USING errcode = '22023';
    END IF;

    -- Phase 4E: appointment check-in must respect authoritative operational availability.
    PERFORM private.assert_barber_operationally_available(
      p_outlet_id,
      v_effective_barber_id
    );
  END IF;

  SELECT *
  INTO v_alloc
  FROM private.allocate_queue_number(p_outlet_id);

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

  UPDATE public.appointments
  SET
    status = 'ARRIVED'::public.appointment_status_enum,
    updated_at = pg_catalog.clock_timestamp()
  WHERE id = v_apt.id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'queue_id', v_queue_id,
    'queue_number', v_alloc.allocated_number,
    'appointment_id', v_apt.id,
    'appointment_number', v_apt.appointment_number,
    'status', 'WAITING',
    'joined_at', v_joined_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_appointment_to_queue(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_in_appointment_to_queue(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_in_appointment_to_queue(uuid, uuid, uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT has_function_privilege(
    'authenticated',
    'public.check_in_appointment_to_queue(uuid,uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Phase 4E security assertion failed: authenticated cannot EXECUTE check_in_appointment_to_queue';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.check_in_appointment_to_queue(uuid,uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Phase 4E security assertion failed: anon can EXECUTE check_in_appointment_to_queue';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.save_employee_leave(uuid,uuid,uuid,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Phase 4E security assertion failed: authenticated cannot EXECUTE save_employee_leave';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.save_employee_leave(uuid,uuid,uuid,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Phase 4E security assertion failed: anon can EXECUTE save_employee_leave';
  END IF;
END;
$$;
