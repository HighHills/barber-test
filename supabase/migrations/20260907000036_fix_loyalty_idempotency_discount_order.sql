-- ============================================================================
-- BARBERSHOP OS - MIGRATION 36: FINALIZE EFFECTIVE DISCOUNT ORDER
-- ============================================================================
-- Ensure the effective discount is initialized before the duplicate-key branch
-- in process_pos_sale_with_loyalty(). Migration 35 intentionally used a
-- canonical function-definition rewrite; this migration makes the insertion
-- unconditional and idempotent by checking for the exact pre-guard marker.

DO $$
DECLARE
  v_function_oid OID;
  v_definition TEXT;
  v_marker TEXT := E'  -- 5. Idempotency Misuse Guard';
  v_injection TEXT :=
      E'  -- Compute the effective discount before any duplicate-key return.\n'
   || E'  v_loyalty_discount := v_loyalty_points * 100.00;\n'
   || E'  v_total_discount := v_discount_amount + v_loyalty_discount;\n\n'
   || v_marker;
BEGIN
  SELECT p.oid
    INTO v_function_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'process_pos_sale_with_loyalty'
    AND p.pronargs = 10;

  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'Migration 36: process_pos_sale_with_loyalty function not found';
  END IF;

  v_definition := pg_get_functiondef(v_function_oid);

  IF position('v_total_discount := v_discount_amount + v_loyalty_discount;' IN v_definition) = 0 THEN
    IF position(v_marker IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Migration 36: idempotency guard marker not found';
    END IF;

    v_definition := replace(v_definition, v_marker, v_injection);
    EXECUTE v_definition;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
