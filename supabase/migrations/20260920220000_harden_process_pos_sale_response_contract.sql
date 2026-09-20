-- ============================================================================
-- FIX: POS SALE RESPONSE CONTRACT
-- ============================================================================
-- The mobile POS client validates that process_pos_sale_with_loyalty returns
-- a boolean is_duplicate field. The underlying process_pos_sale previously
-- omitted is_duplicate on the normal-success path.
--
-- This migration preserves the existing POS engine and only normalizes its
-- response contract:
--   - normal success => is_duplicate = false
--   - idempotent duplicate => preserve is_duplicate = true
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_pos_sale(
  p_outlet_id uuid,
  p_idempotency_key character varying,
  p_cashier_id uuid,
  p_customer_id uuid,
  p_cash_session_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount_amount numeric DEFAULT 0.00,
  p_notes text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_profile_id uuid;
  v_item jsonb;
  v_item_type text;
  v_product_id uuid;
  v_payment jsonb;
  v_payment_method_id uuid;
  v_financial_account_id uuid;
  v_sale_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_caller_profile_id
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

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_item_type := v_item->>'item_type';

    IF v_item_type = 'PRODUCT' THEN
      BEGIN
        v_product_id := (v_item->>'product_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid product_id in sale item' USING ERRCODE = '22P02';
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM products p
        JOIN product_outlets po ON po.product_id = p.id
        WHERE p.id = v_product_id
          AND p.is_active = TRUE
          AND po.outlet_id = p_outlet_id
          AND po.is_active = TRUE
      ) THEN
        RAISE EXCEPTION 'Product % is not active or priced for outlet %', v_product_id, p_outlet_id;
      END IF;
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_item_type := v_item->>'item_type';

    IF v_item ? 'barber_id' AND NULLIF(TRIM(v_item->>'barber_id'), '') IS NOT NULL THEN
      BEGIN
        v_product_id := (v_item->>'barber_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid barber_id in sale item' USING ERRCODE = '22P02';
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM employee_outlets eo
        JOIN employees e ON e.id = eo.employee_id
        WHERE eo.employee_id = v_product_id
          AND eo.outlet_id = p_outlet_id
          AND eo.is_active = TRUE
          AND e.is_active = TRUE
      ) THEN
        RAISE EXCEPTION 'Barber % is not an active employee assigned to outlet %', v_product_id, p_outlet_id USING ERRCODE = '42501';
      END IF;
    END IF;
  END LOOP;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(COALESCE(p_payments, '[]'::jsonb))
  LOOP
    BEGIN
      v_payment_method_id := (v_payment->>'payment_method_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid payment_method_id in sale payment' USING ERRCODE = '22P02';
    END;

    SELECT financial_account_id INTO v_financial_account_id
    FROM payment_methods
    WHERE id = v_payment_method_id
      AND is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payment method % not found or inactive', v_payment_method_id USING ERRCODE = '42501';
    END IF;

    IF v_financial_account_id IS NULL THEN
      RAISE EXCEPTION 'Payment method % is not linked to a financial account', v_payment_method_id USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM financial_accounts
      WHERE id = v_financial_account_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Financial account % linked to payment method % is inactive or invalid', v_financial_account_id, v_payment_method_id USING ERRCODE = '23514';
    END IF;
  END LOOP;

  v_sale_result := _legacy_process_pos_sale(
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

  IF COALESCE((v_sale_result->>'is_duplicate')::BOOLEAN, FALSE) THEN
    RETURN v_sale_result;
  END IF;

  RETURN v_sale_result || jsonb_build_object('is_duplicate', false);
END;
$function$;