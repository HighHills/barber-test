-- Phase 2B: bind purchasing / expense / supplier-payment RPC authorization to the target outlet.
-- Client-facing wrappers are the only executable entrypoints; legacy implementations remain internal.

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_outlet_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_discount_amount numeric DEFAULT 0.00,
  p_tax_amount numeric DEFAULT 0.00,
  p_notes text DEFAULT NULL,
  p_auto_receive boolean DEFAULT false,
  p_created_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := _security_current_actor_profile(p_created_by);
  IF NOT is_owner_or_admin()
     AND NOT current_user_has_permission('inventory.purchase', p_outlet_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki izin pembelian pada outlet yang dipilih' USING ERRCODE='42501';
  END IF;
  RETURN _legacy_create_purchase_order(
    p_outlet_id, p_supplier_id, p_items, p_discount_amount, p_tax_amount,
    p_notes, p_auto_receive, v_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_purchase_id uuid,
  p_received_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_outlet_id uuid;
BEGIN
  v_actor := _security_current_actor_profile(p_received_by);
  SELECT outlet_id INTO v_outlet_id FROM purchases WHERE id = p_purchase_id;
  IF v_outlet_id IS NULL THEN
    RAISE EXCEPTION 'Faktur pembelian tidak ditemukan';
  END IF;
  IF NOT is_owner_or_admin()
     AND NOT current_user_has_permission('inventory.purchase', v_outlet_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki izin penerimaan pembelian pada outlet faktur' USING ERRCODE='42501';
  END IF;
  RETURN _legacy_receive_purchase_order(p_purchase_id, v_actor);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_expense(
  p_outlet_id uuid,
  p_category_id uuid,
  p_payment_account_id uuid,
  p_amount numeric,
  p_expense_date date DEFAULT CURRENT_DATE,
  p_recipient text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_reference_number text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := _security_current_actor_profile(p_created_by);
  IF NOT is_owner_or_admin()
     AND NOT current_user_has_permission('finance.post', p_outlet_id)
     AND NOT EXISTS (
       SELECT 1
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = v_actor
         AND ur.outlet_id = p_outlet_id
         AND r.code IN ('MANAGER','ACCOUNTING','CASHIER')
         AND r.is_active = true
     ) THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki izin mencatat biaya pada outlet yang dipilih' USING ERRCODE='42501';
  END IF;
  RETURN _legacy_record_expense(
    p_outlet_id, p_category_id, p_payment_account_id, p_amount,
    p_expense_date, p_recipient, p_notes, p_reference_number, v_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_supplier_payment(
  p_purchase_id uuid,
  p_amount numeric,
  p_payment_method_id uuid,
  p_financial_account_id uuid,
  p_reference_number text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_paid_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_outlet_id uuid;
BEGIN
  v_actor := _security_current_actor_profile(p_paid_by);
  SELECT outlet_id INTO v_outlet_id FROM purchases WHERE id = p_purchase_id;
  IF v_outlet_id IS NULL THEN
    RAISE EXCEPTION 'Faktur pembelian tidak ditemukan';
  END IF;
  IF NOT is_owner_or_admin()
     AND NOT current_user_has_permission('finance.post', v_outlet_id)
     AND NOT current_user_has_permission('inventory.purchase', v_outlet_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki izin membayar hutang supplier pada outlet faktur' USING ERRCODE='42501';
  END IF;
  RETURN _legacy_record_supplier_payment(
    p_purchase_id, p_amount, p_payment_method_id, p_financial_account_id,
    p_reference_number, p_notes, v_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_order(uuid,uuid,jsonb,numeric,numeric,text,boolean,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(uuid,uuid,jsonb,numeric,numeric,text,boolean,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.record_expense(uuid,uuid,uuid,numeric,date,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_expense(uuid,uuid,uuid,numeric,date,text,text,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.record_supplier_payment(uuid,numeric,uuid,uuid,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(uuid,numeric,uuid,uuid,text,text,uuid) TO authenticated;
