-- ============================================================================
-- BARBERSHOP OS - MIGRATION 38: ANALYTICS VIEW SECURITY HARDENING
-- ============================================================================
--
-- Tujuan:
--   1. Menghilangkan SECURITY DEFINER behavior pada executive analytics view.
--   2. Memblokir akses anon/public ke view.
--   3. Tetap mengizinkan authenticated membaca analytics.
--   4. Tetap mempertahankan service_role access.
--   5. Tidak mengubah definisi/query bisnis dari view.
--
-- Catatan:
--   SECURITY INVOKER membuat akses ke underlying tables mengikuti privilege/RLS
--   dari caller, bukan privilege pemilik view.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Jadikan view SECURITY INVOKER
-- ----------------------------------------------------------------------------

ALTER VIEW public.view_executive_outlet_performance
  SET (security_invoker = true);

-- ----------------------------------------------------------------------------
-- 2. Hapus seluruh privilege dari anon dan authenticated terlebih dahulu
--    agar ACL lama (SELECT + DML) tidak tersisa.
-- ----------------------------------------------------------------------------

REVOKE ALL PRIVILEGES
  ON TABLE public.view_executive_outlet_performance
  FROM anon;

REVOKE ALL PRIVILEGES
  ON TABLE public.view_executive_outlet_performance
  FROM authenticated;

-- ----------------------------------------------------------------------------
-- 3. Authenticated hanya membutuhkan SELECT.
-- ----------------------------------------------------------------------------

GRANT SELECT
  ON TABLE public.view_executive_outlet_performance
  TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. service_role tetap memiliki full access.
-- ----------------------------------------------------------------------------

GRANT ALL PRIVILEGES
  ON TABLE public.view_executive_outlet_performance
  TO service_role;

COMMIT;