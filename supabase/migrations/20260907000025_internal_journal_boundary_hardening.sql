-- 20260907000025_internal_journal_boundary_hardening.sql
-- Harden the journal-posting boundary discovered in the privileged RPC audit.
--
-- Findings addressed:
--   * _internal_post_journal_entry() was SECURITY DEFINER but directly executable
--     by authenticated callers, bypassing the finance.post authorization boundary.
--   * post_journal_entry() trusted p_posted_by for OWNER/ADMIN callers, allowing
--     audit actor impersonation even though ordinary users were restricted.
--
-- The internal posting primitive remains callable by SECURITY DEFINER routines
-- owned by the database function owner, but is no longer an API surface.

-- ============================================================================
-- 1. CLOSE DIRECT ACCESS TO INTERNAL POSTING PRIMITIVE
-- ============================================================================
REVOKE ALL ON FUNCTION _internal_post_journal_entry(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

-- Explicit assertion: this internal primitive must not be callable by API roles.
DO $$
DECLARE
  v_anon BOOLEAN;
  v_auth BOOLEAN;
  v_service BOOLEAN;
BEGIN
  SELECT has_function_privilege('anon', '_internal_post_journal_entry(UUID,UUID)', 'EXECUTE')
    INTO v_anon;
  SELECT has_function_privilege('authenticated', '_internal_post_journal_entry(UUID,UUID)', 'EXECUTE')
    INTO v_auth;
  SELECT has_function_privilege('service_role', '_internal_post_journal_entry(UUID,UUID)', 'EXECUTE')
    INTO v_service;

  IF v_anon OR v_auth OR v_service THEN
    RAISE EXCEPTION 'Security assertion failed: internal journal posting primitive is still directly executable';
  END IF;
END;
$$;


-- ============================================================================
-- 2. CANONICALIZE ACTOR FOR PUBLIC JOURNAL POSTING RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION post_journal_entry(
  p_journal_entry_id UUID,
  p_posted_by UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
BEGIN
  -- Resolve the actor from the authenticated session. OWNER/ADMIN may not
  -- impersonate another profile in audit fields. Trusted service-role jobs may
  -- explicitly supply an active profile through the common security helper.
  v_actor := _security_current_actor_profile(p_posted_by);

  IF v_jwt_role <> 'service_role'
     AND NOT current_user_has_permission('finance.post') THEN
    RAISE EXCEPTION 'User lacks permission finance.post to manually post journal entries'
      USING ERRCODE = '42501';
  END IF;

  RETURN _internal_post_journal_entry(p_journal_entry_id, v_actor);
END;
$$;

REVOKE EXECUTE ON FUNCTION post_journal_entry(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION post_journal_entry(UUID, UUID) TO authenticated, service_role;


-- ============================================================================
-- 3. POST-MIGRATION ASSERTIONS
-- ============================================================================
DO $$
DECLARE
  v_anon BOOLEAN;
  v_auth BOOLEAN;
  v_service BOOLEAN;
BEGIN
  SELECT has_function_privilege('anon', 'post_journal_entry(UUID,UUID)', 'EXECUTE')
    INTO v_anon;
  IF v_anon THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute post_journal_entry';
  END IF;

  SELECT has_function_privilege('authenticated', 'post_journal_entry(UUID,UUID)', 'EXECUTE')
    INTO v_auth;
  IF NOT v_auth THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated cannot execute post_journal_entry';
  END IF;

  SELECT has_function_privilege('service_role', 'post_journal_entry(UUID,UUID)', 'EXECUTE')
    INTO v_service;
  IF NOT v_service THEN
    RAISE EXCEPTION 'Security assertion failed: service_role cannot execute post_journal_entry';
  END IF;
END;
$$;
