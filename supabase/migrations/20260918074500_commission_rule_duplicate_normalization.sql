-- ============================================================================
-- MIGRATION: COMMISSION RULE DUPLICATE NORMALIZATION
-- Phase 3H.1
--
-- Treat NULL and 0 as equivalent for commission_rate/fixed_amount in duplicate
-- detection, matching the semantic normalization performed by save_commission_rule.
-- ============================================================================

DO $$
DECLARE
  v_sql text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_sql
  FROM pg_proc p
  WHERE p.pronamespace='public'::regnamespace
    AND p.proname='save_commission_rule';

  IF v_sql IS NULL THEN
    RAISE EXCEPTION 'save_commission_rule not found';
  END IF;

  v_old := '       AND cr.commission_rate IS NOT DISTINCT FROM p_commission_rate' || chr(10) ||
           '       AND cr.fixed_amount IS NOT DISTINCT FROM p_fixed_amount';

  v_new := '       AND COALESCE(cr.commission_rate, 0) IS NOT DISTINCT FROM COALESCE(p_commission_rate, 0)' || chr(10) ||
           '       AND COALESCE(cr.fixed_amount, 0) IS NOT DISTINCT FROM COALESCE(p_fixed_amount, 0)';

  IF position(v_old IN v_sql)>0 THEN
    EXECUTE replace(v_sql,v_old,v_new);
  END IF;

  SELECT pg_get_functiondef(p.oid)
    INTO v_sql
  FROM pg_proc p
  WHERE p.pronamespace='public'::regnamespace
    AND p.proname='set_commission_rule_active';

  IF v_sql IS NULL THEN
    RAISE EXCEPTION 'set_commission_rule_active not found';
  END IF;

  v_old := '        AND cr.commission_rate IS NOT DISTINCT FROM v_rule.commission_rate' || chr(10) ||
           '        AND cr.fixed_amount IS NOT DISTINCT FROM v_rule.fixed_amount';

  v_new := '        AND COALESCE(cr.commission_rate, 0) IS NOT DISTINCT FROM COALESCE(v_rule.commission_rate, 0)' || chr(10) ||
           '        AND COALESCE(cr.fixed_amount, 0) IS NOT DISTINCT FROM COALESCE(v_rule.fixed_amount, 0)';

  IF position(v_old IN v_sql)>0 THEN
    EXECUTE replace(v_sql,v_old,v_new);
  END IF;
END;
$$;

UPDATE public.commission_rules
SET fixed_amount = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE commission_type='PERCENTAGE'
  AND fixed_amount=0;
