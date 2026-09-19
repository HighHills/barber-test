BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON public.business_settings
FROM anon, authenticated, public;

COMMIT;
