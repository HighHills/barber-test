-- Phase 8: inventory atomic mutation boundary
-- Routes stock adjustment and stock transfer document creation + processing
-- through authoritative transactional RPCs.
-- Direct table-write lockdown will be applied only after client migration.

CREATE OR REPLACE FUNCTION public.create_and_process_stock_adjustment(
  p_outlet_id uuid,
  p_product_id uuid,
  p_quantity_after numeric,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_adjustment_id uuid;
  v_adjustment_number varchar(50);
  v_unit_cost numeric(18,2) := 0.00;
  v_existing_stock record;
  v_product_active boolean;
  v_outlet_active boolean;
  v_result jsonb;
BEGIN
  v_actor := _security_current_actor_profile(NULL);

  IF p_outlet_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Outlet dan produk wajib ditentukan' USING ERRCODE = '22023';
  END IF;

  IF p_quantity_after IS NULL OR p_quantity_after < 0
     OR p_quantity_after::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Kuantitas fisik harus berupa angka non-negatif yang valid' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Alasan penyesuaian stok wajib diisi' USING ERRCODE = '22023';
  END IF;

  IF LENGTH(BTRIM(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Alasan penyesuaian stok maksimal 500 karakter' USING ERRCODE = '22023';
  END IF;

  SELECT is_active INTO v_outlet_active
  FROM outlets
  WHERE id = p_outlet_id;

  IF COALESCE(v_outlet_active, false) = false THEN
    RAISE EXCEPTION 'Outlet % tidak ditemukan atau tidak aktif', p_outlet_id USING ERRCODE = 'P0002';
  END IF;

  SELECT is_active INTO v_product_active
  FROM products
  WHERE id = p_product_id;

  IF COALESCE(v_product_active, false) = false THEN
    RAISE EXCEPTION 'Produk % tidak ditemukan atau tidak aktif', p_product_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT current_user_has_permission('inventory.adjust', p_outlet_id) THEN
    RAISE EXCEPTION 'User tidak memiliki permission inventory.adjust untuk outlet %', p_outlet_id USING ERRCODE = '42501';
  END IF;

  SELECT quantity, average_cost
    INTO v_existing_stock
    FROM outlet_inventory
   WHERE outlet_id = p_outlet_id
     AND product_id = p_product_id
   FOR UPDATE;

  IF FOUND THEN
    v_unit_cost := v_existing_stock.average_cost;
  ELSE
    SELECT COALESCE(default_cost_price, 0.00)
      INTO v_unit_cost
      FROM products
     WHERE id = p_product_id;
  END IF;

  v_adjustment_number :=
    'ADJ-' ||
    TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') ||
    '-' ||
    UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FOR 8));

  INSERT INTO stock_adjustments (
    adjustment_number,
    outlet_id,
    reason,
    status,
    created_by
  )
  VALUES (
    v_adjustment_number,
    p_outlet_id,
    BTRIM(p_reason),
    'DRAFT',
    v_actor
  )
  RETURNING id INTO v_adjustment_id;

  INSERT INTO stock_adjustment_items (
    adjustment_id,
    product_id,
    quantity_before,
    quantity_after,
    quantity_delta,
    unit_cost,
    reason
  )
  VALUES (
    v_adjustment_id,
    p_product_id,
    COALESCE(v_existing_stock.quantity, 0),
    p_quantity_after,
    p_quantity_after - COALESCE(v_existing_stock.quantity, 0),
    v_unit_cost,
    BTRIM(p_reason)
  );

  v_result := public.process_stock_adjustment(v_adjustment_id, v_actor);

  RETURN v_result || jsonb_build_object(
    'adjustment_number', v_adjustment_number
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_and_process_stock_transfer(
  p_from_outlet_id uuid,
  p_to_outlet_id uuid,
  p_product_id uuid,
  p_quantity numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_transfer_id uuid;
  v_transfer_number varchar(50);
  v_from_outlet_active boolean;
  v_to_outlet_active boolean;
  v_product_active boolean;
  v_result jsonb;
BEGIN
  v_actor := _security_current_actor_profile(NULL);

  IF p_from_outlet_id IS NULL OR p_to_outlet_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Outlet asal, outlet tujuan, dan produk wajib ditentukan' USING ERRCODE = '22023';
  END IF;

  IF p_from_outlet_id = p_to_outlet_id THEN
    RAISE EXCEPTION 'Outlet asal dan tujuan harus berbeda' USING ERRCODE = '42501';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0
     OR p_quantity::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Kuantitas transfer harus berupa angka lebih besar dari 0 yang valid' USING ERRCODE = '22023';
  END IF;

  SELECT is_active INTO v_from_outlet_active
  FROM outlets
  WHERE id = p_from_outlet_id;

  IF COALESCE(v_from_outlet_active, false) = false THEN
    RAISE EXCEPTION 'Outlet asal % tidak ditemukan atau tidak aktif', p_from_outlet_id USING ERRCODE = 'P0002';
  END IF;

  SELECT is_active INTO v_to_outlet_active
  FROM outlets
  WHERE id = p_to_outlet_id;

  IF COALESCE(v_to_outlet_active, false) = false THEN
    RAISE EXCEPTION 'Outlet tujuan % tidak ditemukan atau tidak aktif', p_to_outlet_id USING ERRCODE = 'P0002';
  END IF;

  SELECT is_active INTO v_product_active
  FROM products
  WHERE id = p_product_id;

  IF COALESCE(v_product_active, false) = false THEN
    RAISE EXCEPTION 'Produk % tidak ditemukan atau tidak aktif', p_product_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT current_user_has_permission('inventory.transfer', p_from_outlet_id) THEN
    RAISE EXCEPTION 'User tidak memiliki permission inventory.transfer untuk outlet asal %', p_from_outlet_id USING ERRCODE = '42501';
  END IF;

  IF NOT is_owner_or_admin()
     AND NOT current_user_has_outlet_access(p_to_outlet_id) THEN
    RAISE EXCEPTION 'User tidak memiliki akses ke outlet tujuan %', p_to_outlet_id USING ERRCODE = '42501';
  END IF;

  v_transfer_number :=
    'TRF-' ||
    TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') ||
    '-' ||
    UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FOR 8));

  INSERT INTO stock_transfers (
    transfer_number,
    from_outlet_id,
    to_outlet_id,
    status,
    requested_by
  )
  VALUES (
    v_transfer_number,
    p_from_outlet_id,
    p_to_outlet_id,
    'REQUESTED',
    v_actor
  )
  RETURNING id INTO v_transfer_id;

  INSERT INTO stock_transfer_items (
    transfer_id,
    product_id,
    quantity,
    unit_cost
  )
  VALUES (
    v_transfer_id,
    p_product_id,
    p_quantity,
    0.00
  );

  v_result := public.process_stock_transfer(v_transfer_id, v_actor);

  RETURN v_result || jsonb_build_object(
    'transfer_number', v_transfer_number
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_and_process_stock_adjustment(uuid, uuid, numeric, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_and_process_stock_transfer(uuid, uuid, uuid, numeric) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_and_process_stock_adjustment(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_and_process_stock_transfer(uuid, uuid, uuid, numeric) TO authenticated;
