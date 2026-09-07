-- ============================================================================
-- BARBERSHOP OS - MIGRATION 32: CRM / LOYALTY WRITE-BOUNDARY HARDENING
-- ============================================================================
-- Goals:
--   1. Remove direct anonymous/application-role mutation access from
--      loyalty ledger and haircut history.
--   2. Scope authenticated SELECT access by outlet.
--   3. Move loyalty redemption, manual adjustment, and haircut-history writes
--      behind SECURITY DEFINER RPCs with server-side authorization/validation.
--   4. Make award_loyalty_points() derive spending from the authoritative sale
--      row instead of trusting caller-supplied p_net_spending.
--   5. Make award/redemption operations idempotent per sale and serialize
--      customer-balance updates with row locks.
--   6. Remove direct authenticated access to recalculate_customer_tier(); tier
--      recalculation remains an internal side effect of trusted operations.
--
-- NOTE:
-- The existing 5-argument award_loyalty_points signature is intentionally kept
-- for rollout compatibility with the current frontend. p_net_spending is still
-- accepted but is validated against sales.total_amount and is never trusted as
-- the source of truth.

-- ============================================================================
-- 1. REMOVE DIRECT TABLE MUTATION FROM CLIENT ROLES
-- ============================================================================
REVOKE ALL ON TABLE
  public.customer_loyalty_ledger,
  public.customer_haircut_history
FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
ON TABLE public.customer_loyalty_ledger
FROM authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
ON TABLE public.customer_haircut_history
FROM authenticated;

-- Keep read access for authenticated clients; RLS below scopes it by outlet.
GRANT SELECT ON TABLE public.customer_loyalty_ledger TO authenticated;
GRANT SELECT ON TABLE public.customer_haircut_history TO authenticated;

GRANT ALL ON TABLE public.customer_loyalty_ledger TO service_role;
GRANT ALL ON TABLE public.customer_haircut_history TO service_role;

-- ============================================================================
-- 2. OUTLET-SCOPED READ POLICIES
-- ============================================================================
DROP POLICY IF EXISTS loyalty_ledger_select ON public.customer_loyalty_ledger;
DROP POLICY IF EXISTS loyalty_ledger_insert ON public.customer_loyalty_ledger;
DROP POLICY IF EXISTS loyalty_ledger_update ON public.customer_loyalty_ledger;
DROP POLICY IF EXISTS loyalty_ledger_delete ON public.customer_loyalty_ledger;

CREATE POLICY loyalty_ledger_select
ON public.customer_loyalty_ledger
FOR SELECT
TO authenticated
USING (
  current_user_has_outlet_access(outlet_id)
);

DROP POLICY IF EXISTS haircut_history_select ON public.customer_haircut_history;
DROP POLICY IF EXISTS haircut_history_insert ON public.customer_haircut_history;
DROP POLICY IF EXISTS haircut_history_update ON public.customer_haircut_history;
DROP POLICY IF EXISTS haircut_history_delete ON public.customer_haircut_history;

CREATE POLICY haircut_history_select
ON public.customer_haircut_history
FOR SELECT
TO authenticated
USING (
  current_user_has_outlet_access(outlet_id)
);

-- No authenticated INSERT/UPDATE/DELETE policies are intentionally created.
-- Direct table mutation is blocked by both missing RLS policies and revoked
-- table privileges; trusted RPCs below perform all supported writes.

-- ============================================================================
-- 3. HARDEN AWARD_LOYALTY_POINTS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.award_loyalty_points(
  p_customer_id UUID,
  p_outlet_id UUID,
  p_sale_id UUID,
  p_net_spending NUMERIC,
  p_created_by UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
  v_sale RECORD;
  v_customer RECORD;
  v_multiplier NUMERIC(4,2) := 1.0;
  v_points_earned INTEGER := 0;
  v_new_balance INTEGER := 0;
  v_existing_points INTEGER;
BEGIN
  IF auth.uid() IS NULL AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_actor := _security_current_actor_profile(p_created_by);

  IF v_jwt_role <> 'service_role'
     AND NOT (
       is_owner_or_admin()
       OR current_user_has_permission('pos.sale.create', p_outlet_id)
     ) THEN
    RAISE EXCEPTION
      'Akses ditolak: Anda tidak memiliki izin untuk memberikan loyalty points'
      USING ERRCODE = '42501';
  END IF;

  IF p_customer_id IS NULL OR p_outlet_id IS NULL OR p_sale_id IS NULL THEN
    RAISE EXCEPTION 'Customer, outlet, dan sale wajib diisi' USING ERRCODE = '22023';
  END IF;

  -- The sale row is the sole source of truth for spending.
  SELECT
    s.id,
    s.customer_id,
    s.outlet_id,
    s.status,
    s.total_amount
  INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % tidak ditemukan', p_sale_id USING ERRCODE = '22023';
  END IF;

  IF v_sale.status <> 'COMPLETED' THEN
    RAISE EXCEPTION
      'Sale % belum berstatus COMPLETED dan tidak dapat menghasilkan loyalty points', p_sale_id
      USING ERRCODE = '22023';
  END IF;

  IF v_sale.customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'Sale % bukan milik customer %', p_sale_id, p_customer_id USING ERRCODE = '42501';
  END IF;

  IF v_sale.outlet_id IS DISTINCT FROM p_outlet_id THEN
    RAISE EXCEPTION 'Sale % bukan milik outlet %', p_sale_id, p_outlet_id USING ERRCODE = '42501';
  END IF;

  IF p_net_spending IS NULL
     OR ABS(p_net_spending - v_sale.total_amount) > 0.01 THEN
    RAISE EXCEPTION
      'Nilai spending yang dikirim client tidak cocok dengan total sale. Gunakan nilai server-side.'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotency: one EARN event per sale.
  SELECT points_change
  INTO v_existing_points
  FROM public.customer_loyalty_ledger
  WHERE sale_id = p_sale_id
    AND transaction_type = 'EARN'
  ORDER BY created_at
  LIMIT 1;

  IF FOUND THEN
    RETURN COALESCE(v_existing_points, 0);
  END IF;

  -- Serialize balance changes for the customer.
  SELECT
    c.current_loyalty_points,
    c.tier_id,
    c.is_active
  INTO v_customer
  FROM public.customers c
  WHERE c.id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_customer.is_active THEN
    RAISE EXCEPTION 'Customer % tidak ditemukan atau tidak aktif', p_customer_id USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(ct.points_multiplier, 1.0)
  INTO v_multiplier
  FROM public.customer_tiers ct
  WHERE ct.id = v_customer.tier_id;

  v_multiplier := COALESCE(v_multiplier, 1.0);
  v_points_earned := FLOOR((v_sale.total_amount / 10000.0) * v_multiplier);

  IF v_points_earned > 0 THEN
    v_new_balance := v_customer.current_loyalty_points + v_points_earned;

    UPDATE public.customers
    SET current_loyalty_points = v_new_balance,
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
    ) VALUES (
      p_customer_id,
      p_outlet_id,
      'EARN',
      v_points_earned,
      v_new_balance,
      p_sale_id,
      'Poin transaksi belanja POS',
      v_actor
    );
  END IF;

  PERFORM public.recalculate_customer_tier(p_customer_id);

  RETURN v_points_earned;
END;
$$;

-- The legacy implementation remains callable only by SECURITY DEFINER code.
ALTER FUNCTION public._legacy_award_loyalty_points(
  UUID, UUID, UUID, NUMERIC, UUID
) SET search_path = public, pg_temp;

-- Prevent the helper from being used directly by application roles.
REVOKE ALL ON FUNCTION public._legacy_award_loyalty_points(
  UUID, UUID, UUID, NUMERIC, UUID
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.award_loyalty_points(
  UUID, UUID, UUID, NUMERIC, UUID
) TO authenticated, service_role;

-- ============================================================================
-- 4. TRUSTED LOYALTY REDEMPTION RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
  p_customer_id UUID,
  p_outlet_id UUID,
  p_sale_id UUID,
  p_points INTEGER,
  p_created_by UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
  v_sale RECORD;
  v_customer RECORD;
  v_existing_points INTEGER;
  v_new_balance INTEGER;
BEGIN
  IF auth.uid() IS NULL AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_actor := _security_current_actor_profile(p_created_by);

  IF v_jwt_role <> 'service_role'
     AND NOT (
       is_owner_or_admin()
       OR current_user_has_permission('pos.sale.create', p_outlet_id)
     ) THEN
    RAISE EXCEPTION
      'Akses ditolak: Anda tidak memiliki izin untuk menukarkan loyalty points'
      USING ERRCODE = '42501';
  END IF;

  IF p_points IS NULL OR p_points <= 0 THEN
    RAISE EXCEPTION 'Jumlah poin yang ditukarkan harus lebih dari 0' USING ERRCODE = '22023';
  END IF;

  SELECT
    s.id,
    s.customer_id,
    s.outlet_id,
    s.status
  INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % tidak ditemukan', p_sale_id USING ERRCODE = '22023';
  END IF;

  IF v_sale.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Sale % belum COMPLETED', p_sale_id USING ERRCODE = '22023';
  END IF;

  IF v_sale.customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'Sale % bukan milik customer %', p_sale_id, p_customer_id USING ERRCODE = '42501';
  END IF;

  IF v_sale.outlet_id IS DISTINCT FROM p_outlet_id THEN
    RAISE EXCEPTION 'Sale % bukan milik outlet %', p_sale_id, p_outlet_id USING ERRCODE = '42501';
  END IF;

  -- Idempotency: one REDEEM event per sale.
  SELECT ABS(points_change)
  INTO v_existing_points
  FROM public.customer_loyalty_ledger
  WHERE sale_id = p_sale_id
    AND transaction_type = 'REDEEM'
  ORDER BY created_at
  LIMIT 1;

  IF FOUND THEN
    RETURN COALESCE(v_existing_points, 0);
  END IF;

  SELECT current_loyalty_points, is_active
  INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_customer.is_active THEN
    RAISE EXCEPTION 'Customer % tidak ditemukan atau tidak aktif', p_customer_id USING ERRCODE = '22023';
  END IF;

  IF p_points > v_customer.current_loyalty_points THEN
    RAISE EXCEPTION
      'Saldo poin tidak mencukupi. Saldo saat ini: %, diminta: %',
      v_customer.current_loyalty_points, p_points
      USING ERRCODE = '22023', DETAIL = 'Loyalty redemption exceeded current balance';
  END IF;

  v_new_balance := v_customer.current_loyalty_points - p_points;

  UPDATE public.customers
  SET current_loyalty_points = v_new_balance,
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
  ) VALUES (
    p_customer_id,
    p_outlet_id,
    'REDEEM',
    -p_points,
    v_new_balance,
    p_sale_id,
    'Penukaran poin untuk potongan nota POS',
    v_actor
  );

  RETURN p_points;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_loyalty_points(
  UUID, UUID, UUID, INTEGER, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(
  UUID, UUID, UUID, INTEGER, UUID
) TO authenticated, service_role;

-- ============================================================================
-- 5. TRUSTED MANUAL LOYALTY ADJUSTMENT RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.adjust_customer_loyalty_points(
  p_customer_id UUID,
  p_outlet_id UUID,
  p_points INTEGER,
  p_reason TEXT,
  p_created_by UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
  v_customer RECORD;
  v_new_balance INTEGER;
BEGIN
  IF auth.uid() IS NULL AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_actor := _security_current_actor_profile(p_created_by);

  IF v_jwt_role <> 'service_role'
     AND NOT (
       is_owner_or_admin()
       OR current_user_has_permission('pos.sale.create', p_outlet_id)
     ) THEN
    RAISE EXCEPTION
      'Akses ditolak: Anda tidak memiliki izin untuk mengoreksi loyalty points'
      USING ERRCODE = '42501';
  END IF;

  IF p_points IS NULL OR p_points = 0 THEN
    RAISE EXCEPTION 'Perubahan poin tidak boleh 0' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Alasan koreksi poin wajib diisi' USING ERRCODE = '22023';
  END IF;

  SELECT current_loyalty_points, is_active
  INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_customer.is_active THEN
    RAISE EXCEPTION 'Customer % tidak ditemukan atau tidak aktif', p_customer_id USING ERRCODE = '22023';
  END IF;

  v_new_balance := v_customer.current_loyalty_points + p_points;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION
      'Koreksi poin melebihi saldo customer. Saldo saat ini: %, koreksi: %',
      v_customer.current_loyalty_points, p_points
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.customers
  SET current_loyalty_points = v_new_balance,
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
  ) VALUES (
    p_customer_id,
    p_outlet_id,
    'MANUAL_ADJUSTMENT',
    p_points,
    v_new_balance,
    NULL,
    BTRIM(p_reason),
    v_actor
  );

  PERFORM public.recalculate_customer_tier(p_customer_id);

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_customer_loyalty_points(
  UUID, UUID, INTEGER, TEXT, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_customer_loyalty_points(
  UUID, UUID, INTEGER, TEXT, UUID
) TO authenticated, service_role;

-- ============================================================================
-- 6. TRUSTED HAIRCUT HISTORY WRITE RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.add_customer_haircut_record(
  p_customer_id UUID,
  p_outlet_id UUID,
  p_barber_id UUID,
  p_style_name VARCHAR,
  p_clipper_guard_sides VARCHAR DEFAULT NULL,
  p_clipper_guard_top VARCHAR DEFAULT NULL,
  p_styling_product_used VARCHAR DEFAULT NULL,
  p_special_notes TEXT DEFAULT NULL,
  p_sale_id UUID DEFAULT NULL,
  p_appointment_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
  v_customer_active BOOLEAN;
  v_history_id UUID;
BEGIN
  IF auth.uid() IS NULL AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_actor := _security_current_actor_profile(p_created_by);

  IF v_jwt_role <> 'service_role'
     AND NOT (
       is_owner_or_admin()
       OR current_user_has_permission('pos.sale.create', p_outlet_id)
       OR current_user_has_permission('booking.manage', p_outlet_id)
     ) THEN
    RAISE EXCEPTION
      'Akses ditolak: Anda tidak memiliki izin untuk mencatat riwayat pangkas'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(BTRIM(p_style_name), '') IS NULL THEN
    RAISE EXCEPTION 'Nama style pangkas wajib diisi' USING ERRCODE = '22023';
  END IF;

  SELECT is_active
  INTO v_customer_active
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND OR NOT v_customer_active THEN
    RAISE EXCEPTION 'Customer % tidak ditemukan atau tidak aktif', p_customer_id USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employee_outlets eo
    JOIN public.employees e ON e.id = eo.employee_id
    WHERE eo.employee_id = p_barber_id
      AND eo.outlet_id = p_outlet_id
      AND eo.is_active = TRUE
      AND e.is_active = TRUE
  ) THEN
    RAISE EXCEPTION
      'Barber % tidak aktif atau tidak ditugaskan pada outlet %',
      p_barber_id, p_outlet_id
      USING ERRCODE = '42501';
  END IF;

  IF p_sale_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.sales s
    WHERE s.id = p_sale_id
      AND s.customer_id = p_customer_id
      AND s.outlet_id = p_outlet_id
      AND s.status = 'COMPLETED'
  ) THEN
    RAISE EXCEPTION 'Sale reference tidak valid untuk customer/outlet ini' USING ERRCODE = '42501';
  END IF;

  IF p_appointment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.id = p_appointment_id
      AND a.customer_id = p_customer_id
      AND a.outlet_id = p_outlet_id
  ) THEN
    RAISE EXCEPTION 'Appointment reference tidak valid untuk customer/outlet ini' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.customer_haircut_history (
    customer_id,
    outlet_id,
    barber_id,
    sale_id,
    appointment_id,
    style_name,
    clipper_guard_sides,
    clipper_guard_top,
    styling_product_used,
    special_notes,
    visit_date
  ) VALUES (
    p_customer_id,
    p_outlet_id,
    p_barber_id,
    p_sale_id,
    p_appointment_id,
    BTRIM(p_style_name),
    NULLIF(BTRIM(p_clipper_guard_sides), ''),
    NULLIF(BTRIM(p_clipper_guard_top), ''),
    NULLIF(BTRIM(p_styling_product_used), ''),
    NULLIF(BTRIM(p_special_notes), ''),
    CURRENT_DATE
  )
  RETURNING id INTO v_history_id;

  -- Keep the CRM preference card synchronized with the new history entry.
  UPDATE public.customers
  SET haircut_preferences = jsonb_build_object(
        'fade_style', BTRIM(p_style_name),
        'clipper_guard_sides', NULLIF(BTRIM(p_clipper_guard_sides), ''),
        'clipper_guard_top', NULLIF(BTRIM(p_clipper_guard_top), ''),
        'styling_product', NULLIF(BTRIM(p_styling_product_used), ''),
        'scalp_notes', NULLIF(BTRIM(p_special_notes), '')
      ),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_customer_id;

  RETURN v_history_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_customer_haircut_record(
  UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, UUID, UUID, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_customer_haircut_record(
  UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, UUID, UUID, UUID
) TO authenticated, service_role;

-- ============================================================================
-- 7. HIDE DIRECT TIER-RECALCULATION RPC FROM APPLICATION ROLES
-- ============================================================================
REVOKE ALL ON FUNCTION public.recalculate_customer_tier(UUID)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.recalculate_customer_tier(UUID)
TO service_role;

ALTER FUNCTION public.recalculate_customer_tier(UUID)
SET search_path = public, pg_temp;

-- ============================================================================
-- 8. ASSERTIONS / SCHEMA CACHE REFRESH
-- ============================================================================
DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.award_loyalty_points(UUID,UUID,UUID,NUMERIC,UUID)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute award_loyalty_points';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.award_loyalty_points(UUID,UUID,UUID,NUMERIC,UUID)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated lost award_loyalty_points';
  END IF;

  IF has_table_privilege('anon', 'public.customer_loyalty_ledger', 'INSERT')
     OR has_table_privilege('anon', 'public.customer_loyalty_ledger', 'UPDATE')
     OR has_table_privilege('anon', 'public.customer_loyalty_ledger', 'DELETE') THEN
    RAISE EXCEPTION 'Security assertion failed: anon can mutate customer_loyalty_ledger';
  END IF;

  IF has_table_privilege('authenticated', 'public.customer_loyalty_ledger', 'INSERT')
     OR has_table_privilege('authenticated', 'public.customer_loyalty_ledger', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.customer_loyalty_ledger', 'DELETE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can mutate customer_loyalty_ledger';
  END IF;

  IF has_table_privilege('authenticated', 'public.customer_haircut_history', 'INSERT')
     OR has_table_privilege('authenticated', 'public.customer_haircut_history', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.customer_haircut_history', 'DELETE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can mutate customer_haircut_history';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
