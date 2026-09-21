-- ============================================================================
-- FIX: LOYALTY POINT AWARD LOCK QUERY
-- ============================================================================
-- PostgreSQL does not allow FOR UPDATE to target the nullable side of an
-- outer join. The legacy loyalty award function previously locked customers
-- through LEFT JOIN customer_tiers, which fails for customers whose tier row
-- is optional.
--
-- Preserve row-level serialization by locking the customer row directly,
-- then read the optional tier multiplier separately.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._legacy_award_loyalty_points(
  p_customer_id uuid,
  p_outlet_id uuid,
  p_sale_id uuid,
  p_net_spending numeric,
  p_created_by uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_multiplier NUMERIC(4,2) := 1.0;
  v_points_earned INT := 0;
  v_current_balance INT := 0;
  v_new_balance INT := 0;
BEGIN
  IF p_net_spending IS NULL OR p_net_spending < 0 THEN
    RAISE EXCEPTION
      'Nilai belanja untuk loyalty point tidak valid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM customer_loyalty_ledger
    WHERE sale_id = p_sale_id
      AND transaction_type = 'EARN'
  ) THEN
    RETURN 0;
  END IF;

  -- Lock only the customer base row. Do not use FOR UPDATE across a LEFT JOIN.
  SELECT
    c.current_loyalty_points
  INTO v_current_balance
  FROM public.customers c
  WHERE c.id = p_customer_id
    AND c.is_active = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Customer % tidak ditemukan atau tidak aktif',
      p_customer_id
      USING ERRCODE = '22023';
  END IF;

  -- Tier is optional, so resolve its multiplier separately.
  SELECT COALESCE(ct.points_multiplier, 1.0)
  INTO v_multiplier
  FROM public.customer_tiers ct
  WHERE ct.id = (
    SELECT c.tier_id
    FROM public.customers c
    WHERE c.id = p_customer_id
  );

  v_multiplier := COALESCE(v_multiplier, 1.0);

  v_points_earned := FLOOR(
    (p_net_spending / 10000.0) * v_multiplier
  );

  IF v_points_earned > 0 THEN
    v_new_balance := v_current_balance + v_points_earned;

    UPDATE public.customers
    SET
      current_loyalty_points = v_new_balance,
      lifetime_loyalty_points = lifetime_loyalty_points + v_points_earned,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = p_customer_id;

    INSERT INTO public.customer_loyalty_ledger (
      customer_id,
      outlet_id,
      transaction_type,
      points_change,
      points_balance_after,
      sale_id,
      notes,
      created_by
    )
    VALUES (
      p_customer_id,
      p_outlet_id,
      'EARN',
      v_points_earned,
      v_new_balance,
      p_sale_id,
      'Poin transaksi belanja POS',
      p_created_by
    );
  END IF;

  PERFORM recalculate_customer_tier(p_customer_id);

  RETURN v_points_earned;
END;
$function$;
