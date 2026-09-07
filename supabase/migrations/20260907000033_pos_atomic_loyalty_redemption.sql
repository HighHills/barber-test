-- ============================================================================
-- BARBERSHOP OS - MIGRATION 33: ATOMIC POS CHECKOUT & LOYALTY REDEMPTION
-- ============================================================================
-- Goals:
--   1. Add loyalty breakdown columns with strict mathematical consistency
--      constraints to public.sales (loyalty_points_redeemed, loyalty_discount_amount).
--   2. Revoke direct authenticated access from both redeem_loyalty_points()
--      and award_loyalty_points() to eliminate independent client mutation primitives.
--   3. Create top-level atomic checkout RPC public.process_pos_sale_with_loyalty()
--      that performs checkout, loyalty redemption, and loyalty point award in a single
--      database transaction with row-locking and idempotency misuse protection.
--   4. Keep recalculate_customer_tier() private to service_role / internal procedures.
--   5. Execute comprehensive security assertions.

-- ============================================================================
-- 1. SALES TABLE SCHEMA ENHANCEMENT & CONSISTENCY CONSTRAINTS
-- ============================================================================
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sales_loyalty_points_nonnegative'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT chk_sales_loyalty_points_nonnegative
      CHECK (loyalty_points_redeemed >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sales_loyalty_discount_nonnegative'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT chk_sales_loyalty_discount_nonnegative
      CHECK (loyalty_discount_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sales_loyalty_discount_points_consistency'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT chk_sales_loyalty_discount_points_consistency
      CHECK (loyalty_discount_amount = (loyalty_points_redeemed * 100.00));
  END IF;
END;
$$;

-- ============================================================================
-- 2. REVOKE STANDALONE MUTATION PRIMITIVES FROM CLIENT ROLES
-- ============================================================================
-- Loyalty redemption must not be an application-facing mutation primitive.
REVOKE ALL ON FUNCTION public.redeem_loyalty_points(
  UUID, UUID, UUID, INTEGER, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(
  UUID, UUID, UUID, INTEGER, UUID
) TO service_role;

-- Loyalty awarding must not be callable by authenticated clients independently.
REVOKE ALL ON FUNCTION public.award_loyalty_points(
  UUID, UUID, UUID, NUMERIC, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.award_loyalty_points(
  UUID, UUID, UUID, NUMERIC, UUID
) TO service_role;


-- ============================================================================
-- 3. TOP-LEVEL ATOMIC POS + LOYALTY TRANSACTION RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_pos_sale_with_loyalty(
  p_outlet_id UUID,
  p_idempotency_key VARCHAR,
  p_cashier_id UUID,
  p_customer_id UUID,
  p_cash_session_id UUID,
  p_items JSONB,
  p_payments JSONB,
  p_discount_amount NUMERIC DEFAULT 0.00,
  p_notes TEXT DEFAULT NULL,
  p_loyalty_points INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
  v_loyalty_points INTEGER := COALESCE(p_loyalty_points, 0);
  v_discount_amount NUMERIC := COALESCE(p_discount_amount, 0.00);
  v_loyalty_discount NUMERIC := 0.00;
  v_total_discount NUMERIC := 0.00;
  v_customer RECORD;
  v_existing_sale RECORD;
  v_sale_result JSONB;
  v_sale_id UUID;
  v_server_total NUMERIC;
  v_points_earned INTEGER := 0;
  v_final_points INTEGER;
BEGIN
  -- 1. Authentication requirement
  IF auth.uid() IS NULL AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Resolve authoritative cashier / actor profile
  v_actor := _security_current_actor_profile(p_cashier_id);

  -- 3. Enforce POS sale creation permission on outlet
  IF v_jwt_role <> 'service_role'
     AND NOT (
       is_owner_or_admin()
       OR current_user_has_permission('pos.sale.create', p_outlet_id)
     ) THEN
    RAISE EXCEPTION
      'Akses ditolak: Anda tidak memiliki izin untuk memproses transaksi POS'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Basic input sanity
  IF v_loyalty_points < 0 THEN
    RAISE EXCEPTION 'Jumlah poin loyalty tidak boleh bernilai negatif' USING ERRCODE = '22023';
  END IF;

  IF v_discount_amount < 0 THEN
    RAISE EXCEPTION 'Nilai diskon tidak boleh bernilai negatif' USING ERRCODE = '22023';
  END IF;

  -- 5. Idempotency Misuse Guard
  -- Check if an existing transaction already used this (outlet_id, idempotency_key)
  SELECT
    id,
    invoice_number,
    total_amount,
    customer_id,
    loyalty_points_redeemed,
    loyalty_discount_amount
  INTO v_existing_sale
  FROM public.sales
  WHERE outlet_id = p_outlet_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    -- Strict idempotency validation: mismatch in key parameters must be rejected without mutation
    IF v_existing_sale.customer_id IS DISTINCT FROM p_customer_id THEN
      RAISE EXCEPTION
        'Idempotency conflict: transaction with key "%" belongs to another customer',
        p_idempotency_key USING ERRCODE = '23505';
    END IF;

    IF v_existing_sale.loyalty_points_redeemed IS DISTINCT FROM v_loyalty_points THEN
      RAISE EXCEPTION
        'Idempotency conflict: transaction with key "%" was executed with % loyalty points',
        p_idempotency_key, v_existing_sale.loyalty_points_redeemed USING ERRCODE = '23505';
    END IF;

    -- Return the existing committed result safely without re-redeeming or re-earning
    RETURN jsonb_build_object(
      'success', true,
      'is_duplicate', true,
      'sale_id', v_existing_sale.id,
      'invoice_number', v_existing_sale.invoice_number,
      'total_amount', v_existing_sale.total_amount,
      'points_redeemed', v_existing_sale.loyalty_points_redeemed,
      'loyalty_discount', v_existing_sale.loyalty_discount_amount
    );
  END IF;

  -- 6. Customer & Loyalty Balance Validation (Row-locked)
  IF v_loyalty_points > 0 THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION
        'Customer wajib diisi saat menukarkan loyalty points'
        USING ERRCODE = '22023';
    END IF;

    SELECT current_loyalty_points, is_active
    INTO v_customer
    FROM public.customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND OR NOT v_customer.is_active THEN
      RAISE EXCEPTION 'Customer % tidak ditemukan atau tidak aktif', p_customer_id USING ERRCODE = '22023';
    END IF;

    IF v_loyalty_points > v_customer.current_loyalty_points THEN
      RAISE EXCEPTION
        'Saldo poin tidak mencukupi. Saldo saat ini: %, diminta: %',
        v_customer.current_loyalty_points, v_loyalty_points
        USING ERRCODE = '22023', DETAIL = 'Loyalty redemption exceeded current balance';
    END IF;
  END IF;

  -- 7. Calculate server-verified loyalty and total discount
  v_loyalty_discount := v_loyalty_points * 100.00;
  v_total_discount := v_discount_amount + v_loyalty_discount;

  -- 8. Delegate to authoritative POS sale engine in the same transaction
  v_sale_result := public.process_pos_sale(
    p_outlet_id,
    p_idempotency_key,
    p_cashier_id,
    p_customer_id,
    p_cash_session_id,
    p_items,
    p_payments,
    v_total_discount,
    p_notes
  );

  -- If process_pos_sale returned a duplicate (e.g. race condition), return it directly
  IF COALESCE((v_sale_result->>'is_duplicate')::BOOLEAN, FALSE) = TRUE THEN
    RETURN v_sale_result;
  END IF;

  v_sale_id := (v_sale_result->>'sale_id')::UUID;
  v_server_total := (v_sale_result->>'total_amount')::NUMERIC;

  -- 9. Update sales row with authoritative loyalty breakdown
  UPDATE public.sales
  SET loyalty_points_redeemed = v_loyalty_points,
      loyalty_discount_amount = v_loyalty_discount
  WHERE id = v_sale_id;

  -- 10. Atomic Loyalty Redemption (deducts balance and records REDEEM ledger)
  IF v_loyalty_points > 0 THEN
    PERFORM public.redeem_loyalty_points(
      p_customer_id,
      p_outlet_id,
      v_sale_id,
      v_loyalty_points,
      v_actor
    );
  END IF;

  -- 11. Authoritative Loyalty Earning (calculates from sales.total_amount)
  IF p_customer_id IS NOT NULL THEN
    v_points_earned := public.award_loyalty_points(
      p_customer_id,
      p_outlet_id,
      v_sale_id,
      v_server_total,
      v_actor
    );

    SELECT current_loyalty_points
    INTO v_final_points
    FROM public.customers
    WHERE id = p_customer_id;
  END IF;

  -- 12. Return composite transaction receipt
  RETURN v_sale_result || jsonb_build_object(
    'points_redeemed', v_loyalty_points,
    'loyalty_discount', v_loyalty_discount,
    'points_earned', COALESCE(v_points_earned, 0),
    'new_points_balance', v_final_points
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_pos_sale_with_loyalty(
  UUID, VARCHAR, UUID, UUID, UUID, JSONB, JSONB, NUMERIC, TEXT, INTEGER
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.process_pos_sale_with_loyalty(
  UUID, VARCHAR, UUID, UUID, UUID, JSONB, JSONB, NUMERIC, TEXT, INTEGER
) TO authenticated, service_role;


-- ============================================================================
-- 4. SECURITY ASSERTIONS & PRIVILEGE VERIFICATION
-- ============================================================================
DO $$
BEGIN
  -- 1. anon cannot execute top-level loyalty checkout RPC
  IF has_function_privilege(
    'anon',
    'public.process_pos_sale_with_loyalty(UUID,VARCHAR,UUID,UUID,UUID,JSONB,JSONB,NUMERIC,TEXT,INTEGER)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute process_pos_sale_with_loyalty';
  END IF;

  -- 2. authenticated CAN execute top-level RPC
  IF NOT has_function_privilege(
    'authenticated',
    'public.process_pos_sale_with_loyalty(UUID,VARCHAR,UUID,UUID,UUID,JSONB,JSONB,NUMERIC,TEXT,INTEGER)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated cannot execute process_pos_sale_with_loyalty';
  END IF;

  -- 3. authenticated CANNOT execute helper redemption directly
  IF has_function_privilege(
    'authenticated',
    'public.redeem_loyalty_points(UUID,UUID,UUID,INTEGER,UUID)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can execute redeem_loyalty_points directly';
  END IF;

  -- 4. authenticated CANNOT execute helper award directly
  IF has_function_privilege(
    'authenticated',
    'public.award_loyalty_points(UUID,UUID,UUID,NUMERIC,UUID)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can execute award_loyalty_points directly';
  END IF;

  -- 5. authenticated CANNOT mutate customer_loyalty_ledger directly
  IF has_table_privilege('authenticated', 'public.customer_loyalty_ledger', 'INSERT')
     OR has_table_privilege('authenticated', 'public.customer_loyalty_ledger', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.customer_loyalty_ledger', 'DELETE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can mutate customer_loyalty_ledger';
  END IF;

  -- 6. authenticated CANNOT mutate customer_haircut_history directly
  IF has_table_privilege('authenticated', 'public.customer_haircut_history', 'INSERT')
     OR has_table_privilege('authenticated', 'public.customer_haircut_history', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.customer_haircut_history', 'DELETE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can mutate customer_haircut_history';
  END IF;

  -- 7. authenticated CANNOT execute recalculate_customer_tier directly
  IF has_function_privilege(
    'authenticated',
    'public.recalculate_customer_tier(UUID)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can execute recalculate_customer_tier';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
