-- Phase 4F: retire legacy processing RPCs from client execution.
-- Authoritative client-facing boundaries remain:
--   public.create_and_process_stock_adjustment(...)
--   public.create_and_process_stock_transfer(...)
--   public.process_pos_refund(...)
--
-- The legacy processing functions remain available to service_role/internal
-- server-side execution, but are no longer callable through the Data API by
-- anon/authenticated clients.

BEGIN;

REVOKE EXECUTE
  ON FUNCTION public.process_stock_adjustment(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
  ON FUNCTION public.process_stock_transfer(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
  ON FUNCTION public.process_sale_refund(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.process_stock_adjustment(uuid, uuid)
  TO service_role;

GRANT EXECUTE
  ON FUNCTION public.process_stock_transfer(uuid, uuid)
  TO service_role;

GRANT EXECUTE
  ON FUNCTION public.process_sale_refund(uuid, uuid)
  TO service_role;

COMMIT;
