-- ============================================================================
-- VERIFICATION SCRIPT: APPOINTMENT DIRECT UPDATE LOCKDOWN
-- Phase 3C.4 Verification
--
-- Jalankan di Supabase SQL Editor untuk memverifikasi privilege pada
-- public.appointments dan RPC terkait.
-- ============================================================================

-- 1. Periksa Table Privileges untuk authenticated, anon, dan service_role
SELECT 
  grantee,
  table_schema,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'appointments'
  AND grantee IN ('authenticated', 'anon', 'service_role')
ORDER BY grantee, privilege_type;

-- 2. Evaluasi Privilege Functions (Boolean Assertions)
SELECT
  -- Appointments Table Privileges
  has_table_privilege('authenticated', 'public.appointments', 'UPDATE') AS "authenticated_can_update (EXPECT: false)",
  has_table_privilege('anon', 'public.appointments', 'UPDATE')          AS "anon_can_update (EXPECT: false)",
  has_table_privilege('authenticated', 'public.appointments', 'SELECT') AS "authenticated_can_select (EXPECT: true)",
  has_table_privilege('authenticated', 'public.appointments', 'INSERT') AS "authenticated_can_insert (EXPECT: true)",
  has_table_privilege('service_role', 'public.appointments', 'UPDATE')   AS "service_role_can_update (EXPECT: true)",

  -- RPC Execute Privileges for transition_appointment_status
  has_function_privilege('authenticated', 'public.transition_appointment_status(uuid,uuid,appointment_status_enum,appointment_status_enum)', 'EXECUTE')
    AS "auth_can_exec_transition_appointment_status (EXPECT: true)",
  has_function_privilege('anon', 'public.transition_appointment_status(uuid,uuid,appointment_status_enum,appointment_status_enum)', 'EXECUTE')
    AS "anon_can_exec_transition_appointment_status (EXPECT: false)",

  -- RPC Execute Privileges for check_in_appointment_to_queue
  has_function_privilege('authenticated', 'public.check_in_appointment_to_queue(uuid,uuid,uuid)', 'EXECUTE')
    AS "auth_can_exec_check_in_appointment (EXPECT: true)",
  has_function_privilege('anon', 'public.check_in_appointment_to_queue(uuid,uuid,uuid)', 'EXECUTE')
    AS "anon_can_exec_check_in_appointment (EXPECT: false)";

-- 3. Verifikasi Blok Assertions (Otomatis memunculkan EXCEPTION bila tidak sesuai)
DO $$
BEGIN
  -- Assert table UPDATE revoked
  IF has_table_privilege('authenticated', 'public.appointments', 'UPDATE') THEN
    RAISE EXCEPTION 'FAILED: authenticated can still UPDATE appointments';
  END IF;

  IF has_table_privilege('anon', 'public.appointments', 'UPDATE') THEN
    RAISE EXCEPTION 'FAILED: anon can still UPDATE appointments';
  END IF;

  -- Assert table SELECT and INSERT preserved
  IF NOT has_table_privilege('authenticated', 'public.appointments', 'SELECT') THEN
    RAISE EXCEPTION 'FAILED: authenticated cannot SELECT appointments';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.appointments', 'INSERT') THEN
    RAISE EXCEPTION 'FAILED: authenticated cannot INSERT appointments';
  END IF;

  -- Assert service_role preserved
  IF NOT has_table_privilege('service_role', 'public.appointments', 'UPDATE') THEN
    RAISE EXCEPTION 'FAILED: service_role cannot UPDATE appointments';
  END IF;

  RAISE NOTICE 'SUCCESS: All appointment table lockdown assertions passed successfully.';
END;
$$;
