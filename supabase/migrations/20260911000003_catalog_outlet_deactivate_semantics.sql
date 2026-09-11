-- Keep master catalog active when deactivating an item from one outlet.
-- Only the outlet-specific availability row is changed.

CREATE OR REPLACE FUNCTION public.deactivate_pos_service_catalog(p_service_id uuid,p_outlet_id uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_exists boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat menonaktifkan katalog layanan' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM outlets WHERE id=p_outlet_id AND is_active=true) THEN
    RAISE EXCEPTION 'Outlet tidak ditemukan atau tidak aktif';
  END IF;
  SELECT EXISTS (SELECT 1 FROM services WHERE id=p_service_id) INTO v_exists;
  IF NOT v_exists THEN RAISE EXCEPTION 'Layanan tidak ditemukan'; END IF;
  UPDATE service_outlets
  SET is_active=false
  WHERE service_id=p_service_id AND outlet_id=p_outlet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Layanan tidak terdaftar pada outlet ini'; END IF;
  RETURN jsonb_build_object('success',true,'service_id',p_service_id,'outlet_id',p_outlet_id,'is_active',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_pos_product_catalog(p_product_id uuid,p_outlet_id uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_exists boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat menonaktifkan katalog produk' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM outlets WHERE id=p_outlet_id AND is_active=true) THEN
    RAISE EXCEPTION 'Outlet tidak ditemukan atau tidak aktif';
  END IF;
  SELECT EXISTS (SELECT 1 FROM products WHERE id=p_product_id) INTO v_exists;
  IF NOT v_exists THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;
  UPDATE product_outlets
  SET is_active=false
  WHERE product_id=p_product_id AND outlet_id=p_outlet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak terdaftar pada outlet ini'; END IF;
  RETURN jsonb_build_object('success',true,'product_id',p_product_id,'outlet_id',p_outlet_id,'is_active',false);
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_pos_service_catalog(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_pos_service_catalog(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.deactivate_pos_product_catalog(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_pos_product_catalog(uuid,uuid) TO authenticated;
