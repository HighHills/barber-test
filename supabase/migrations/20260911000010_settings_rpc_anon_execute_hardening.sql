-- Phase 2B preflight: privileged Settings/POS SECURITY DEFINER RPCs must never be callable by anon.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN (
        'save_business_settings','save_outlet','save_employee','set_employee_outlet',
        'save_employee_schedule','save_employee_leave','list_settings_users',
        'save_custom_role','save_role_permissions','save_user_role','set_user_active',
        'save_pos_service_catalog','save_pos_product_catalog',
        'deactivate_pos_service_catalog','deactivate_pos_product_catalog'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.fn);
  END LOOP;
END $$;
