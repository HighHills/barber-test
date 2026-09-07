-- 20260907000024_transaction_actor_and_transfer_boundary_hardening.sql
-- Harden authenticated transaction RPCs against actor impersonation and
-- cross-outlet transfer/refund inconsistencies.
--
-- Scope:
--   * process_sale_refund: actor comes from auth.uid(); refund outlet must match sale outlet.
--   * process_stock_adjustment: actor comes from auth.uid().
--   * process_stock_transfer: actor comes from auth.uid(); destination outlet must also
--     be accessible to the authenticated caller unless the caller is OWNER/ADMIN.
--   * void_sale: actor comes from auth.uid().
--
-- The legacy business bodies are retained under internal names. The public RPC
-- signatures remain unchanged for application compatibility.

-- ============================================================================
-- 1. PROCESS SALE REFUND
-- ============================================================================
ALTER FUNCTION process_sale_refund(UUID, UUID)
  RENAME TO _legacy_process_sale_refund;

REVOKE ALL ON FUNCTION _legacy_process_sale_refund(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION process_sale_refund(
  p_refund_id UUID,
  p_processed_by UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_refund_outlet UUID;
  v_sale_outlet UUID;
BEGIN
  v_actor := _security_current_actor_profile(p_processed_by);

  SELECT outlet_id
    INTO v_refund_outlet
    FROM sale_refunds
   WHERE id = p_refund_id;

  IF v_refund_outlet IS NULL THEN
    RAISE EXCEPTION 'Refund % not found', p_refund_id USING ERRCODE = 'P0002';
  END IF;

  SELECT s.outlet_id
    INTO v_sale_outlet
    FROM sale_refunds sr
    JOIN sales s ON s.id = sr.sale_id
   WHERE sr.id = p_refund_id;

  IF v_sale_outlet IS NULL THEN
    RAISE EXCEPTION 'Sale linked to refund % not found', p_refund_id USING ERRCODE = 'P0002';
  END IF;

  IF v_refund_outlet <> v_sale_outlet THEN
    RAISE EXCEPTION 'Refund % outlet does not match the original sale outlet', p_refund_id USING ERRCODE = '42501';
  END IF;

  RETURN _legacy_process_sale_refund(p_refund_id, v_actor);
END;
$$;

REVOKE EXECUTE ON FUNCTION process_sale_refund(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION process_sale_refund(UUID, UUID) TO authenticated, service_role;


-- ============================================================================
-- 2. PROCESS STOCK ADJUSTMENT
-- ============================================================================
ALTER FUNCTION process_stock_adjustment(UUID, UUID)
  RENAME TO _legacy_process_stock_adjustment;

REVOKE ALL ON FUNCTION _legacy_process_stock_adjustment(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION process_stock_adjustment(
  p_adjustment_id UUID,
  p_approved_by UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := _security_current_actor_profile(p_approved_by);
  RETURN _legacy_process_stock_adjustment(p_adjustment_id, v_actor);
END;
$$;

REVOKE EXECUTE ON FUNCTION process_stock_adjustment(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION process_stock_adjustment(UUID, UUID) TO authenticated, service_role;


-- ============================================================================
-- 3. PROCESS STOCK TRANSFER
-- ============================================================================
ALTER FUNCTION process_stock_transfer(UUID, UUID)
  RENAME TO _legacy_process_stock_transfer;

REVOKE ALL ON FUNCTION _legacy_process_stock_transfer(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION process_stock_transfer(
  p_transfer_id UUID,
  p_approved_by UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_from_outlet UUID;
  v_to_outlet UUID;
BEGIN
  v_actor := _security_current_actor_profile(p_approved_by);

  SELECT from_outlet_id, to_outlet_id
    INTO v_from_outlet, v_to_outlet
    FROM stock_transfers
   WHERE id = p_transfer_id;

  IF v_from_outlet IS NULL OR v_to_outlet IS NULL THEN
    RAISE EXCEPTION 'Stock transfer % not found or has an invalid outlet boundary', p_transfer_id USING ERRCODE = 'P0002';
  END IF;

  IF v_from_outlet = v_to_outlet THEN
    RAISE EXCEPTION 'Source and destination outlet must be different' USING ERRCODE = '42501';
  END IF;

  -- OWNER/ADMIN may perform cross-outlet transfers. Other authenticated users
  -- must have access to both sides of the transfer.
  IF NOT is_owner_or_admin()
     AND NOT current_user_has_outlet_access(v_to_outlet) THEN
    RAISE EXCEPTION 'User lacks access to destination outlet %', v_to_outlet USING ERRCODE = '42501';
  END IF;

  RETURN _legacy_process_stock_transfer(p_transfer_id, v_actor);
END;
$$;

REVOKE EXECUTE ON FUNCTION process_stock_transfer(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION process_stock_transfer(UUID, UUID) TO authenticated, service_role;


-- ============================================================================
-- 4. VOID SALE
-- ============================================================================
ALTER FUNCTION void_sale(UUID, UUID, TEXT)
  RENAME TO _legacy_void_sale;

REVOKE ALL ON FUNCTION _legacy_void_sale(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION void_sale(
  p_sale_id UUID,
  p_voided_by UUID,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := _security_current_actor_profile(p_voided_by);
  RETURN _legacy_void_sale(p_sale_id, v_actor, p_reason);
END;
$$;

REVOKE EXECUTE ON FUNCTION void_sale(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION void_sale(UUID, UUID, TEXT) TO authenticated, service_role;


-- ============================================================================
-- 5. POST-MIGRATION ASSERTIONS
-- ============================================================================
DO $$
DECLARE
  v_anon BOOLEAN;
BEGIN
  SELECT has_function_privilege('anon', 'process_sale_refund(UUID,UUID)', 'EXECUTE') INTO v_anon;
  IF v_anon THEN RAISE EXCEPTION 'Security assertion failed: anon can execute process_sale_refund'; END IF;

  SELECT has_function_privilege('anon', 'process_stock_adjustment(UUID,UUID)', 'EXECUTE') INTO v_anon;
  IF v_anon THEN RAISE EXCEPTION 'Security assertion failed: anon can execute process_stock_adjustment'; END IF;

  SELECT has_function_privilege('anon', 'process_stock_transfer(UUID,UUID)', 'EXECUTE') INTO v_anon;
  IF v_anon THEN RAISE EXCEPTION 'Security assertion failed: anon can execute process_stock_transfer'; END IF;

  SELECT has_function_privilege('anon', 'void_sale(UUID,UUID,TEXT)', 'EXECUTE') INTO v_anon;
  IF v_anon THEN RAISE EXCEPTION 'Security assertion failed: anon can execute void_sale'; END IF;
END;
$$;
