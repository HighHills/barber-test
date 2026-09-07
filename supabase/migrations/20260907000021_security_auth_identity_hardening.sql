-- 20260907000021_security_auth_identity_hardening.sql
-- Security hardening for privileged SECURITY DEFINER RPCs.
--
-- Root causes:
--   * Privileged RPCs were executable by anon.
--   * Several RPCs treated auth.uid() IS NULL as a valid development path.
--   * Several RPCs trusted actor UUIDs supplied by the caller.
--   * Cashier/supplier management RPCs also explicitly allowed unauthenticated use.
--
-- This migration keeps the existing public signatures used by the application,
-- but places a secure SECURITY DEFINER wrapper in front of the legacy body.
-- The wrapper resolves actor identity from auth.uid() and rejects anonymous
-- callers. The old implementation is retained under an internal name so that
-- business logic does not need to be duplicated in this security migration.

-- ============================================================================
-- 1. COMMON ACTOR RESOLUTION
-- ============================================================================
CREATE OR REPLACE FUNCTION _security_current_actor_profile(p_supplied_actor UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_jwt_role TEXT;
BEGIN
  -- Regular authenticated request: actor identity MUST come from auth.uid().
  IF auth.uid() IS NOT NULL THEN
    SELECT id
      INTO v_actor
      FROM profiles
     WHERE auth_user_id = auth.uid()
       AND is_active = TRUE
     LIMIT 1;

    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Profil pengguna aktif tidak ditemukan' USING ERRCODE = '42501';
    END IF;

    IF p_supplied_actor IS NOT NULL AND p_supplied_actor <> v_actor THEN
      RAISE EXCEPTION 'Identitas actor tidak sesuai dengan sesi pengguna' USING ERRCODE = '42501';
    END IF;

    RETURN v_actor;
  END IF;

  -- Explicit trusted server/service-role execution may supply the application
  -- profile to be recorded as actor. This is the only supported non-user path.
  v_jwt_role := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
  IF v_jwt_role = 'service_role' THEN
    IF p_supplied_actor IS NULL THEN
      RAISE EXCEPTION 'service_role wajib menentukan actor profile' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM profiles
       WHERE id = p_supplied_actor
         AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Actor profile tidak valid atau tidak aktif' USING ERRCODE = '42501';
    END IF;

    RETURN p_supplied_actor;
  END IF;

  RAISE EXCEPTION 'Autentikasi diperlukan' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION _security_current_actor_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _security_current_actor_profile(UUID) TO authenticated, service_role;


-- ============================================================================
-- 2. SUPPLIER MANAGEMENT: REMOVE EXPLICIT ANONYMOUS BYPASS
-- ============================================================================
ALTER FUNCTION upsert_supplier(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  RENAME TO _legacy_upsert_supplier;

REVOKE ALL ON FUNCTION _legacy_upsert_supplier(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION upsert_supplier(
  p_id UUID DEFAULT NULL,
  p_code TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
BEGIN
  IF auth.uid() IS NULL AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'Autentikasi diperlukan' USING ERRCODE = '42501';
  END IF;

  IF v_jwt_role <> 'service_role'
     AND NOT (is_owner_or_admin() OR current_user_has_permission('inventory.purchase')) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Owner, Admin, atau Staf Inventori yang dapat mengelola supplier' USING ERRCODE = '42501';
  END IF;

  RETURN _legacy_upsert_supplier(p_id, p_code, p_name, p_phone, p_email, p_address, p_is_active);
END;
$$;

REVOKE EXECUTE ON FUNCTION upsert_supplier(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION upsert_supplier(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;


ALTER FUNCTION delete_supplier(UUID)
  RENAME TO _legacy_delete_supplier;

REVOKE ALL ON FUNCTION _legacy_delete_supplier(UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION delete_supplier(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
BEGIN
  IF auth.uid() IS NULL AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'Autentikasi diperlukan' USING ERRCODE = '42501';
  END IF;

  IF v_jwt_role <> 'service_role'
     AND NOT (is_owner_or_admin() OR current_user_has_permission('inventory.purchase')) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Owner, Admin, atau Staf Inventori yang dapat menghapus supplier' USING ERRCODE = '42501';
  END IF;

  RETURN _legacy_delete_supplier(p_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_supplier(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_supplier(UUID) TO authenticated, service_role;


-- ============================================================================
-- 3. PURCHASE / RECEIPT / FINANCE RPCs
-- ============================================================================
ALTER FUNCTION create_purchase_order(UUID, UUID, JSONB, NUMERIC, NUMERIC, TEXT, BOOLEAN, UUID)
  RENAME TO _legacy_create_purchase_order;

REVOKE ALL ON FUNCTION _legacy_create_purchase_order(UUID, UUID, JSONB, NUMERIC, NUMERIC, TEXT, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION create_purchase_order(
  p_outlet_id UUID,
  p_supplier_id UUID,
  p_items JSONB,
  p_discount_amount NUMERIC DEFAULT 0.00,
  p_tax_amount NUMERIC DEFAULT 0.00,
  p_notes TEXT DEFAULT NULL,
  p_auto_receive BOOLEAN DEFAULT FALSE,
  p_created_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := _security_current_actor_profile(p_created_by);
  RETURN _legacy_create_purchase_order(
    p_outlet_id,
    p_supplier_id,
    p_items,
    p_discount_amount,
    p_tax_amount,
    p_notes,
    p_auto_receive,
    v_actor
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION create_purchase_order(UUID, UUID, JSONB, NUMERIC, NUMERIC, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_purchase_order(UUID, UUID, JSONB, NUMERIC, NUMERIC, TEXT, BOOLEAN, UUID) TO authenticated, service_role;


ALTER FUNCTION receive_purchase_order(UUID, UUID)
  RENAME TO _legacy_receive_purchase_order;

REVOKE ALL ON FUNCTION _legacy_receive_purchase_order(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION receive_purchase_order(
  p_purchase_id UUID,
  p_received_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := _security_current_actor_profile(p_received_by);
  RETURN _legacy_receive_purchase_order(p_purchase_id, v_actor);
END;
$$;

REVOKE EXECUTE ON FUNCTION receive_purchase_order(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION receive_purchase_order(UUID, UUID) TO authenticated, service_role;


ALTER FUNCTION record_expense(UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID)
  RENAME TO _legacy_record_expense;

REVOKE ALL ON FUNCTION _legacy_record_expense(UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION record_expense(
  p_outlet_id UUID,
  p_category_id UUID,
  p_payment_account_id UUID,
  p_amount NUMERIC,
  p_expense_date DATE DEFAULT CURRENT_DATE,
  p_recipient TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_reference_number TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := _security_current_actor_profile(p_created_by);
  RETURN _legacy_record_expense(
    p_outlet_id,
    p_category_id,
    p_payment_account_id,
    p_amount,
    p_expense_date,
    p_recipient,
    p_notes,
    p_reference_number,
    v_actor
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION record_expense(UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_expense(UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;


ALTER FUNCTION record_supplier_payment(UUID, NUMERIC, UUID, UUID, TEXT, TEXT, UUID)
  RENAME TO _legacy_record_supplier_payment;

REVOKE ALL ON FUNCTION _legacy_record_supplier_payment(UUID, NUMERIC, UUID, UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION record_supplier_payment(
  p_purchase_id UUID,
  p_amount NUMERIC,
  p_payment_method_id UUID,
  p_financial_account_id UUID,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_paid_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := _security_current_actor_profile(p_paid_by);
  RETURN _legacy_record_supplier_payment(
    p_purchase_id,
    p_amount,
    p_payment_method_id,
    p_financial_account_id,
    p_reference_number,
    p_notes,
    v_actor
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION record_supplier_payment(UUID, NUMERIC, UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_supplier_payment(UUID, NUMERIC, UUID, UUID, TEXT, TEXT, UUID) TO authenticated, service_role;


ALTER FUNCTION void_expense(UUID, TEXT, UUID)
  RENAME TO _legacy_void_expense;

REVOKE ALL ON FUNCTION _legacy_void_expense(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION void_expense(
  p_expense_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_voided_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := _security_current_actor_profile(p_voided_by);
  RETURN _legacy_void_expense(p_expense_id, p_reason, v_actor);
END;
$$;

REVOKE EXECUTE ON FUNCTION void_expense(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION void_expense(UUID, TEXT, UUID) TO authenticated, service_role;


-- ============================================================================
-- 4. CASHIER SUBACCOUNT MANAGEMENT
-- ============================================================================
ALTER FUNCTION create_cashier_subaccount(TEXT, TEXT, TEXT, TEXT, UUID)
  RENAME TO _legacy_create_cashier_subaccount;

REVOKE ALL ON FUNCTION _legacy_create_cashier_subaccount(TEXT, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION create_cashier_subaccount(
  p_email TEXT,
  p_password TEXT,
  p_display_name TEXT,
  p_phone TEXT,
  p_outlet_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
BEGIN
  IF auth.uid() IS NULL AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'Autentikasi diperlukan' USING ERRCODE = '42501';
  END IF;

  IF v_jwt_role <> 'service_role' AND NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang berhak membuat sub-akun kasir' USING ERRCODE = '42501';
  END IF;

  RETURN _legacy_create_cashier_subaccount(
    p_email,
    p_password,
    p_display_name,
    p_phone,
    p_outlet_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION create_cashier_subaccount(TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_cashier_subaccount(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

-- These two functions already were granted only to authenticated by the source
-- migration, but their guards were fail-open for auth.uid() IS NULL. Explicitly
-- remove PUBLIC/anon access and use the authenticated grant as the boundary.
REVOKE EXECUTE ON FUNCTION list_cashier_subaccounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION list_cashier_subaccounts() TO authenticated;

REVOKE EXECUTE ON FUNCTION toggle_cashier_status(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION toggle_cashier_status(UUID, BOOLEAN) TO authenticated;


-- ============================================================================
-- 5. LOYALTY POINTS
-- ============================================================================
ALTER FUNCTION award_loyalty_points(UUID, UUID, UUID, NUMERIC, UUID)
  RENAME TO _legacy_award_loyalty_points;

REVOKE ALL ON FUNCTION _legacy_award_loyalty_points(UUID, UUID, UUID, NUMERIC, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION award_loyalty_points(
  p_customer_id UUID,
  p_outlet_id UUID,
  p_sale_id UUID,
  p_net_spending NUMERIC,
  p_created_by UUID DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
BEGIN
  v_actor := _security_current_actor_profile(p_created_by);

  IF v_jwt_role <> 'service_role'
     AND NOT (
       is_owner_or_admin()
       OR current_user_has_permission('pos.sale.create', p_outlet_id)
     ) THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki izin untuk memberikan loyalty points' USING ERRCODE = '42501';
  END IF;

  RETURN _legacy_award_loyalty_points(
    p_customer_id,
    p_outlet_id,
    p_sale_id,
    p_net_spending,
    v_actor
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION award_loyalty_points(UUID, UUID, UUID, NUMERIC, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION award_loyalty_points(UUID, UUID, UUID, NUMERIC, UUID) TO authenticated, service_role;


-- ============================================================================
-- 6. POST-MIGRATION ASSERTIONS
-- ============================================================================
DO $$
DECLARE
  v_names TEXT[] := ARRAY[
    'upsert_supplier(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN)',
    'delete_supplier(UUID)',
    'create_purchase_order(UUID,UUID,JSONB,NUMERIC,NUMERIC,TEXT,BOOLEAN,UUID)',
    'receive_purchase_order(UUID,UUID)',
    'record_expense(UUID,UUID,UUID,NUMERIC,DATE,TEXT,TEXT,TEXT,UUID)',
    'record_supplier_payment(UUID,NUMERIC,UUID,UUID,TEXT,TEXT,UUID)',
    'void_expense(UUID,TEXT,UUID)',
    'create_cashier_subaccount(TEXT,TEXT,TEXT,TEXT,UUID)',
    'award_loyalty_points(UUID,UUID,UUID,NUMERIC,UUID)'
  ];
  v_sig TEXT;
BEGIN
  FOREACH v_sig IN ARRAY v_names LOOP
    IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'Security assertion failed: anon can execute %', v_sig;
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'list_cashier_subaccounts()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute list_cashier_subaccounts()';
  END IF;

  IF has_function_privilege('anon', 'toggle_cashier_status(UUID,BOOLEAN)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute toggle_cashier_status(UUID,BOOLEAN)';
  END IF;
END;
$$;
