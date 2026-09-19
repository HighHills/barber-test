-- Phase 7: lock customer tier direct writes after Web and Mobile migrate to RPC.
-- Keep read access for authenticated clients; all configuration writes must use
-- public.save_customer_tier so authorization, validation, row locking and audit
-- are centralized in the authoritative RPC.

revoke insert, update, delete, truncate on table public.customer_tiers from anon, authenticated, public;
grant select on table public.customer_tiers to authenticated;
