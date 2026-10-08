-- Supabase projects created after the Data API grant default changed need
-- explicit table ACLs. Authenticated reads remain subject to per-table RLS.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Rate-limit state is internal to SECURITY DEFINER helpers, never a Data API table.
REVOKE ALL ON public.public_booking_phone_limits FROM PUBLIC, anon, authenticated, service_role;

-- Legacy catalog mutators are not public booking endpoints.
DO $$
DECLARE
  routine regprocedure;
BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('delete_catalog_item', 'upsert_catalog_product', 'upsert_catalog_service')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', routine);
  END LOOP;
END $$;
