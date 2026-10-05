-- ============================================================================
-- BARBERSHOP OS - MIGRATION 34: POS LOYALTY IDEMPOTENCY GUARD
-- ============================================================================
-- Strengthen replay protection for the public atomic loyalty checkout RPC.
-- A reused (outlet_id, idempotency_key) must represent the same cashier,
-- cash session, customer, loyalty redemption, and effective discount.
-- This complements the unique constraint and prevents a semantically different
-- retry from silently receiving the original sale.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS loyalty_checkout_fingerprint VARCHAR(32);

CREATE OR REPLACE FUNCTION public.process_pos_sale_with_loyalty(p_outlet_id uuid, p_idempotency_key character varying, p_cashier_id uuid, p_customer_id uuid, p_cash_session_id uuid, p_items jsonb, p_payments jsonb, p_discount_amount numeric DEFAULT 0.00, p_notes text DEFAULT NULL::text, p_loyalty_points integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor UUID;
  v_jwt_role TEXT := COALESCE(
    current_setting('request.jwt.claim.role', TRUE),
    ''
  );

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

  v_fingerprint VARCHAR(32);
BEGIN
  -- ==========================================================================
  -- 1. Authentication requirement
  -- ==========================================================================
  IF auth.uid() IS NULL AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- ==========================================================================
  -- 2. Resolve authoritative cashier / actor profile
  -- ==========================================================================
  v_actor := _security_current_actor_profile(p_cashier_id);

  -- ==========================================================================
  -- 3. Enforce POS sale creation permission on outlet
  -- ==========================================================================
  IF v_jwt_role <> 'service_role'
     AND NOT (
       is_owner_or_admin()
       OR current_user_has_permission('pos.sale.create', p_outlet_id)
     )
  THEN
    RAISE EXCEPTION
      'Akses ditolak: Anda tidak memiliki izin untuk memproses transaksi POS'
      USING ERRCODE = '42501';
  END IF;

  -- ==========================================================================
  -- 4. Basic input sanity
  -- ==========================================================================
  IF v_loyalty_points < 0 THEN
    RAISE EXCEPTION
      'Jumlah poin loyalty tidak boleh bernilai negatif'
      USING ERRCODE = '22023';
  END IF;

  IF v_discount_amount < 0 THEN
    RAISE EXCEPTION
      'Nilai diskon tidak boleh bernilai negatif'
      USING ERRCODE = '22023';
  END IF;

  -- ==========================================================================
  -- Build deterministic fingerprint from the complete checkout request.
  -- jsonb canonicalization makes object-key ordering irrelevant.
  -- ==========================================================================
  v_fingerprint := md5(
    jsonb_build_object(
      'outlet_id', p_outlet_id,
      'cashier_id', p_cashier_id,
      'customer_id', p_customer_id,
      'cash_session_id', p_cash_session_id,
      'items', p_items,
      'payments', p_payments,
      'discount_amount', v_discount_amount,
      'notes', p_notes,
      'loyalty_points', v_loyalty_points
    )::TEXT
  );

  -- ==========================================================================
  -- 5. Calculate effective discount BEFORE duplicate/idempotency return
  -- ==========================================================================
  v_loyalty_discount := v_loyalty_points * 100.00;
  v_total_discount := v_discount_amount + v_loyalty_discount;

  -- ==========================================================================
  -- 6. Idempotency misuse guard
  -- ==========================================================================
  SELECT
    id,
    invoice_number,
    total_amount,
    customer_id,
    created_by,
    cash_session_id,
    discount_amount,
    loyalty_points_redeemed,
    loyalty_discount_amount,
    loyalty_checkout_fingerprint
  INTO v_existing_sale
  FROM public.sales
  WHERE outlet_id = p_outlet_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN

    -- Same idempotency key cannot be reused for another customer.
    IF v_existing_sale.customer_id IS DISTINCT FROM p_customer_id THEN
      RAISE EXCEPTION
        'Idempotency conflict: transaction with key "%" belongs to another customer',
        p_idempotency_key
        USING ERRCODE = '23505';
    END IF;

    -- Same key cannot be reused with different loyalty redemption.
    IF v_existing_sale.loyalty_points_redeemed IS DISTINCT FROM v_loyalty_points THEN
      RAISE EXCEPTION
        'Idempotency conflict: transaction with key "%" was executed with % loyalty points',
        p_idempotency_key,
        v_existing_sale.loyalty_points_redeemed
        USING ERRCODE = '23505';
    END IF;

    -- Same key cannot be reused by another cashier.
    IF v_existing_sale.created_by IS DISTINCT FROM p_cashier_id THEN
      RAISE EXCEPTION
        'Idempotency conflict: transaction with key "%" belongs to another cashier',
        p_idempotency_key
        USING ERRCODE = '23505';
    END IF;

    -- Same key cannot be reused under another cash session.
    IF v_existing_sale.cash_session_id IS DISTINCT FROM p_cash_session_id THEN
      RAISE EXCEPTION
        'Idempotency conflict: transaction with key "%" belongs to another cash session',
        p_idempotency_key
        USING ERRCODE = '23505';
    END IF;

    -- Compare against the EFFECTIVE discount:
    -- normal discount + loyalty discount.
    IF v_existing_sale.discount_amount IS DISTINCT FROM v_total_discount THEN
      RAISE EXCEPTION
        'Idempotency conflict: transaction with key "%" was executed with another discount',
        p_idempotency_key
        USING ERRCODE = '23505';
    END IF;

    -- New sales created by this migration carry a complete request fingerprint.
    -- Legacy sales remain compatible through the row-level checks above.
    IF v_existing_sale.loyalty_checkout_fingerprint IS NOT NULL
       AND v_existing_sale.loyalty_checkout_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION
        'Idempotency conflict: transaction with key "%" was created from a different checkout request',
        p_idempotency_key
        USING ERRCODE = '23505';
    END IF;

    -- Safe idempotent response. No second sale, redeem, or earn.
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

  -- ==========================================================================
  -- 7. Customer & loyalty balance validation
  -- ==========================================================================
  IF v_loyalty_points > 0 THEN

    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION
        'Customer wajib diisi saat menukarkan loyalty points'
        USING ERRCODE = '22023';
    END IF;

    SELECT
      current_loyalty_points,
      is_active
    INTO v_customer
    FROM public.customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND OR NOT v_customer.is_active THEN
      RAISE EXCEPTION
        'Customer % tidak ditemukan atau tidak aktif',
        p_customer_id
        USING ERRCODE = '22023';
    END IF;

    IF v_loyalty_points > v_customer.current_loyalty_points THEN
      RAISE EXCEPTION
        'Saldo poin tidak mencukupi. Saldo saat ini: %, diminta: %',
        v_customer.current_loyalty_points,
        v_loyalty_points
        USING ERRCODE = '22023',
        DETAIL = 'Loyalty redemption exceeded current balance';
    END IF;

  END IF;

  -- ==========================================================================
  -- 8. Delegate to authoritative POS sale engine
  -- ==========================================================================
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

  -- ==========================================================================
  -- 9. Handle duplicate returned by underlying POS function / race condition
  -- ==========================================================================
  IF COALESCE(
    (v_sale_result->>'is_duplicate')::BOOLEAN,
    FALSE
  ) = TRUE THEN

    SELECT
      id,
      customer_id,
      created_by,
      cash_session_id,
      discount_amount,
      loyalty_points_redeemed,
      loyalty_discount_amount,
      loyalty_checkout_fingerprint
    INTO v_existing_sale
    FROM public.sales
    WHERE id = (v_sale_result->>'sale_id')::UUID;

    IF v_existing_sale.customer_id IS DISTINCT FROM p_customer_id
       OR v_existing_sale.created_by IS DISTINCT FROM p_cashier_id
       OR v_existing_sale.cash_session_id IS DISTINCT FROM p_cash_session_id
       OR v_existing_sale.loyalty_points_redeemed IS DISTINCT FROM v_loyalty_points
       OR v_existing_sale.discount_amount IS DISTINCT FROM v_total_discount
    THEN
      RAISE EXCEPTION
        'Idempotency conflict: concurrent transaction reused the key with different parameters'
        USING ERRCODE = '23505';
    END IF;

    IF v_existing_sale.loyalty_checkout_fingerprint IS NOT NULL
       AND v_existing_sale.loyalty_checkout_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION
        'Idempotency conflict: concurrent transaction reused the key with a different checkout request'
        USING ERRCODE = '23505';
    END IF;

    RETURN v_sale_result;
  END IF;

  -- ==========================================================================
  -- 10. Persist authoritative loyalty breakdown + fingerprint
  -- ==========================================================================
  v_sale_id := (v_sale_result->>'sale_id')::UUID;
  v_server_total := (v_sale_result->>'total_amount')::NUMERIC;

  UPDATE public.sales
  SET
    loyalty_points_redeemed = v_loyalty_points,
    loyalty_discount_amount = v_loyalty_discount,
    loyalty_checkout_fingerprint = v_fingerprint
  WHERE id = v_sale_id;

  -- ==========================================================================
  -- 11. Atomic loyalty redemption
  -- ==========================================================================
  IF v_loyalty_points > 0 THEN
    PERFORM public.redeem_loyalty_points(
      p_customer_id,
      p_outlet_id,
      v_sale_id,
      v_loyalty_points,
      v_actor
    );
  END IF;

  -- ==========================================================================
  -- 12. Authoritative loyalty earning
  -- ==========================================================================
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

  -- ==========================================================================
  -- 13. Return composite transaction receipt
  -- ==========================================================================
  RETURN v_sale_result || jsonb_build_object(
    'points_redeemed', v_loyalty_points,
    'loyalty_discount', v_loyalty_discount,
    'points_earned', COALESCE(v_points_earned, 0),
    'new_points_balance', v_final_points
  );

END;
$function$;

REVOKE ALL ON FUNCTION public.process_pos_sale_with_loyalty(
  UUID, VARCHAR, UUID, UUID, UUID, JSONB, JSONB, NUMERIC, TEXT, INTEGER
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.process_pos_sale_with_loyalty(
  UUID, VARCHAR, UUID, UUID, UUID, JSONB, JSONB, NUMERIC, TEXT, INTEGER
) TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.process_pos_sale_with_loyalty(UUID,VARCHAR,UUID,UUID,UUID,JSONB,JSONB,NUMERIC,TEXT,INTEGER)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute process_pos_sale_with_loyalty';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.process_pos_sale_with_loyalty(UUID,VARCHAR,UUID,UUID,UUID,JSONB,JSONB,NUMERIC,TEXT,INTEGER)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated cannot execute process_pos_sale_with_loyalty';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
