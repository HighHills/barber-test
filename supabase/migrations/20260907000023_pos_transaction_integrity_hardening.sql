-- 20260907000023_pos_transaction_integrity_hardening.sql
-- Harden process_pos_sale invariants without changing its public API.
--
-- Findings addressed from live definition:
--   * barber_id is accepted from the item payload but was not explicitly
--     required to be an active employee assigned to the sale outlet.
--   * payment_method_id was checked for existence but not explicitly for an
--     active payment method and active linked financial account.
--
-- The original implementation is retained under an internal name and a
-- SECURITY DEFINER wrapper performs the additional server-side invariants.

-- ============================================================================
-- 1. RENAME ORIGINAL IMPLEMENTATION
-- ============================================================================
ALTER FUNCTION process_pos_sale(UUID, VARCHAR, UUID, UUID, UUID, JSONB, JSONB, NUMERIC, TEXT)
  RENAME TO _legacy_process_pos_sale;

REVOKE ALL ON FUNCTION _legacy_process_pos_sale(UUID, VARCHAR, UUID, UUID, UUID, JSONB, JSONB, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;


-- ============================================================================
-- 2. SECURE WRAPPER
-- ============================================================================
CREATE OR REPLACE FUNCTION process_pos_sale(
  p_outlet_id UUID,
  p_idempotency_key VARCHAR,
  p_cashier_id UUID,
  p_customer_id UUID,
  p_cash_session_id UUID,
  p_items JSONB,
  p_payments JSONB,
  p_discount_amount NUMERIC DEFAULT 0.00,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_profile_id UUID;
  v_item JSONB;
  v_payment JSONB;
  v_item_type TEXT;
  v_barber_id UUID;
  v_payment_method_id UUID;
  v_financial_account_id UUID;
BEGIN
  -- The legacy implementation already performs the authoritative caller,
  -- cashier, outlet permission, pricing, payment-sum, inventory, commission,
  -- accounting, and audit checks. Reject malformed/unauthorized related IDs
  -- before handing control to it.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT id
    INTO v_caller_profile_id
    FROM profiles
   WHERE auth_user_id = auth.uid()
     AND is_active = TRUE
   LIMIT 1;

  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Active user profile not found for authenticated caller' USING ERRCODE = '42501';
  END IF;

  IF NOT is_owner_or_admin() AND p_cashier_id <> v_caller_profile_id THEN
    RAISE EXCEPTION 'Caller is not authorized for cashier profile %', p_cashier_id USING ERRCODE = '42501';
  END IF;

  -- Every supplied barber must be an active employee assigned to the sale
  -- outlet. NULL remains allowed for item types that intentionally have no
  -- barber association (for example product-only sales).
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_item_type := v_item->>'item_type';

    IF v_item ? 'barber_id'
       AND NULLIF(TRIM(v_item->>'barber_id'), '') IS NOT NULL THEN
      BEGIN
        v_barber_id := (v_item->>'barber_id')::UUID;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid barber_id in sale item' USING ERRCODE = '22P02';
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM employee_outlets eo
        JOIN employees e ON e.id = eo.employee_id
        WHERE eo.employee_id = v_barber_id
          AND eo.outlet_id = p_outlet_id
          AND eo.is_active = TRUE
          AND e.is_active = TRUE
      ) THEN
        RAISE EXCEPTION 'Barber % is not an active employee assigned to outlet %',
          v_barber_id, p_outlet_id USING ERRCODE = '42501';
      END IF;
    ELSIF v_item_type = 'SERVICE' THEN
      -- Preserve existing behavior: a service item may be recorded without a
      -- barber when the current product/service model permits it.
      NULL;
    END IF;
  END LOOP;

  -- Payment methods are global, but must be active and linked to an active
  -- financial account before a sale can post accounting entries.
  FOR v_payment IN SELECT value FROM jsonb_array_elements(COALESCE(p_payments, '[]'::jsonb))
  LOOP
    BEGIN
      v_payment_method_id := (v_payment->>'payment_method_id')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid payment_method_id in sale payment' USING ERRCODE = '22P02';
    END;

    SELECT financial_account_id
      INTO v_financial_account_id
      FROM payment_methods
     WHERE id = v_payment_method_id
       AND is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payment method % not found or inactive',
        v_payment_method_id USING ERRCODE = '42501';
    END IF;

    IF v_financial_account_id IS NULL THEN
      RAISE EXCEPTION 'Payment method % is not linked to a financial account',
        v_payment_method_id USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM financial_accounts
      WHERE id = v_financial_account_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Financial account % linked to payment method % is inactive or invalid',
        v_financial_account_id, v_payment_method_id USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN _legacy_process_pos_sale(
    p_outlet_id,
    p_idempotency_key,
    p_cashier_id,
    p_customer_id,
    p_cash_session_id,
    p_items,
    p_payments,
    p_discount_amount,
    p_notes
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION process_pos_sale(UUID, VARCHAR, UUID, UUID, UUID, JSONB, JSONB, NUMERIC, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION process_pos_sale(UUID, VARCHAR, UUID, UUID, UUID, JSONB, JSONB, NUMERIC, TEXT)
  TO authenticated, service_role;


-- ============================================================================
-- 3. ASSERTIONS
-- ============================================================================
DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'process_pos_sale(UUID,VARCHAR,UUID,UUID,UUID,JSONB,JSONB,NUMERIC,TEXT)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute process_pos_sale';
  END IF;

  IF has_function_privilege(
    'authenticated',
    '_legacy_process_pos_sale(UUID,VARCHAR,UUID,UUID,UUID,JSONB,JSONB,NUMERIC,TEXT)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can execute legacy process_pos_sale';
  END IF;
END;
$$;
