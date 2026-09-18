BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.financial_periods
FROM authenticated;

GRANT SELECT
ON TABLE public.financial_periods
TO authenticated;

COMMIT;
