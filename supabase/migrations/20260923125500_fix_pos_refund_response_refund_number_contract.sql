BEGIN;

-- Fix Mobile POS refund response contract.
-- process_sale_refund() returns refund_id/journal_id/status/sale_status but not refund_number.
-- process_pos_refund() already has the authoritative generated refund number in v_refund_number.
-- Return it explicitly so mobile fail-closed validation can accept successful refunds.

CREATE OR REPLACE FUNCTION public.process_pos_refund(
  p_sale_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_reason text,
  p_processed_by uuid,
  p_payment_method_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
  v_prior_qty NUMERIC(18,4) := 0.00;
  v_remaining_qty NUMERIC(18,4) := 0.00;
  v_item_count INTEGER := 0;
  v_distinct_item_count INTEGER := 0;
  v_payment_method_ok BOOLEAN;
  v_refund_result JSONB;
  v_line_subtotal NUMERIC(18,2);
  v_line_discount NUMERIC(18,2);
  v_line_tax NUMERIC(18,2);
  v_line_refund NUMERIC(18,2);
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

    v_prior_qty := v_item.refunded_qty;
    v_remaining_qty := v_item.quantity - v_prior_qty;

    IF (v_entry->>'quantity')::NUMERIC > v_remaining_qty + 0.0001 THEN
      RAISE EXCEPTION
        'Refund quantity exceeds remaining quantity for item % (remaining %.4s)',
        v_item.id,
        greatest(0.00, v_remaining_qty)
        USING ERRCODE = '23514';
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
    v_line_refund := greatest(
      0.00,
      round(v_line_subtotal - v_line_discount + v_line_tax, 2)
    );

    v_subtotal := v_subtotal + v_line_subtotal;
    v_discount := v_discount + v_line_discount;
    v_tax := v_tax + v_line_tax;
  END LOOP;

  IF v_selected_qty >= v_sold_qty THEN
    v_refund_type := 'FULL';
  ELSE
    v_refund_type := 'PARTIAL';
  END IF;

  v_subtotal := round(v_subtotal, 2);
  v_discount := round(v_discount, 2);
  v_tax := round(v_tax, 2);
  v_total := greatest(0.00, round(v_subtotal - v_discount + v_tax, 2));

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Refund total must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.payment_methods pm
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
    btrim(p_reason), 'COMPLETED', CURRENT_TIMESTAMP, v_actor,
    CURRENT_TIMESTAMP, p_idempotency_key
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
      v_refund_id, v_item.id, (v_entry->>'quantity')::NUMERIC,
      v_line_refund, v_line_tax, v_item.cost_price,
      COALESCE((v_entry->>'return_to_inventory')::BOOLEAN, v_item.item_type = 'PRODUCT'),
      btrim(p_reason)
    );
  END LOOP;

  IF p_payment_method_id IS NOT NULL THEN
    INSERT INTO public.sale_refund_payments (refund_id, payment_method_id, amount)
    VALUES (v_refund_id, p_payment_method_id, v_total);
  END IF;

  v_refund_result := public.process_sale_refund(v_refund_id, v_actor);

  RETURN (
    v_refund_result
    || jsonb_build_object(
      'refund_number', v_refund_number,
      'is_duplicate', false
    )
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT id, sale_id, refund_number, total_amount
    INTO v_existing_refund
    FROM public.sale_refunds
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND AND v_existing_refund.sale_id = p_sale_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'refund_id', v_existing_refund.id,
        'refund_number', v_existing_refund.refund_number,
        'total_amount', v_existing_refund.total_amount,
        'status', 'COMPLETED',
        'is_duplicate', true
      );
    END IF;
    RAISE;
END;
$function$;

COMMIT;