-- Atomic weekly employee schedule save with full business validation.

CREATE OR REPLACE FUNCTION public.save_employee_weekly_schedule(
  p_employee_id uuid,
  p_outlet_id uuid,
  p_schedules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_schedule jsonb;
  v_day smallint;
  v_start time;
  v_end time;
  v_break_start time;
  v_break_end time;
  v_active boolean;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_owner_or_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya Owner/Admin yang dapat mengelola jadwal staff' USING ERRCODE = '42501';
  END IF;

  IF p_employee_id IS NULL OR p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'Staff dan outlet wajib dipilih' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id AND is_active = true) THEN
    RAISE EXCEPTION 'Staff aktif tidak ditemukan' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.outlets WHERE id = p_outlet_id) THEN
    RAISE EXCEPTION 'Outlet tidak ditemukan' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employee_outlets
    WHERE employee_id = p_employee_id AND outlet_id = p_outlet_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Staff belum ditugaskan aktif pada outlet tersebut' USING ERRCODE = '22023';
  END IF;

  IF p_schedules IS NULL OR jsonb_typeof(p_schedules) <> 'array' OR jsonb_array_length(p_schedules) <> 7 THEN
    RAISE EXCEPTION 'Jadwal mingguan harus berisi tepat 7 hari' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_count FROM jsonb_array_elements(p_schedules);
  IF v_count <> 7 THEN
    RAISE EXCEPTION 'Jadwal mingguan tidak lengkap' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_schedules) e
    WHERE NOT (e.value ? 'day_of_week')
       OR NOT (e.value ? 'start_time')
       OR NOT (e.value ? 'end_time')
       OR NOT (e.value ? 'is_active')
  ) THEN
    RAISE EXCEPTION 'Data jadwal tidak lengkap' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT (value->>'day_of_week')::smallint AS day_of_week
      FROM jsonb_array_elements(p_schedules)
    ) d
    WHERE day_of_week < 0 OR day_of_week > 6
    GROUP BY day_of_week
    HAVING count(*) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM generate_series(0, 6) AS expected(day_of_week)
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_schedules) e
      WHERE (e.value->>'day_of_week')::smallint = expected.day_of_week
    )
  ) THEN
    RAISE EXCEPTION 'Hari jadwal harus unik dan mencakup Minggu sampai Sabtu' USING ERRCODE = '22023';
  END IF;

  FOR v_schedule IN SELECT value FROM jsonb_array_elements(p_schedules)
  LOOP
    BEGIN
      v_day := (v_schedule->>'day_of_week')::smallint;
      v_start := (v_schedule->>'start_time')::time;
      v_end := (v_schedule->>'end_time')::time;
      v_active := (v_schedule->>'is_active')::boolean;
      v_break_start := CASE WHEN nullif(v_schedule->>'break_start', '') IS NULL THEN NULL ELSE (v_schedule->>'break_start')::time END;
      v_break_end := CASE WHEN nullif(v_schedule->>'break_end', '') IS NULL THEN NULL ELSE (v_schedule->>'break_end')::time END;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Format jadwal tidak valid untuk salah satu hari' USING ERRCODE = '22023';
    END;

    IF v_start >= v_end THEN
      RAISE EXCEPTION 'Jam kerja tidak valid untuk hari %', v_day USING ERRCODE = '22023';
    END IF;

    IF (v_break_start IS NULL) <> (v_break_end IS NULL) THEN
      RAISE EXCEPTION 'Jam istirahat harus diisi lengkap untuk hari %', v_day USING ERRCODE = '22023';
    END IF;

    IF v_break_start IS NOT NULL THEN
      IF v_break_start >= v_break_end THEN
        RAISE EXCEPTION 'Jam istirahat tidak valid untuk hari %', v_day USING ERRCODE = '22023';
      END IF;
      IF v_break_start < v_start OR v_break_end > v_end THEN
        RAISE EXCEPTION 'Jam istirahat harus berada di dalam jam kerja untuk hari %', v_day USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.employee_schedules (
    employee_id, outlet_id, day_of_week,
    start_time, end_time, break_start, break_end, is_active
  )
  SELECT
    p_employee_id,
    p_outlet_id,
    (e.value->>'day_of_week')::smallint,
    (e.value->>'start_time')::time,
    (e.value->>'end_time')::time,
    CASE WHEN nullif(e.value->>'break_start', '') IS NULL THEN NULL ELSE (e.value->>'break_start')::time END,
    CASE WHEN nullif(e.value->>'break_end', '') IS NULL THEN NULL ELSE (e.value->>'break_end')::time END,
    (e.value->>'is_active')::boolean
  FROM jsonb_array_elements(p_schedules) e
  ON CONFLICT (employee_id, outlet_id, day_of_week)
  DO UPDATE SET
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    break_start = EXCLUDED.break_start,
    break_end = EXCLUDED.break_end,
    is_active = EXCLUDED.is_active;

  RETURN jsonb_build_object(
    'success', true,
    'employee_id', p_employee_id,
    'outlet_id', p_outlet_id,
    'days_saved', 7
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_employee_weekly_schedule(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_employee_weekly_schedule(uuid, uuid, jsonb) TO authenticated;
