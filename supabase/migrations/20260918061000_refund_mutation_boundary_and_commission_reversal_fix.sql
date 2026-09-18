-- ============================================================================
-- MIGRATION: REFUND MUTATION BOUNDARY + COMMISSION REVERSAL COMPATIBILITY
-- Phase 3F.1
--
-- Objectives:
--   1. Keep commission calculation fields immutable to clients.
--   2. Allow only the atomic refund engine to perform controlled commission
--      reversal for full/partial refunds.
--   3. Remove direct client INSERT privilege from refund documents/items/payments.
--   4. Preserve process_pos_refund as the sole client refund mutation boundary.
-- ============================================================================

DO $$
DECLARE
  v_trigger_sql text;
  v_refund_sql text;
  v_marker text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_trigger_sql
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'prevent_commission_ledger_tampering';

  IF v_trigger_sql IS NULL THEN
    RAISE EXCEPTION 'prevent_commission_ledger_tampering not found';
  END IF;

  IF position('current_setting(''app.internal_refund_commission_reversal'', true)' IN v_trigger_sql) = 0 THEN
    v_marker := 'OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount';

    IF position(v_marker IN v_trigger_sql) = 0 THEN
      RAISE EXCEPTION 'Expected commission_amount immutability clause not found';
    END IF;

    v_trigger_sql := replace(
      v_trigger_sql,
      v_marker,
      '(current_setting(''app.internal_refund_commission_reversal'', true) <> ''1'' AND NEW.commission_amount IS DISTINCT FROM OLD.commission_amount)'
    );

    EXECUTE v_trigger_sql;
  END IF;

  SELECT pg_get_functiondef(p.oid)
    INTO v_refund_sql
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = '_legacy_process_sale_refund'
    AND pg_get_function_identity_arguments(p.oid) = 'p_refund_id uuid, p_processed_by uuid';

  IF v_refund_sql IS NULL THEN
    RAISE EXCEPTION '_legacy_process_sale_refund not found';
  END IF;

  IF position('app.internal_refund_commission_reversal' IN v_refund_sql) = 0 THEN
    v_marker := '-- 3. RESTOCK + COMMISSION REVERSAL';

    IF position(v_marker IN v_refund_sql) = 0 THEN
      RAISE EXCEPTION 'Expected commission reversal section marker not found';
    END IF;

    v_refund_sql := replace(
      v_refund_sql,
      v_marker,
      v_marker || chr(10) ||
      '  PERFORM set_config(''app.internal_refund_commission_reversal'', ''1'', true);'
    );

    v_marker := '  -- 4. REFUND PAYMENTS';

    IF position(v_marker IN v_refund_sql) = 0 THEN
      RAISE EXCEPTION 'Expected refund payment section marker not found';
    END IF;

    v_refund_sql := replace(
      v_refund_sql,
      v_marker,
      '  PERFORM set_config(''app.internal_refund_commission_reversal'', ''0'', true);' || chr(10) ||
      v_marker
    );

    EXECUTE v_refund_sql;
  END IF;
END;
$$;

REVOKE INSERT ON TABLE public.sale_refunds FROM authenticated;
REVOKE INSERT ON TABLE public.sale_refunds FROM anon;

REVOKE INSERT ON TABLE public.sale_refund_items FROM authenticated;
REVOKE INSERT ON TABLE public.sale_refund_items FROM anon;

REVOKE INSERT ON TABLE public.sale_refund_payments FROM authenticated;
REVOKE INSERT ON TABLE public.sale_refund_payments FROM anon;

REVOKE ALL ON FUNCTION public.process_pos_refund(UUID, UUID, JSONB, TEXT, UUID, UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.process_pos_refund(UUID, UUID, JSONB, TEXT, UUID, UUID)
TO authenticated, service_role;

COMMENT ON TABLE public.sale_refunds IS
  'Refund documents. Direct client INSERT revoked; refund creation and processing use atomic process_pos_refund RPC.';

COMMENT ON TABLE public.sale_refund_items IS
  'Refund items. Direct client INSERT revoked; created atomically by process_pos_refund.';

COMMENT ON TABLE public.sale_refund_payments IS
  'Refund payment allocations. Direct client INSERT revoked; created atomically by process_pos_refund.';

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.sale_refunds', 'INSERT') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can INSERT sale_refunds';
  END IF;

  IF has_table_privilege('authenticated', 'public.sale_refund_items', 'INSERT') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can INSERT sale_refund_items';
  END IF;

  IF has_table_privilege('authenticated', 'public.sale_refund_payments', 'INSERT') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can INSERT sale_refund_payments';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.sale_refunds', 'SELECT') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated lost SELECT on sale_refunds';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.sale_refund_items', 'SELECT') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated lost SELECT on sale_refund_items';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.sale_refund_payments', 'SELECT') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated lost SELECT on sale_refund_payments';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.process_pos_refund(uuid,uuid,jsonb,text,uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated cannot EXECUTE process_pos_refund';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.process_pos_refund(uuid,uuid,jsonb,text,uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: anon can EXECUTE process_pos_refund';
  END IF;
END;
$$;
