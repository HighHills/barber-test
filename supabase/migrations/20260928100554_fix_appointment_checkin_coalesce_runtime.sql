-- 20260928100554_fix_appointment_checkin_coalesce_runtime.sql
-- Fix remaining Phase 4E runtime errors from pg_catalog.coalesce() usage.

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
  v_effective_barber_id uuid;
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

  v_effective_barber_id := coalesce(p_barber_id, v_apt.barber_id);

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
      pg_catalog.lower(coalesce(v_barber.position, '')) LIKE '%barber%'
      OR pg_catalog.lower(coalesce(v_barber.position, '')) LIKE '%kapster%'
    ) THEN
      RAISE EXCEPTION 'Karyawan % bukan merupakan barber/kapster (posisi: %)', v_barber.full_name, v_barber.position
        USING errcode = '22023';
    END IF;

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
