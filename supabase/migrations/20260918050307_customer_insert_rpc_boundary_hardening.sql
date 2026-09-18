BEGIN;

DROP POLICY IF EXISTS "customers_insert" ON public.customers;

REVOKE INSERT
ON TABLE public.customers
FROM authenticated;

COMMIT;
