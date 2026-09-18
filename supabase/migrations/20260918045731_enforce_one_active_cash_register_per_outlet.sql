BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_registers_one_active_per_outlet
ON public.cash_registers (outlet_id)
WHERE is_active = TRUE;

COMMIT;
