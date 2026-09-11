-- Explicit execution privileges for atomic weekly employee schedule RPC.

REVOKE ALL ON FUNCTION public.save_employee_weekly_schedule(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_employee_weekly_schedule(uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.save_employee_weekly_schedule(uuid, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_employee_weekly_schedule(uuid, uuid, jsonb) TO authenticated;
