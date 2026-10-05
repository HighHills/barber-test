-- ============================================================================
-- BARBERSHOP OS - HARDEN OPERATIONAL EXPENSE ANONYMOUS BOUNDARY
-- ============================================================================
-- Migration 19 pre-dates the security boundary and granted direct table access
-- and void_expense execution to anon. Expenses are an authenticated, outlet-
-- scoped operational domain; anonymous clients must have no path to read or
-- mutate them.

REVOKE ALL ON TABLE public.expense_categories, public.expenses FROM anon;
REVOKE ALL ON FUNCTION public.void_expense(UUID, TEXT, UUID) FROM anon;

-- Preserve the intended authenticated application boundary. Row-level security
-- and the RPC's server-side authorization remain authoritative.
GRANT EXECUTE ON FUNCTION public.void_expense(UUID, TEXT, UUID) TO authenticated;

-- Historical CREATE OR REPLACE FUNCTION statements did not always declare a
-- search_path. Apply the setting to the effective definitions, including
-- functions replaced by later migrations. This avoids search-path hijacking
-- without rewriting immutable migration history.
DO $$
DECLARE
  function_signature TEXT;
BEGIN
  FOR function_signature IN
    SELECT p.oid::regprocedure::TEXT
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = TRUE
      AND n.nspname = 'public'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', function_signature);
  END LOOP;

  FOR function_signature IN
    SELECT p.oid::regprocedure::TEXT
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = TRUE
      AND n.nspname = 'private'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = private, public, pg_temp', function_signature);
  END LOOP;
END;
$$;
