-- ============================================================================
-- BARBERSHOP OS - MIGRATION 35: FIX EFFECTIVE DISCOUNT ORDER
-- ============================================================================
-- Migration 34 introduced a stronger idempotency check, but the duplicate
-- branch must compare against the effective discount before the early return.
-- Patch the function definition in-place using PostgreSQL's canonical function
-- definition so the migration remains aligned with the latest function body.

DO $$
DECLARE
  v_function_oid OID;
  v_definition TEXT;
BEGIN
  SELECT p.oid
    INTO v_function_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'process_pos_sale_with_loyalty'
    AND p.pronargs = 10;

  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'Migration 35: process_pos_sale_with_loyalty function not found';
  END IF;

  v_definition := pg_get_functiondef(v_function_oid);

  IF position('v_total_discount := v_discount_amount + v_loyalty_discount;' IN v_definition) = 0 THEN
    v_definition := replace(
      v_definition,
      E'  -- 5. Idempotency Misuse Guard',
      E'  -- Compute the effective discount before any duplicate-key return.\n'
      || E'  v_loyalty_discount := v_loyalty_points * 100.00;\n'
      || E'  v_total_discount := v_discount_amount + v_loyalty_discount;\n\n'
      || E'  -- 5. Idempotency Misuse Guard'
    );
  END IF;

  EXECUTE v_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
