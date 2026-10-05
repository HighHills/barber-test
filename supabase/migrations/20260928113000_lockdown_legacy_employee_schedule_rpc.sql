-- Phase 4F: retire the legacy single-day employee schedule mutation RPC.
-- The Web client uses public.save_employee_weekly_schedule(...) as the
-- authoritative atomic mutation boundary.
--
-- Keep the legacy function definition for compatibility with stored objects,
-- but remove Data API execution from anonymous and authenticated clients.
-- service_role remains available for controlled server-side administration.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.save_employee_schedule(uuid,uuid,uuid,smallint,time,time,time,time,boolean)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.save_employee_schedule(
      uuid, uuid, uuid, smallint, time without time zone, time without time zone,
      time without time zone, time without time zone, boolean
    ) FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;

COMMIT;
