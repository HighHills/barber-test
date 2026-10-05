BEGIN;

-- PHASE 3F-A: atomic refund boundary + server-side refund integrity hardening.
-- Keeps existing Web-compatible refund document insertion for now while making
-- processing server-authoritative and providing an atomic Mobile-ready RPC.

ALTER TABLE public.sale_refunds
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_refunds_idempotency_key
  ON public.sale_refunds (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

REVOKE UPDATE, DELETE ON TABLE public.sales FROM anon, authenticated;
REVOKE UPDATE, DELETE ON TABLE public.sale_refunds FROM anon, authenticated;
REVOKE UPDATE, DELETE ON TABLE public.sale_refund_items FROM anon, authenticated;
REVOKE UPDATE, DELETE ON TABLE public.sale_refund_payments FROM anon, authenticated;

DROP POLICY IF EXISTS sale_refunds_insert ON public.sale_refunds;
CREATE POLICY sale_refunds_insert
ON public.sale_refunds
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_has_permission('pos.sale.refund', outlet_id)
);

DROP POLICY IF EXISTS sale_refund_items_insert ON public.sale_refund_items;
CREATE POLICY sale_refund_items_insert
ON public.sale_refund_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sale_refunds sr
    WHERE sr.id = sale_refund_items.refund_id
      AND public.current_user_has_permission('pos.sale.refund', sr.outlet_id)
  )
);

DROP POLICY IF EXISTS sale_refund_payments_insert ON public.sale_refund_payments;
CREATE POLICY sale_refund_payments_insert
ON public.sale_refund_payments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sale_refunds sr
    WHERE sr.id = sale_refund_payments.refund_id
      AND public.current_user_has_permission('pos.sale.refund', sr.outlet_id)
  )
);

-- Harden the existing processing entry point. Web may still create its refund
-- rows directly, but nothing is journaled/restocked/reversed until the server
-- independently validates quantities and all financial figures.
CREATE OR REPLACE FUNCTION public.process_sale_refund(
  p_refund_id UUID,
  p_processed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID;
  v_refund RECORD;
  v_sale RECORD;
  v_item RECORD;
  v_expected_subtotal NUMERIC(18,2) := 0.00;
  v_expected_discount NUMERIC(18,2) := 0.00;
  v_expected_tax NUMERIC(18,2) := 0.00;
  v_expected_total NUMERIC(18,2) := 0.00;
  v_prev_refunded_amount NUMERIC(18,2) := 0.00;
  v_expected_item_discount NUMERIC(18,2);
  v_expected_item_tax NUMERIC(18,2);
  v_expected_item_refund NUMERIC(18,2);
  v_payment_total NUMERIC(18,2);
  v_item_count INTEGER;
  v_distinct_item_count INTEGER;
  v_prior_refunded_qty NUMERIC(18,2);
BEGIN
  v_actor := public._security_current_actor_profile(p_processed_by);

  SELECT * INTO v_refund
  FROM public.sale_refunds
  WHERE id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund % not found', p_refund_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = v_refund.sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale linked to refund % not found', p_refund_id USING ERRCODE = 'P0002';
  END IF;

  IF v_refund.outlet_id <> v_sale.outlet_id THEN
    RAISE EXCEPTION 'Refund % outlet does not match the original sale outlet', p_refund_id USING ERRCODE = '42501';
  END IF;

  IF NOT public.current_user_has_permission('pos.sale.refund', v_sale.outlet_id) THEN
    RAISE EXCEPTION 'User lacks permission pos.sale.refund for outlet %', v_sale.outlet_id USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(v_refund.reason), '') IS NULL THEN
    RAISE EXCEPTION 'Refund reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT sale_item_id)
  INTO v_item_count, v_distinct_item_count
  FROM public.sale_refund_items
  WHERE refund_id = p_refund_id;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Refund % has no refund items', p_refund_id USING ERRCODE = '22023';
  END IF;

  IF v_item_count <> v_distinct_item_count THEN
    RAISE EXCEPTION 'Refund % contains duplicate sale items', p_refund_id USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(sr.total_amount), 0.00)
  INTO v_prev_refunded_amount
  FROM public.sale_refunds sr
  WHERE sr.sale_id = v_sale.id
    AND sr.status = 'COMPLETED'
    AND sr.id <> p_refund_id;

  IF v_prev_refunded_amount > v_sale.total_amount + 0.01 THEN
    RAISE EXCEPTION 'Existing refunds already exceed sale total for sale %', v_sale.id USING ERRCODE = '23514';
  END IF;

  FOR v_item IN
    SELECT sri.*,
           si.sale_id AS source_sale_id,
           si.item_type,
           si.quantity AS sold_quantity,
           si.unit_price,
           si.item_discount_amount,
           si.allocated_discount_amount,
           si.tax_amount AS source_tax_amount,
           si.cost_price AS source_cost_price
    FROM public.sale_refund_items sri
    JOIN public.sale_items si ON si.id = sri.sale_item_id
    WHERE sri.refund_id = p_refund_id
  LOOP
    IF v_item.source_sale_id <> v_sale.id THEN
      RAISE EXCEPTION 'Refund item % does not belong to sale %', v_item.sale_item_id, v_sale.id USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(SUM(prior_sri.quantity), 0.00)
    INTO v_prior_refunded_qty
    FROM public.sale_refund_items prior_sri
    JOIN public.sale_refunds prior_sr ON prior_sr.id = prior_sri.refund_id
    WHERE prior_sri.sale_item_id = v_item.sale_item_id
      AND prior_sr.status = 'COMPLETED'
      AND prior_sr.id <> p_refund_id;

    IF v_item.quantity <= 0 OR v_item.quantity > (v_item.sold_quantity - v_prior_refunded_qty) + 0.0001 THEN
      RAISE EXCEPTION 'Refund quantity exceeds remaining quantity for item %', v_item.sale_item_id USING ERRCODE = '23514';
    END IF;

    IF v_item.return_to_inventory IS NULL THEN
      RAISE EXCEPTION 'return_to_inventory must not be null for refund item %', v_item.sale_item_id USING ERRCODE = '22023';
    END IF;

    IF v_item.item_type = 'PRODUCT'
       AND v_item.cost_price IS NOT NULL
       AND v_item.source_cost_price IS NOT NULL
       AND abs(v_item.cost_price - v_item.source_cost_price) > 0.01
    THEN
      RAISE EXCEPTION 'Refund cost price mismatch for item %', v_item.sale_item_id USING ERRCODE = '23514';
    END IF;

    v_expected_subtotal := v_expected_subtotal + round(v_item.unit_price * v_item.quantity, 2);
    v_expected_item_discount := round(
      ((v_item.item_discount_amount + v_item.allocated_discount_amount) / NULLIF(v_item.sold_quantity, 0)) * v_item.quantity,
      2
    );
    v_expected_item_tax := round(
      (v_item.source_tax_amount / NULLIF(v_item.sold_quantity, 0)) * v_item.quantity,
      2
    );
    v_expected_item_refund := greatest(
      0.00,
      round((v_item.unit_price * v_item.quantity) - v_expected_item_discount + v_expected_item_tax, 2)
    );

    v_expected_discount := v_expected_discount + v_expected_item_discount;
    v_expected_tax := v_expected_tax + v_expected_item_tax;

    IF abs(v_item.refund_amount - v_expected_item_refund) > 0.01 THEN
      RAISE EXCEPTION 'Refund amount mismatch for item %', v_item.sale_item_id USING ERRCODE = '23514';
    END IF;

    IF abs(v_item.tax_amount - v_expected_item_tax) > 0.01 THEN
      RAISE EXCEPTION 'Refund tax mismatch for item %', v_item.sale_item_id USING ERRCODE = '23514';
    END IF;
  END LOOP;

  v_expected_subtotal := round(v_expected_subtotal, 2);
  v_expected_discount := round(v_expected_discount, 2);
  v_expected_tax := round(v_expected_tax, 2);
  v_expected_total := greatest(0.00, round(v_expected_subtotal - v_expected_discount + v_expected_tax, 2));

  IF v_expected_total <= 0 THEN
    RAISE EXCEPTION 'Refund total must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF abs(v_refund.subtotal - v_expected_subtotal) > 0.01
     OR abs(v_refund.discount_amount - v_expected_discount) > 0.01
     OR abs(v_refund.tax_amount - v_expected_tax) > 0.01
     OR abs(v_refund.total_amount - v_expected_total) > 0.01
  THEN
    RAISE EXCEPTION 'Refund header amounts do not match server calculation for refund %', p_refund_id USING ERRCODE = '23514';
  END IF;

  IF v_expected_total > (v_sale.total_amount - v_prev_refunded_amount) + 0.01 THEN
    RAISE EXCEPTION 'Refund exceeds remaining refundable amount for sale %', v_sale.id USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_payment_total
  FROM public.sale_refund_payments
  WHERE refund_id = p_refund_id;

  IF v_payment_total > 0 AND abs(v_payment_total - v_expected_total) > 0.01 THEN
    RAISE EXCEPTION 'Refund payment total does not match refund total' USING ERRCODE = '23514';
  END IF;

  IF v_payment_total > 0 AND EXISTS (
    SELECT 1
    FROM public.sale_refund_payments srp
    LEFT JOIN public.payment_methods pm ON pm.id = srp.payment_method_id
    WHERE srp.refund_id = p_refund_id
      AND (pm.id IS NULL OR pm.is_active IS NOT TRUE OR pm.financial_account_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Refund contains inactive or financially unconfigured payment methods' USING ERRCODE = '23514';
  END IF;

  RETURN public._legacy_process_sale_refund(p_refund_id, v_actor);
END;
$$;

REVOKE ALL ON FUNCTION public.process_sale_refund(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_sale_refund(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.process_pos_refund(
  p_sale_id UUID,
  p_idempotency_key UUID,
  p_items JSONB,
  p_reason TEXT,
  p_processed_by UUID,
  p_payment_method_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID;
  v_sale RECORD;
  v_existing_refund RECORD;
  v_entry JSONB;
  v_item RECORD;
  v_refund_id UUID;
  v_refund_number VARCHAR(50);
  v_refund_type public.refund_type_enum;
  v_subtotal NUMERIC(18,2) := 0.00;
  v_discount NUMERIC(18,2) := 0.00;
  v_tax NUMERIC(18,2) := 0.00;
  v_total NUMERIC(18,2) := 0.00;
  v_sold_qty NUMERIC(18,4) := 0.00;
  v_selected_qty NUMERIC(18,4) := 0.00;
  v_payment_method_ok BOOLEAN;
  v_refund_result JSONB;
  v_line_subtotal NUMERIC(18,2);
  v_line_discount NUMERIC(18,2);
  v_line_tax NUMERIC(18,2);
  v_line_refund NUMERIC(18,2);
  v_item_count INTEGER := 0;
  v_distinct_item_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Refund idempotency key is required' USING ERRCODE = '22023';
  END IF;

  IF p_sale_id IS NULL THEN
    RAISE EXCEPTION 'Sale ID is required' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Refund items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Refund reason is required' USING ERRCODE = '22023';
  END IF;

  v_actor := public._security_current_actor_profile(p_processed_by);

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found', p_sale_id USING ERRCODE = 'P0002';
  END IF;

  IF v_sale.status NOT IN ('COMPLETED', 'PARTIALLY_REFUNDED') THEN
    RAISE EXCEPTION 'Cannot refund sale in status %', v_sale.status USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.current_user_has_permission('pos.sale.refund', v_sale.outlet_id) THEN
    RAISE EXCEPTION 'User lacks permission pos.sale.refund for outlet %', v_sale.outlet_id USING ERRCODE = '42501';
  END IF;

  SELECT id, sale_id, refund_number, total_amount
  INTO v_existing_refund
  FROM public.sale_refunds
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_refund.sale_id <> p_sale_id THEN
      RAISE EXCEPTION 'Refund idempotency key is already bound to another sale' USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'refund_id', v_existing_refund.id,
      'refund_number', v_existing_refund.refund_number,
      'total_amount', v_existing_refund.total_amount,
      'status', 'COMPLETED',
      'is_duplicate', true
    );
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT (x.value->>'sale_item_id'))
  INTO v_item_count, v_distinct_item_count
  FROM jsonb_array_elements(p_items) x;

  IF v_item_count <> v_distinct_item_count THEN
    RAISE EXCEPTION 'Refund request contains duplicate sale items' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(quantity), 0.00)
  INTO v_sold_qty
  FROM public.sale_items
  WHERE sale_id = p_sale_id;

  IF v_sold_qty <= 0 THEN
    RAISE EXCEPTION 'Sale % contains no refundable items', p_sale_id USING ERRCODE = '22023';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF NULLIF(v_entry->>'sale_item_id', '') IS NULL
       OR NULLIF(v_entry->>'quantity', '') IS NULL
    THEN
      RAISE EXCEPTION 'Every refund item requires sale_item_id and quantity' USING ERRCODE = '22023';
    END IF;

    SELECT si.*,
           COALESCE((
             SELECT SUM(sri.quantity)
             FROM public.sale_refund_items sri
             JOIN public.sale_refunds sr ON sr.id = sri.refund_id
             WHERE sri.sale_item_id = si.id
               AND sr.status = 'COMPLETED'
           ), 0.00) AS refunded_qty
    INTO v_item
    FROM public.sale_items si
    WHERE si.id = (v_entry->>'sale_item_id')::UUID
      AND si.sale_id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sale item % does not belong to sale %', v_entry->>'sale_item_id', p_sale_id USING ERRCODE = '23514';
    END IF;

    IF (v_entry->>'quantity')::NUMERIC <= 0 THEN
      RAISE EXCEPTION 'Refund quantity must be greater than zero for item %', v_item.id USING ERRCODE = '22023';
    END IF;

    IF (v_entry->>'quantity')::NUMERIC > (v_item.quantity - v_item.refunded_qty) + 0.0001 THEN
      RAISE EXCEPTION 'Refund quantity exceeds remaining quantity for item %', v_item.id USING ERRCODE = '23514';
    END IF;

    v_selected_qty := v_selected_qty + (v_entry->>'quantity')::NUMERIC;

    v_line_subtotal := round(v_item.unit_price * (v_entry->>'quantity')::NUMERIC, 2);
    v_line_discount := round(
      ((v_item.item_discount_amount + v_item.allocated_discount_amount) / NULLIF(v_item.quantity, 0))
      * (v_entry->>'quantity')::NUMERIC,
      2
    );
    v_line_tax := round(
      (v_item.tax_amount / NULLIF(v_item.quantity, 0)) * (v_entry->>'quantity')::NUMERIC,
      2
    );
    v_line_refund := greatest(0.00, round(v_line_subtotal - v_line_discount + v_line_tax, 2));

    v_subtotal := v_subtotal + v_line_subtotal;
    v_discount := v_discount + v_line_discount;
    v_tax := v_tax + v_line_tax;
  END LOOP;

  v_refund_type := CASE WHEN v_selected_qty >= v_sold_qty THEN 'FULL'::public.refund_type_enum ELSE 'PARTIAL'::public.refund_type_enum END;
  v_subtotal := round(v_subtotal, 2);
  v_discount := round(v_discount, 2);
  v_tax := round(v_tax, 2);
  v_total := greatest(0.00, round(v_subtotal - v_discount + v_tax, 2));

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Refund total must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.payment_methods pm
      WHERE pm.id = p_payment_method_id
        AND pm.is_active = TRUE
        AND pm.financial_account_id IS NOT NULL
    ) INTO v_payment_method_ok;

    IF NOT v_payment_method_ok THEN
      RAISE EXCEPTION 'Selected refund payment method is inactive or has no financial account' USING ERRCODE = '23514';
    END IF;
  END IF;

  v_refund_id := gen_random_uuid();

  LOOP
    v_refund_number :=
      'REF-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD-HH24MISS') || '-' ||
      LPAD((FLOOR(RANDOM() * 1000000))::INT::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.sale_refunds WHERE refund_number = v_refund_number
    );
  END LOOP;

  INSERT INTO public.sale_refunds (
    id, refund_number, sale_id, outlet_id, refund_type,
    subtotal, discount_amount, tax_amount, total_amount,
    reason, status, refunded_at, created_by, created_at, idempotency_key
  ) VALUES (
    v_refund_id, v_refund_number, p_sale_id, v_sale.outlet_id, v_refund_type,
    v_subtotal, v_discount, v_tax, v_total,
    btrim(p_reason), 'COMPLETED', CURRENT_TIMESTAMP, v_actor, CURRENT_TIMESTAMP, p_idempotency_key
  );

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT si.* INTO v_item
    FROM public.sale_items si
    WHERE si.id = (v_entry->>'sale_item_id')::UUID
      AND si.sale_id = p_sale_id;

    v_line_subtotal := round(v_item.unit_price * (v_entry->>'quantity')::NUMERIC, 2);
    v_line_discount := round(
      ((v_item.item_discount_amount + v_item.allocated_discount_amount) / NULLIF(v_item.quantity, 0))
      * (v_entry->>'quantity')::NUMERIC,
      2
    );
    v_line_tax := round(
      (v_item.tax_amount / NULLIF(v_item.quantity, 0)) * (v_entry->>'quantity')::NUMERIC,
      2
    );
    v_line_refund := greatest(0.00, round(v_line_subtotal - v_line_discount + v_line_tax, 2));

    INSERT INTO public.sale_refund_items (
      refund_id, sale_item_id, quantity, refund_amount, tax_amount,
      cost_price, return_to_inventory, reason
    ) VALUES (
      v_refund_id,
      v_item.id,
      (v_entry->>'quantity')::NUMERIC,
      v_line_refund,
      v_line_tax,
      v_item.cost_price,
      COALESCE((v_entry->>'return_to_inventory')::BOOLEAN, v_item.item_type = 'PRODUCT'),
      btrim(p_reason)
    );
  END LOOP;

  IF p_payment_method_id IS NOT NULL THEN
    INSERT INTO public.sale_refund_payments (refund_id, payment_method_id, amount)
    VALUES (v_refund_id, p_payment_method_id, v_total);
  END IF;

  v_refund_result := public.process_sale_refund(v_refund_id, v_actor);
  RETURN (v_refund_result || jsonb_build_object('is_duplicate', false));
END;
$$;

REVOKE ALL ON FUNCTION public.process_pos_refund(UUID, UUID, JSONB, TEXT, UUID, UUID)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_pos_refund(UUID, UUID, JSONB, TEXT, UUID, UUID)
TO authenticated, service_role;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.sales', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.sales', 'DELETE') THEN
    RAISE EXCEPTION 'Phase 3F assertion failed: authenticated can mutate sales';
  END IF;

  IF has_table_privilege('authenticated', 'public.sale_refunds', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.sale_refunds', 'DELETE') THEN
    RAISE EXCEPTION 'Phase 3F assertion failed: authenticated can update/delete sale_refunds';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.process_pos_refund(UUID,UUID,JSONB,TEXT,UUID,UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase 3F assertion failed: authenticated cannot execute process_pos_refund';
  END IF;

  IF has_function_privilege('anon', 'public.process_pos_refund(UUID,UUID,JSONB,TEXT,UUID,UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase 3F assertion failed: anon can execute process_pos_refund';
  END IF;
END;
$$;

COMMIT;
