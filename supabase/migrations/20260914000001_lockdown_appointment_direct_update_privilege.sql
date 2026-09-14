-- ============================================================================
-- MIGRATION: LOCKDOWN APPOINTMENT DIRECT UPDATE PRIVILEGE
-- Phase 3C.4 Security Hardening
--
-- Objective:
--   Revoke direct table UPDATE privilege on public.appointments from
--   authenticated and anon roles.
--
-- Architectural Rules:
--   1. Appointment status transitions MUST use public.transition_appointment_status RPC.
--   2. Appointment check-in into queue MUST use public.check_in_appointment_to_queue RPC.
--   3. SELECT and INSERT privileges remain granted to authenticated for reading
--      and booking creation.
--   4. service_role retains full administrative privileges.
--   5. Existing RLS policies remain untouched.
-- ============================================================================

-- 1. Revoke direct UPDATE privilege from authenticated and anon
REVOKE UPDATE ON TABLE public.appointments FROM authenticated;
REVOKE UPDATE ON TABLE public.appointments FROM anon;

-- 2. Explicitly preserve SELECT and INSERT for authenticated
GRANT SELECT, INSERT ON TABLE public.appointments TO authenticated;

-- 3. Preserve service_role full administrative privilege
GRANT ALL ON TABLE public.appointments TO service_role;

-- 4. Comment on table for schema audit transparency
COMMENT ON TABLE public.appointments IS
  'Appointments table. Direct client UPDATE revoked; status transitions require transition_appointment_status RPC and check-in requires check_in_appointment_to_queue RPC.';

-- 5. Automated privilege assertion block
DO $$
BEGIN
  -- Assert authenticated cannot UPDATE appointments directly
  IF has_table_privilege('authenticated', 'public.appointments', 'UPDATE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated still has UPDATE privilege on public.appointments';
  END IF;

  -- Assert anon cannot UPDATE appointments directly
  IF has_table_privilege('anon', 'public.appointments', 'UPDATE') THEN
    RAISE EXCEPTION 'Security assertion failed: anon still has UPDATE privilege on public.appointments';
  END IF;

  -- Assert authenticated retains SELECT on appointments
  IF NOT has_table_privilege('authenticated', 'public.appointments', 'SELECT') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated lost SELECT privilege on public.appointments';
  END IF;

  -- Assert authenticated retains INSERT on appointments
  IF NOT has_table_privilege('authenticated', 'public.appointments', 'INSERT') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated lost INSERT privilege on public.appointments';
  END IF;

  -- Assert service_role retains UPDATE on appointments
  IF NOT has_table_privilege('service_role', 'public.appointments', 'UPDATE') THEN
    RAISE EXCEPTION 'Security assertion failed: service_role lost UPDATE privilege on public.appointments';
  END IF;

  -- Assert RPC privileges if functions exist in catalog
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'transition_appointment_status') THEN
    IF NOT has_function_privilege('authenticated', 'public.transition_appointment_status(uuid,uuid,appointment_status_enum,appointment_status_enum)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Security assertion failed: authenticated cannot EXECUTE transition_appointment_status';
    END IF;
    IF has_function_privilege('anon', 'public.transition_appointment_status(uuid,uuid,appointment_status_enum,appointment_status_enum)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Security assertion failed: anon has EXECUTE privilege on transition_appointment_status';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_in_appointment_to_queue') THEN
    IF NOT has_function_privilege('authenticated', 'public.check_in_appointment_to_queue(uuid,uuid,uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Security assertion failed: authenticated cannot EXECUTE check_in_appointment_to_queue';
    END IF;
    IF has_function_privilege('anon', 'public.check_in_appointment_to_queue(uuid,uuid,uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Security assertion failed: anon has EXECUTE privilege on check_in_appointment_to_queue';
    END IF;
  END IF;
END;
$$;
