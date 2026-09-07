-- 20260907000029_public_booking_slots_boundary_hardening.sql
-- Harden the anonymous slot-availability RPC against invalid outlet,
-- service, barber, and past-date inputs.
--
-- Finding:
--   The SECURITY DEFINER slot RPC previously treated missing service/barber
--   rows as ordinary inputs. An anonymous caller could therefore request
--   availability for an arbitrary service or barber UUID, and an invalid
--   outlet could return a valid-shaped response with zero barbers.
--
-- Approach:
--   * Require an active outlet and resolve its timezone.
--   * Require the service to be active and enabled for that outlet.
--   * Require an explicitly selected barber to be active and eligible for
--     the selected outlet using the same assignment rule as public booking.
--   * Reject booking dates before the outlet's current local date.
--   * Preserve the existing slot calculation and return shape.

CREATE OR REPLACE FUNCTION public.get_public_booking_slots(
  p_outlet_id UUID,
  p_date DATE,
  p_barber_id UUID DEFAULT NULL,
  p_service_id UUID DEFAULT NULL
)
RETURNS TABLE(
  time_slot VARCHAR,
  is_available BOOLEAN,
  available_barbers_count INTEGER,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_duration INT := 45;
  v_timezone VARCHAR := 'Asia/Jakarta';
  v_slot RECORD;
  v_slot_start TIMESTAMPTZ;
  v_slot_end TIMESTAMPTZ;
  v_now TIMESTAMPTZ;
  v_local_date DATE;
  v_free_barbers INT;
  v_barber_free BOOLEAN;
  v_total_outlet_barbers INT;
BEGIN
  -- Validate and resolve the selected outlet before exposing availability.
  SELECT COALESCE(o.timezone, 'Asia/Jakarta')
    INTO v_timezone
  FROM public.outlets o
  WHERE o.id = p_outlet_id
    AND o.is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outlet tidak ditemukan atau tidak aktif'
      USING ERRCODE = '22023';
  END IF;

  v_now := CURRENT_TIMESTAMP;
  v_local_date := (v_now AT TIME ZONE v_timezone)::DATE;

  -- Do not expose historical availability slots.
  IF p_date < v_local_date THEN
    RAISE EXCEPTION 'Tanggal booking sudah lewat'
      USING ERRCODE = '22023';
  END IF;

  -- A service is valid for public booking only when it is active and
  -- explicitly enabled for the selected active outlet.
  SELECT COALESCE(s.duration_minutes, 45)
    INTO v_duration
  FROM public.services s
  JOIN public.service_outlets so
    ON so.service_id = s.id
  WHERE s.id = p_service_id
    AND s.is_active = TRUE
    AND so.outlet_id = p_outlet_id
    AND so.is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Layanan tidak ditemukan atau tidak tersedia di outlet ini'
      USING ERRCODE = '22023';
  END IF;

  -- When a specific barber is requested, enforce the same public-booking
  -- eligibility rule used by the booking creation RPC.
  IF p_barber_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = p_barber_id
        AND e.is_active = TRUE
        AND (
          EXISTS (
            SELECT 1
            FROM public.employee_outlets eo
            WHERE eo.employee_id = e.id
              AND eo.outlet_id = p_outlet_id
              AND eo.is_active = TRUE
          )
          OR NOT EXISTS (
            SELECT 1
            FROM public.employee_outlets eo
            WHERE eo.employee_id = e.id
          )
        )
    ) THEN
      RAISE EXCEPTION 'Barber tidak ditemukan atau tidak tersedia di outlet ini'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Total active barbers in this outlet.
  SELECT COUNT(*)::INT INTO v_total_outlet_barbers
  FROM public.employees e
  WHERE e.is_active = TRUE
    AND (
      EXISTS (
        SELECT 1 FROM public.employee_outlets eo
        WHERE eo.employee_id = e.id
          AND eo.outlet_id = p_outlet_id
          AND eo.is_active = TRUE
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.employee_outlets eo
        WHERE eo.employee_id = e.id
      )
    );

  -- Generate 30-minute intervals from 09:00 to 20:30.
  FOR v_slot IN (
    SELECT to_char(t, 'HH24:MI') AS slot_str, t::TIME AS slot_time
    FROM generate_series(
      '2000-01-01 09:00:00'::timestamp,
      '2000-01-01 20:30:00'::timestamp,
      '30 minutes'::interval
    ) t
  ) LOOP
    time_slot := v_slot.slot_str;

    -- Combine date & slot time to timestamptz in outlet timezone.
    v_slot_start := (p_date::TEXT || ' ' || v_slot.slot_str || ':00')::TIMESTAMP AT TIME ZONE v_timezone;
    v_slot_end := v_slot_start + (v_duration || ' minutes')::INTERVAL;

    -- Keep the existing 10-minute booking buffer for today's slots.
    IF v_slot_start <= (v_now + INTERVAL '10 minutes') THEN
      is_available := FALSE;
      available_barbers_count := 0;
      reason := 'Waktu sudah lewat';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- If a specific barber is requested, check only that barber.
    IF p_barber_id IS NOT NULL THEN
      SELECT NOT EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.barber_id = p_barber_id
          AND a.status NOT IN ('CANCELLED', 'NO_SHOW')
          AND tstzrange(a.start_at, a.end_at) && tstzrange(v_slot_start, v_slot_end)
      ) INTO v_barber_free;

      IF v_barber_free THEN
        is_available := TRUE;
        available_barbers_count := 1;
        reason := 'Tersedia';
      ELSE
        is_available := FALSE;
        available_barbers_count := 0;
        reason := 'Barber sudah ada jadwal';
      END IF;
      RETURN NEXT;
    ELSE
      -- "Bebas / Siapa Saja": count eligible barbers that are free.
      SELECT COUNT(*)::INT INTO v_free_barbers
      FROM public.employees e
      WHERE e.is_active = TRUE
        AND (
          EXISTS (
            SELECT 1 FROM public.employee_outlets eo
            WHERE eo.employee_id = e.id
              AND eo.outlet_id = p_outlet_id
              AND eo.is_active = TRUE
          )
          OR NOT EXISTS (
            SELECT 1 FROM public.employee_outlets eo
            WHERE eo.employee_id = e.id
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.appointments a
          WHERE a.barber_id = e.id
            AND a.status NOT IN ('CANCELLED', 'NO_SHOW')
            AND tstzrange(a.start_at, a.end_at) && tstzrange(v_slot_start, v_slot_end)
        );

      available_barbers_count := v_free_barbers;
      IF v_free_barbers > 0 THEN
        is_available := TRUE;
        reason := 'Tersedia (' || v_free_barbers || ' barber)';
      ELSE
        is_available := FALSE;
        reason := 'Semua barber penuh';
      END IF;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Public availability remains intentionally callable by anonymous users,
-- but only through this boundary-validated implementation.
REVOKE EXECUTE ON FUNCTION public.get_public_booking_slots(
  UUID, DATE, UUID, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_booking_slots(
  UUID, DATE, UUID, UUID
) TO anon, authenticated, service_role;

-- Security assertions.
DO $$
BEGIN
  IF NOT has_function_privilege(
    'anon',
    'public.get_public_booking_slots(UUID,DATE,UUID,UUID)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: anon cannot execute public booking slots RPC';
  END IF;
END;
$$;
