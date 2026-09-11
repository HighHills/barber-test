-- Phase 2B: bind expense void authorization to the expense outlet.
-- Prevents an authorized actor on one scope from voiding another outlet's expense.

CREATE OR REPLACE FUNCTION public.void_expense(
  p_expense_id uuid,
  p_reason text DEFAULT NULL::text,
  p_voided_by uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_outlet_id uuid;
BEGIN
  v_actor := _security_current_actor_profile(p_voided_by);

  SELECT outlet_id
  INTO v_outlet_id
  FROM expenses
  WHERE id = p_expense_id;

  IF v_outlet_id IS NULL THEN
    RAISE EXCEPTION 'Data pengeluaran biaya tidak ditemukan' USING ERRCODE='P0002';
  END IF;

  IF NOT is_owner_or_admin()
     AND NOT current_user_has_permission('finance.post', v_outlet_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki izin membatalkan biaya pada outlet transaksi' USING ERRCODE='42501';
  END IF;

  RETURN _legacy_void_expense(p_expense_id, p_reason, v_actor);
END;
$$;

REVOKE ALL ON FUNCTION public.void_expense(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_expense(uuid,text,uuid) TO authenticated;
