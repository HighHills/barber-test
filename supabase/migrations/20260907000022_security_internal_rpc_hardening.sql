-- 20260907000022_security_internal_rpc_hardening.sql
-- Harden the remaining SECURITY DEFINER functions found during live audit.
--
-- 1) _security_current_actor_profile is an internal helper and must never be
--    callable by anon.
-- 2) recalculate_customer_tier mutates customers.tier_id and therefore must
--    not be callable anonymously or by an authenticated user without access to
--    one of the customer's completed-sale outlets.
-- 3) validate_commission_tier_config is a trigger function. Trigger functions
--    are invoked by PostgreSQL and should not be exposed as RPCs at all.

-- ============================================================================
-- 1. INTERNAL ACTOR HELPER
-- ============================================================================
REVOKE ALL ON FUNCTION _security_current_actor_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION _security_current_actor_profile(UUID) TO authenticated, service_role;


-- ============================================================================
-- 2. CUSTOMER TIER RECALCULATION
-- ============================================================================
CREATE OR REPLACE FUNCTION recalculate_customer_tier(p_customer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_spending NUMERIC(18,2) := 0;
  v_total_visits INT := 0;
  v_new_tier_id UUID;
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
BEGIN
  -- Anonymous callers must never be able to mutate customer loyalty state.
  IF auth.uid() IS NULL AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'Autentikasi diperlukan' USING ERRCODE = '42501';
  END IF;

  -- service_role is trusted for backend jobs.
  -- For authenticated callers, require owner/admin or access to an outlet in
  -- which this customer has at least one completed sale.
  IF v_jwt_role <> 'service_role'
     AND NOT is_owner_or_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM sales s
       WHERE s.customer_id = p_customer_id
         AND s.status = 'COMPLETED'
         AND current_user_has_outlet_access(s.outlet_id)
     )
  THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki akses ke customer ini' USING ERRCODE = '42501';
  END IF;

  -- Calculate total spending and visit count from completed sales.
  SELECT
    COALESCE(SUM(total_amount), 0),
    COUNT(id)
  INTO v_total_spending, v_total_visits
  FROM sales
  WHERE customer_id = p_customer_id
    AND status = 'COMPLETED';

  -- Select the highest tier whose spending OR visit threshold is met.
  SELECT id
    INTO v_new_tier_id
    FROM customer_tiers
   WHERE is_active = TRUE
     AND (v_total_spending >= min_spending OR v_total_visits >= min_visits)
   ORDER BY min_spending DESC, min_visits DESC
   LIMIT 1;

  IF v_new_tier_id IS NOT NULL THEN
    UPDATE customers
       SET tier_id = v_new_tier_id,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = p_customer_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION recalculate_customer_tier(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION recalculate_customer_tier(UUID) TO authenticated, service_role;


-- ============================================================================
-- 3. TRIGGER FUNCTION: NEVER EXPOSE VIA RPC
-- ============================================================================
REVOKE ALL ON FUNCTION validate_commission_tier_config() FROM PUBLIC, anon, authenticated, service_role;


-- ============================================================================
-- 4. POST-MIGRATION ASSERTIONS
-- ============================================================================
DO $$
DECLARE
  v_anon_exec BOOLEAN;
BEGIN
  IF has_function_privilege('anon', '_security_current_actor_profile(UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute _security_current_actor_profile';
  END IF;

  IF has_function_privilege('anon', 'recalculate_customer_tier(UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute recalculate_customer_tier';
  END IF;

  IF has_function_privilege('anon', 'validate_commission_tier_config()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute validate_commission_tier_config';
  END IF;
END;
$$;
