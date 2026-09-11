-- Phase 2A: atomic POS catalog mutation boundaries
-- All mutations remain OWNER/ADMIN-only and execute inside one DB transaction.

CREATE OR REPLACE FUNCTION public.save_pos_service_catalog(
  p_service_id uuid,
  p_outlet_id uuid,
  p_category_id uuid,
  p_category_name text,
  p_code text,
  p_name text,
  p_description text,
  p_duration_minutes integer,
  p_default_cost_price numeric,
  p_selling_price numeric,
  p_is_active boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_category_id uuid := p_category_id;
  v_service_id uuid;
  v_category_name text := nullif(trim(p_category_name), '');
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat mengelola katalog layanan' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM outlets WHERE id=p_outlet_id AND is_active=true) THEN
    RAISE EXCEPTION 'Outlet tidak ditemukan atau tidak aktif';
  END IF;
  IF v_category_id IS NULL THEN
    IF v_category_name IS NULL THEN RAISE EXCEPTION 'Kategori layanan wajib dipilih'; END IF;
    SELECT id INTO v_category_id FROM service_categories WHERE lower(trim(name))=lower(v_category_name) ORDER BY id LIMIT 1;
    IF v_category_id IS NULL THEN
      v_result := public.save_service_category(NULL,v_category_name,NULL,0,true);
      v_category_id := (v_result->>'category_id')::uuid;
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM service_categories WHERE id=v_category_id) THEN RAISE EXCEPTION 'Kategori layanan tidak valid'; END IF;
  END IF;
  v_result := public.save_service(p_service_id,v_category_id,p_code,p_name,p_description,p_duration_minutes,p_default_cost_price,p_is_active);
  v_service_id := (v_result->>'service_id')::uuid;
  PERFORM public.save_service_outlet(v_service_id,p_outlet_id,p_selling_price,p_is_active);
  RETURN jsonb_build_object('success',true,'service_id',v_service_id,'category_id',v_category_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_pos_product_catalog(
  p_product_id uuid,
  p_outlet_id uuid,
  p_category_id uuid,
  p_category_name text,
  p_sku text,
  p_barcode text,
  p_name text,
  p_description text,
  p_base_unit text,
  p_default_cost_price numeric,
  p_selling_price numeric,
  p_is_active boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_category_id uuid := p_category_id;
  v_product_id uuid;
  v_category_name text := nullif(trim(p_category_name), '');
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat mengelola katalog produk' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM outlets WHERE id=p_outlet_id AND is_active=true) THEN
    RAISE EXCEPTION 'Outlet tidak ditemukan atau tidak aktif';
  END IF;
  IF v_category_id IS NULL THEN
    IF v_category_name IS NULL THEN RAISE EXCEPTION 'Kategori produk wajib dipilih'; END IF;
    SELECT id INTO v_category_id FROM product_categories WHERE lower(trim(name))=lower(v_category_name) ORDER BY id LIMIT 1;
    IF v_category_id IS NULL THEN
      v_result := public.save_product_category(NULL,v_category_name,NULL,0,true);
      v_category_id := (v_result->>'category_id')::uuid;
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM product_categories WHERE id=v_category_id) THEN RAISE EXCEPTION 'Kategori produk tidak valid'; END IF;
  END IF;
  v_result := public.save_product(p_product_id,v_category_id,p_sku,p_barcode,p_name,p_description,p_base_unit,p_default_cost_price,p_is_active);
  v_product_id := (v_result->>'product_id')::uuid;
  PERFORM public.save_product_outlet(v_product_id,p_outlet_id,p_selling_price,p_is_active);
  RETURN jsonb_build_object('success',true,'product_id',v_product_id,'category_id',v_category_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_pos_service_catalog(p_service_id uuid,p_outlet_id uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_service record; v_price numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT is_owner_or_admin() THEN RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat menonaktifkan katalog layanan' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM outlets WHERE id=p_outlet_id AND is_active=true) THEN RAISE EXCEPTION 'Outlet tidak ditemukan atau tidak aktif'; END IF;
  SELECT id,category_id,code,name,description,duration_minutes,default_cost_price INTO v_service FROM services WHERE id=p_service_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Layanan tidak ditemukan'; END IF;
  SELECT selling_price INTO v_price FROM service_outlets WHERE service_id=p_service_id AND outlet_id=p_outlet_id;
  PERFORM public.save_service(v_service.id,v_service.category_id,v_service.code,v_service.name,v_service.description,v_service.duration_minutes,COALESCE(v_service.default_cost_price,0),false);
  PERFORM public.save_service_outlet(p_service_id,p_outlet_id,COALESCE(v_price,0),false);
  RETURN jsonb_build_object('success',true,'service_id',p_service_id,'outlet_id',p_outlet_id,'is_active',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_pos_product_catalog(p_product_id uuid,p_outlet_id uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_product record; v_price numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT is_owner_or_admin() THEN RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat menonaktifkan katalog produk' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM outlets WHERE id=p_outlet_id AND is_active=true) THEN RAISE EXCEPTION 'Outlet tidak ditemukan atau tidak aktif'; END IF;
  SELECT id,category_id,sku,barcode,name,description,base_unit,default_cost_price INTO v_product FROM products WHERE id=p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;
  SELECT selling_price INTO v_price FROM product_outlets WHERE product_id=p_product_id AND outlet_id=p_outlet_id;
  PERFORM public.save_product(v_product.id,v_product.category_id,v_product.sku,v_product.barcode,v_product.name,v_product.description,v_product.base_unit,COALESCE(v_product.default_cost_price,0),false);
  PERFORM public.save_product_outlet(p_product_id,p_outlet_id,COALESCE(v_price,0),false);
  RETURN jsonb_build_object('success',true,'product_id',p_product_id,'outlet_id',p_outlet_id,'is_active',false);
END;
$$;

REVOKE ALL ON FUNCTION public.save_pos_service_catalog(uuid,uuid,uuid,text,text,text,text,integer,numeric,numeric,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_pos_service_catalog(uuid,uuid,uuid,text,text,text,text,integer,numeric,numeric,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.save_pos_product_catalog(uuid,uuid,uuid,text,text,text,text,text,text,numeric,numeric,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_pos_product_catalog(uuid,uuid,uuid,text,text,text,text,text,text,numeric,numeric,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.deactivate_pos_service_catalog(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_pos_service_catalog(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.deactivate_pos_product_catalog(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_pos_product_catalog(uuid,uuid) TO authenticated;
