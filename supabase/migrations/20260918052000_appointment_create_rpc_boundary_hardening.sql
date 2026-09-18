-- ============================================================================
-- MIGRATION: APPOINTMENT CREATE RPC BOUNDARY HARDENING
-- Phase 3C.5
--
-- Objective:
--   Make appointment creation server-authoritative and remove direct client
--   INSERT/UPDATE/DELETE access from authenticated/anon roles.
--
-- Architectural rules:
--   1. Appointment creation MUST use public.create_appointment RPC.
--   2. Appointment status transitions MUST use public.transition_appointment_status.
--   3. Appointment check-in MUST use public.check_in_appointment_to_queue.
--   4. The RPC validates outlet access, outlet activity, active customer,
--      active service, active barber assignment, barber role, and derives
--      end_at from the authoritative service duration.
--   5. Server generates appointment_number and created_by.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_appointment(
  p_customer_id uuid,
  p_outlet_id uuid,
  p_service_id uuid,
  p_barber_id uuid,
  p_start_at timestamptz,
  p_notes text DEFAULT NULL::text,
  p_status public.appointment_status_enum DEFAULT 'CONFIRMED'::public.appointment_status_enum
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor_auth_user_id uuid;
  v_actor_profile_id uuid;
  v_outlet record;
  v_customer record;
  v_service record;
  v_barber record;
  v_appointment public.appointments%rowtype;
  v_attempt integer := 0;
  v_appointment_number varchar(100);
  v_end_at timestamptz;
BEGIN
  v_actor_auth_user_id := auth.uid();

  IF v_actor_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_customer_id IS NULL
     OR p_outlet_id IS NULL
     OR p_service_id IS NULL
     OR p_barber_id IS NULL
     OR p_start_at IS NULL
  THEN
    RAISE EXCEPTION 'APPOINTMENT_REQUIRED_FIELDS_MISSING' USING ERRCODE = '22023';
  END IF;

  IF p_status NOT IN (
    'PENDING'::public.appointment_status_enum,
    'CONFIRMED'::public.appointment_status_enum
  ) THEN
    RAISE EXCEPTION 'INVALID_INITIAL_APPOINTMENT_STATUS' USING ERRCODE = '22023';
  END IF;

  IF NOT public.current_user_has_outlet_access(p_outlet_id) THEN
    RAISE EXCEPTION 'APPOINTMENT_OUTLET_ACCESS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT o.id, o.name, o.is_active
    INTO v_outlet
    FROM public.outlets o
   WHERE o.id = p_outlet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OUTLET_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF NOT v_outlet.is_active THEN
    RAISE EXCEPTION 'OUTLET_INACTIVE' USING ERRCODE = '22023';
  END IF;

  SELECT p.id
    INTO v_actor_profile_id
    FROM public.profiles p
   WHERE p.auth_user_id = v_actor_auth_user_id
     AND p.is_active = TRUE
   LIMIT 1;

  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_PROFILE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT c.id, c.full_name, c.is_active
    INTO v_customer
    FROM public.customers c
   WHERE c.id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF NOT v_customer.is_active THEN
    RAISE EXCEPTION 'CUSTOMER_INACTIVE' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.name, s.duration_minutes, s.is_active
    INTO v_service
    FROM public.services s
   WHERE s.id = p_service_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF NOT v_service.is_active THEN
    RAISE EXCEPTION 'SERVICE_INACTIVE' USING ERRCODE = '22023';
  END IF;

  IF v_service.duration_minutes <= 0 THEN
    RAISE EXCEPTION 'SERVICE_DURATION_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT e.id, e.full_name, e.position, e.is_active
    INTO v_barber
    FROM public.employees e
    JOIN public.employee_outlets eo
      ON eo.employee_id = e.id
     AND eo.outlet_id = p_outlet_id
     AND eo.is_active = TRUE
   WHERE e.id = p_barber_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BARBER_NOT_ASSIGNED_TO_OUTLET' USING ERRCODE = '22023';
  END IF;

  IF NOT v_barber.is_active THEN
    RAISE EXCEPTION 'BARBER_INACTIVE' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    lower(COALESCE(v_barber.position, '')) LIKE '%barber%'
    OR lower(COALESCE(v_barber.position, '')) LIKE '%kapster%'
  ) THEN
    RAISE EXCEPTION 'EMPLOYEE_IS_NOT_BARBER' USING ERRCODE = '22023';
  END IF;

  v_end_at := p_start_at + make_interval(mins => v_service.duration_minutes);

  IF v_end_at <= p_start_at THEN
    RAISE EXCEPTION 'APPOINTMENT_TIME_RANGE_INVALID' USING ERRCODE = '22023';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_appointment_number :=
      'APT-' ||
      to_char(p_start_at, 'YYYYMMDD') ||
      '-' ||
      upper(
        substr(
          replace(gen_random_uuid()::text, '-', ''),
          1,
          10
        )
      );

    BEGIN
      INSERT INTO public.appointments (
        appointment_number,
        customer_id,
        outlet_id,
        service_id,
        barber_id,
        start_at,
        end_at,
        status,
        notes,
        created_by
      )
      VALUES (
        v_appointment_number,
        p_customer_id,
        p_outlet_id,
        p_service_id,
        p_barber_id,
        p_start_at,
        v_end_at,
        p_status,
        NULLIF(btrim(p_notes), ''),
        v_actor_profile_id
      )
      RETURNING * INTO v_appointment;

      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt >= 5 THEN
          RAISE EXCEPTION 'APPOINTMENT_NUMBER_ALLOCATION_FAILED' USING ERRCODE = '23505';
        END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_appointment.id,
    'appointment_number', v_appointment.appointment_number,
    'customer_id', v_appointment.customer_id,
    'customer_name', v_customer.full_name,
    'outlet_id', v_appointment.outlet_id,
    'service_id', v_appointment.service_id,
    'service_name', v_service.name,
    'barber_id', v_appointment.barber_id,
    'barber_name', v_barber.full_name,
    'start_at', v_appointment.start_at,
    'end_at', v_appointment.end_at,
    'status', v_appointment.status,
    'notes', v_appointment.notes,
    'created_by', v_appointment.created_by,
    'created_at', v_appointment.created_at,
    'updated_at', v_appointment.updated_at
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_appointment(
  uuid, uuid, uuid, uuid, timestamptz, text, public.appointment_status_enum
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.create_appointment(
  uuid, uuid, uuid, uuid, timestamptz, text, public.appointment_status_enum
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_appointment(
  uuid, uuid, uuid, uuid, timestamptz, text, public.appointment_status_enum
) TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.appointments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.appointments FROM anon;

COMMENT ON TABLE public.appointments IS
  'Appointments table. Direct client INSERT/UPDATE/DELETE revoked; creation uses create_appointment RPC, status transitions use transition_appointment_status RPC, and check-in uses check_in_appointment_to_queue RPC.';

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.appointments', 'INSERT') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated still has INSERT on appointments';
  END IF;
  IF has_table_privilege('authenticated', 'public.appointments', 'UPDATE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated still has UPDATE on appointments';
  END IF;
  IF has_table_privilege('authenticated', 'public.appointments', 'DELETE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated still has DELETE on appointments';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.appointments', 'SELECT') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated lost SELECT on appointments';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.create_appointment(uuid,uuid,uuid,uuid,timestamptz,text,appointment_status_enum)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated cannot EXECUTE create_appointment';
  END IF;
  IF has_function_privilege(
    'anon',
    'public.create_appointment(uuid,uuid,uuid,uuid,timestamptz,text,appointment_status_enum)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: anon can EXECUTE create_appointment';
  END IF;
END;
$$;
