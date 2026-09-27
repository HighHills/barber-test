-- 20260927000001_harden_employee_outlet_rls_boundary.sql
-- Staff & Barber Phase 1: restrict employee directory data to authorized outlet scope.
-- Owner/Admin retain global employee/assignment visibility for master administration.
-- Operational authenticated users only see rows tied to an outlet they can access.

DROP POLICY IF EXISTS employees_select ON public.employees;

CREATE POLICY employees_select
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (
    public.is_owner_or_admin()
    OR EXISTS (
      SELECT 1
      FROM public.employee_outlets eo
      WHERE eo.employee_id = employees.id
        AND eo.is_active = TRUE
        AND public.current_user_has_outlet_access(eo.outlet_id)
    )
  );

DROP POLICY IF EXISTS employees_admin ON public.employees;

CREATE POLICY employees_admin
  ON public.employees
  FOR ALL
  TO authenticated
  USING (public.is_owner_or_admin())
  WITH CHECK (public.is_owner_or_admin());

DROP POLICY IF EXISTS employee_outlets_select ON public.employee_outlets;

CREATE POLICY employee_outlets_select
  ON public.employee_outlets
  FOR SELECT
  TO authenticated
  USING (public.current_user_has_outlet_access(outlet_id));

DROP POLICY IF EXISTS employee_outlets_admin ON public.employee_outlets;

CREATE POLICY employee_outlets_admin
  ON public.employee_outlets
  FOR ALL
  TO authenticated
  USING (public.is_owner_or_admin())
  WITH CHECK (public.is_owner_or_admin());

DROP POLICY IF EXISTS employee_schedules_select ON public.employee_schedules;

CREATE POLICY employee_schedules_select
  ON public.employee_schedules
  FOR SELECT
  TO authenticated
  USING (public.current_user_has_outlet_access(outlet_id));
