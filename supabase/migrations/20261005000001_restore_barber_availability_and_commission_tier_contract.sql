-- Restore the authoritative contracts consumed by Web and mobile clients.

ALTER TABLE public.commission_rules
  ADD COLUMN IF NOT EXISTS tier_config jsonb;

CREATE OR REPLACE FUNCTION public.get_outlet_barber_availability(p_outlet_id uuid)
RETURNS TABLE(
  employee_id uuid,
  employee_code varchar,
  full_name varchar,
  barber_position varchar,
  outlet_id uuid,
  outlet_timezone text,
  employee_is_active boolean,
  assignment_is_active boolean,
  availability_status text,
  is_available_now boolean,
  observed_at timestamptz,
  local_date date,
  local_time time,
  day_of_week integer,
  schedule_configured boolean,
  today_schedule_active boolean,
  shift_start time,
  shift_end time,
  break_start time,
  break_end time
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_timezone text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.current_user_has_outlet_access(p_outlet_id) THEN
    RAISE EXCEPTION 'Access denied for outlet %', p_outlet_id USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(o.timezone, 'Asia/Jakarta') INTO v_timezone
  FROM public.outlets o
  WHERE o.id = p_outlet_id AND o.is_active = TRUE;

  IF v_timezone IS NULL THEN
    RAISE EXCEPTION 'Outlet % not found or inactive', p_outlet_id USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  WITH runtime AS (
    SELECT timezone(v_timezone, v_now) AS local_now
  ), assigned AS (
    SELECT
      e.id, e.employee_code, e.full_name, e.position, e.is_active AS employee_active,
      eo.is_active AS assignment_active,
      r.local_now,
      EXTRACT(DOW FROM r.local_now)::integer AS today_day
    FROM public.employee_outlets eo
    JOIN public.employees e ON e.id = eo.employee_id
    CROSS JOIN runtime r
    WHERE eo.outlet_id = p_outlet_id
      AND (lower(e.position) LIKE '%barber%' OR lower(e.position) LIKE '%kapster%')
  )
  SELECT
    a.id,
    a.employee_code,
    a.full_name,
    a.position,
    p_outlet_id,
    v_timezone,
    a.employee_active,
    a.assignment_active,
    CASE
      WHEN NOT a.employee_active OR NOT a.assignment_active THEN 'INACTIVE'
      WHEN EXISTS (
        SELECT 1 FROM public.employee_leaves l
        WHERE l.employee_id = a.id AND l.outlet_id = p_outlet_id
          AND l.status = 'APPROVED' AND v_now >= l.start_at AND v_now < l.end_at
      ) THEN 'ON_LEAVE'
      WHEN s.id IS NULL THEN 'UNCONFIGURED'
      WHEN NOT s.is_active THEN 'DAY_OFF'
      WHEN a.local_now::time < s.start_time OR a.local_now::time >= s.end_time THEN 'OUTSIDE_SHIFT'
      WHEN s.break_start IS NOT NULL AND a.local_now::time >= s.break_start AND a.local_now::time < s.break_end THEN 'ON_BREAK'
      ELSE 'SHIFT_ACTIVE'
    END,
    (a.employee_active AND a.assignment_active AND s.id IS NOT NULL AND s.is_active
      AND a.local_now::time >= s.start_time AND a.local_now::time < s.end_time
      AND NOT (s.break_start IS NOT NULL AND a.local_now::time >= s.break_start AND a.local_now::time < s.break_end)
      AND NOT EXISTS (
        SELECT 1 FROM public.employee_leaves l
        WHERE l.employee_id = a.id AND l.outlet_id = p_outlet_id
          AND l.status = 'APPROVED' AND v_now >= l.start_at AND v_now < l.end_at
      )),
    v_now,
    a.local_now::date,
    a.local_now::time,
    a.today_day,
    s.id IS NOT NULL,
    COALESCE(s.is_active, FALSE),
    s.start_time,
    s.end_time,
    s.break_start,
    s.break_end
  FROM assigned a
  LEFT JOIN public.employee_schedules s
    ON s.employee_id = a.id
   AND s.outlet_id = p_outlet_id
   AND s.day_of_week = a.today_day;
END;
$$;

REVOKE ALL ON FUNCTION public.get_outlet_barber_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_outlet_barber_availability(uuid) TO authenticated, service_role;
