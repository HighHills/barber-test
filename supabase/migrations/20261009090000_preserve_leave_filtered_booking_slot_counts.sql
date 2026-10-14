-- Some installations already exclude approved leave in the base slot RPC.
-- Clamp to the eligible free barber count so leave is never subtracted twice.
CREATE OR REPLACE FUNCTION public.get_public_booking_slots(
  p_outlet_id uuid, p_date date, p_barber_id uuid DEFAULT NULL, p_service_id uuid DEFAULT NULL
) RETURNS TABLE(time_slot varchar, is_available boolean, available_barbers_count integer, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_slot record;
  v_timezone text;
  v_duration integer;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_free_barbers integer;
BEGIN
  SELECT COALESCE(o.timezone, 'Asia/Jakarta'), s.duration_minutes
    INTO v_timezone, v_duration
  FROM public.outlets o CROSS JOIN public.services s
  WHERE o.id = p_outlet_id AND s.id = p_service_id;

  FOR v_slot IN SELECT * FROM public._base_get_public_booking_slots(
    p_outlet_id, p_date, p_barber_id, p_service_id
  ) LOOP
    v_start_at := (p_date::text || ' ' || v_slot.time_slot)::timestamp AT TIME ZONE v_timezone;
    v_end_at := v_start_at + pg_catalog.make_interval(mins => v_duration);

    IF p_barber_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.employee_leaves l
        WHERE l.employee_id = p_barber_id AND l.outlet_id = p_outlet_id
          AND l.status = 'APPROVED'
          AND v_start_at < l.end_at AND v_end_at > l.start_at
      ) THEN
        v_slot.is_available := false;
        v_slot.available_barbers_count := 0;
        v_slot.reason := 'Kapster sedang cuti';
      END IF;
    ELSIF v_slot.is_available THEN
      SELECT count(*)::integer INTO v_free_barbers
      FROM public.employees e
      WHERE e.is_active = true
        AND (lower(e.position) LIKE '%barber%' OR lower(e.position) LIKE '%kapster%')
        AND (EXISTS (
          SELECT 1 FROM public.employee_outlets eo WHERE eo.employee_id = e.id
            AND eo.outlet_id = p_outlet_id AND eo.is_active = true
        ) OR NOT EXISTS (SELECT 1 FROM public.employee_outlets eo WHERE eo.employee_id = e.id))
        AND NOT EXISTS (
          SELECT 1 FROM public.employee_leaves l
          WHERE l.employee_id = e.id AND l.outlet_id = p_outlet_id
            AND l.status = 'APPROVED'
            AND v_start_at < l.end_at AND v_end_at > l.start_at
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.appointments a WHERE a.barber_id = e.id
            AND a.status NOT IN ('CANCELLED', 'NO_SHOW')
            AND a.start_at < v_end_at AND a.end_at > v_start_at
        );
      v_slot.available_barbers_count := LEAST(v_slot.available_barbers_count, v_free_barbers);
      v_slot.is_available := v_slot.available_barbers_count > 0;
      IF NOT v_slot.is_available THEN v_slot.reason := 'Kapster tidak tersedia'; END IF;
    END IF;
    time_slot := v_slot.time_slot;
    is_available := v_slot.is_available;
    available_barbers_count := v_slot.available_barbers_count;
    reason := v_slot.reason;
    RETURN NEXT;
  END LOOP;
END;
$$;
