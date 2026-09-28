-- Phase 4F: Lock down direct employee leave/schedule mutations.
-- Clients read these tables directly but must mutate through authoritative RPCs:
--   public.save_employee_leave(...)
--   public.save_employee_weekly_schedule(...)
--
-- This preserves SELECT for authenticated users while removing direct
-- INSERT/UPDATE/DELETE access through the Data API.

BEGIN;

REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.employee_leaves
  FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.employee_schedules
  FROM anon, authenticated;

GRANT SELECT
  ON TABLE public.employee_leaves
  TO authenticated;

GRANT SELECT
  ON TABLE public.employee_schedules
  TO authenticated;

COMMIT;
