BEGIN;

CREATE OR REPLACE FUNCTION public.create_and_process_stock_adjustment_batch(
  p_outlet_id uuid,
  p_items jsonb,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_adjustment_id uuid;
  v_adjustment_number varchar(50);
  v_result jsonb;
  v_item record;
  v_existing_stock record;
  v_product_active boolean;
  v_outlet_active boolean;
  v_quantity_before numeric;
  v_unit_cost numeric(18,2);
  v_item_reason text;
  v_item_count integer;
  v_seen_products uuid[] := ARRAY[]::uuid[];
BEGIN
  v_actor := _security_current_actor_profile(NULL);

  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'Outlet wajib ditentukan' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Minimal harus memilih 1 produk untuk penyesuaian stok' USING ERRCODE = '22023';
  END IF;

  v_item_count := jsonb_array_length(p_items);
  IF v_item_count > 100 THEN
    RAISE EXCEPTION 'Maksimal 100 produk dapat diproses dalam satu penyesuaian stok' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Alasan penyesuaian stok wajib diisi' USING ERRCODE = '22023';
  END IF;

  IF LENGTH(BTRIM(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Alasan penyesuaian stok maksimal 500 karakter' USING ERRCODE = '22023';
  END IF;

  SELECT is_active INTO v_outlet_active FROM public.outlets WHERE id = p_outlet_id;
  IF COALESCE(v_outlet_active, false) = false THEN
    RAISE EXCEPTION 'Outlet % tidak ditemukan atau tidak aktif', p_outlet_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT current_user_has_permission('inventory.adjust', p_outlet_id) THEN
    RAISE EXCEPTION 'User tidak memiliki permission inventory.adjust untuk outlet %', p_outlet_id USING ERRCODE = '42501';
  END IF;

  v_adjustment_number :=
    'ADJ-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' ||
    UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FOR 8));

  INSERT INTO public.stock_adjustments (adjustment_number, outlet_id, reason, status, created_by)
  VALUES (v_adjustment_number, p_outlet_id, BTRIM(p_reason), 'DRAFT', v_actor)
  RETURNING id INTO v_adjustment_id;

  FOR v_item IN
    SELECT x.product_id, x.quantity_after, x.reason
    FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity_after numeric, reason text)
  LOOP
    IF v_item.product_id IS NULL THEN
      RAISE EXCEPTION 'ID produk wajib ditentukan pada setiap baris' USING ERRCODE = '22023';
    END IF;

    IF v_item.quantity_after IS NULL OR v_item.quantity_after < 0
       OR v_item.quantity_after::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Kuantitas fisik harus berupa angka non-negatif yang valid' USING ERRCODE = '22023';
    END IF;

    IF v_item.product_id = ANY(v_seen_products) THEN
      RAISE EXCEPTION 'Terdapat produk duplikat dalam satu penyesuaian stok' USING ERRCODE = '22023';
    END IF;
    v_seen_products := array_append(v_seen_products, v_item.product_id);

    SELECT is_active INTO v_product_active FROM public.products WHERE id = v_item.product_id;
    IF COALESCE(v_product_active, false) = false THEN
      RAISE EXCEPTION 'Produk % tidak ditemukan atau tidak aktif', v_item.product_id USING ERRCODE = 'P0002';
    END IF;

    SELECT quantity, average_cost INTO v_existing_stock
    FROM public.outlet_inventory
    WHERE outlet_id = p_outlet_id AND product_id = v_item.product_id
    FOR UPDATE;

    IF FOUND THEN
      v_quantity_before := COALESCE(v_existing_stock.quantity, 0);
      v_unit_cost := COALESCE(v_existing_stock.average_cost, 0);
    ELSE
      v_quantity_before := 0;
      SELECT COALESCE(default_cost_price, 0) INTO v_unit_cost
      FROM public.products WHERE id = v_item.product_id;
    END IF;

    IF v_item.quantity_after = v_quantity_before THEN
      RAISE EXCEPTION 'Kuantitas produk % sama dengan stok sistem; tidak ada perubahan yang perlu disesuaikan', v_item.product_id USING ERRCODE = '22023';
    END IF;

    v_item_reason := NULLIF(BTRIM(COALESCE(v_item.reason, '')), '');

    INSERT INTO public.stock_adjustment_items (
      adjustment_id, product_id, quantity_before, quantity_after, quantity_delta, unit_cost, reason
    ) VALUES (
      v_adjustment_id,
      v_item.product_id,
      v_quantity_before,
      v_item.quantity_after,
      v_item.quantity_after - v_quantity_before,
      v_unit_cost,
      COALESCE(v_item_reason, BTRIM(p_reason))
    );
  END LOOP;

  v_result := public.process_stock_adjustment(v_adjustment_id, v_actor);

  RETURN v_result || jsonb_build_object(
    'adjustment_number', v_adjustment_number,
    'item_count', v_item_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_and_process_stock_transfer_batch(
  p_from_outlet_id uuid,
  p_to_outlet_id uuid,
  p_items jsonb
) RETURNS jsonb
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
  v_item record;
  v_item_count integer;
  v_seen_products uuid[] := ARRAY[]::uuid[];
BEGIN
  v_actor := _security_current_actor_profile(NULL);

  IF p_from_outlet_id IS NULL OR p_to_outlet_id IS NULL THEN
    RAISE EXCEPTION 'Outlet asal dan outlet tujuan wajib ditentukan' USING ERRCODE = '22023';
  END IF;

  IF p_from_outlet_id = p_to_outlet_id THEN
    RAISE EXCEPTION 'Outlet asal dan tujuan harus berbeda' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Minimal harus memilih 1 produk untuk transfer stok' USING ERRCODE = '22023';
  END IF;

  v_item_count := jsonb_array_length(p_items);
  IF v_item_count > 100 THEN
    RAISE EXCEPTION 'Maksimal 100 produk dapat diproses dalam satu transfer stok' USING ERRCODE = '22023';
  END IF;

  SELECT is_active INTO v_from_outlet_active FROM public.outlets WHERE id = p_from_outlet_id;
  IF COALESCE(v_from_outlet_active, false) = false THEN
    RAISE EXCEPTION 'Outlet asal % tidak ditemukan atau tidak aktif', p_from_outlet_id USING ERRCODE = 'P0002';
  END IF;

  SELECT is_active INTO v_to_outlet_active FROM public.outlets WHERE id = p_to_outlet_id;
  IF COALESCE(v_to_outlet_active, false) = false THEN
    RAISE EXCEPTION 'Outlet tujuan % tidak ditemukan atau tidak aktif', p_to_outlet_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT current_user_has_permission('inventory.transfer', p_from_outlet_id) THEN
    RAISE EXCEPTION 'User tidak memiliki permission inventory.transfer untuk outlet asal %', p_from_outlet_id USING ERRCODE = '42501';
  END IF;

  IF NOT is_owner_or_admin() AND NOT current_user_has_outlet_access(p_to_outlet_id) THEN
    RAISE EXCEPTION 'User tidak memiliki akses ke outlet tujuan %', p_to_outlet_id USING ERRCODE = '42501';
  END IF;

  v_transfer_number :=
    'TRF-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' ||
    UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FOR 8));

  INSERT INTO public.stock_transfers (
    transfer_number, from_outlet_id, to_outlet_id, status, requested_by
  ) VALUES (
    v_transfer_number, p_from_outlet_id, p_to_outlet_id, 'REQUESTED', v_actor
  ) RETURNING id INTO v_transfer_id;

  FOR v_item IN
    SELECT x.product_id, x.quantity
    FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity numeric)
  LOOP
    IF v_item.product_id IS NULL THEN
      RAISE EXCEPTION 'ID produk wajib ditentukan pada setiap baris' USING ERRCODE = '22023';
    END IF;

    IF v_item.quantity IS NULL OR v_item.quantity <= 0
       OR v_item.quantity::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Kuantitas transfer harus berupa angka lebih besar dari 0 yang valid' USING ERRCODE = '22023';
    END IF;

    IF v_item.product_id = ANY(v_seen_products) THEN
      RAISE EXCEPTION 'Terdapat produk duplikat dalam satu transfer stok' USING ERRCODE = '22023';
    END IF;
    v_seen_products := array_append(v_seen_products, v_item.product_id);

    SELECT is_active INTO v_product_active FROM public.products WHERE id = v_item.product_id;
    IF COALESCE(v_product_active, false) = false THEN
      RAISE EXCEPTION 'Produk % tidak ditemukan atau tidak aktif', v_item.product_id USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.stock_transfer_items (transfer_id, product_id, quantity, unit_cost)
    VALUES (v_transfer_id, v_item.product_id, v_item.quantity, 0.00);
  END LOOP;

  v_result := public.process_stock_transfer(v_transfer_id, v_actor);

  RETURN v_result || jsonb_build_object(
    'transfer_number', v_transfer_number,
    'item_count', v_item_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_and_process_stock_adjustment_batch(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_and_process_stock_transfer_batch(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_and_process_stock_adjustment_batch(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_and_process_stock_transfer_batch(uuid, uuid, jsonb) TO authenticated;

COMMIT;
