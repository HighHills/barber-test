-- Harden Settings business validation for service consumptions and product unit conversions.

CREATE OR REPLACE FUNCTION public.save_service_consumption(
  p_consumption_id uuid,
  p_service_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid := p_consumption_id;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat mengatur pemakaian bahan layanan' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.services WHERE id = p_service_id) THEN
    RAISE EXCEPTION 'Layanan tidak ditemukan';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Produk tidak ditemukan';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Kuantitas pemakaian harus lebih dari 0';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.service_consumptions
    WHERE service_id = p_service_id
      AND product_id = p_product_id
      AND (v_id IS NULL OR id <> v_id)
  ) THEN
    RAISE EXCEPTION 'Produk ini sudah terdaftar sebagai bahan pemakaian untuk layanan tersebut';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.service_consumptions(service_id, product_id, quantity, is_active)
    VALUES(p_service_id, p_product_id, p_quantity, coalesce(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.service_consumptions
    SET service_id = p_service_id,
        product_id = p_product_id,
        quantity = p_quantity,
        is_active = coalesce(p_is_active, true),
        updated_at = now()
    WHERE id = v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Konfigurasi pemakaian layanan tidak ditemukan';
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'consumption_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_product_unit_conversion(
  p_conversion_id uuid,
  p_product_id uuid,
  p_unit_name text,
  p_multiplier_to_base numeric,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid := p_conversion_id;
  v_unit_name text := nullif(trim(p_unit_name), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat mengatur konversi unit produk' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Produk tidak ditemukan';
  END IF;

  IF v_unit_name IS NULL OR p_multiplier_to_base IS NULL OR p_multiplier_to_base <= 0 THEN
    RAISE EXCEPTION 'Unit dan multiplier konversi tidak valid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_unit_conversions
    WHERE product_id = p_product_id
      AND lower(trim(unit_name)) = lower(v_unit_name)
      AND (v_id IS NULL OR id <> v_id)
  ) THEN
    RAISE EXCEPTION 'Unit konversi sudah terdaftar untuk produk ini';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.product_unit_conversions(product_id, unit_name, multiplier_to_base, is_active)
    VALUES(p_product_id, v_unit_name, p_multiplier_to_base, coalesce(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.product_unit_conversions
    SET product_id = p_product_id,
        unit_name = v_unit_name,
        multiplier_to_base = p_multiplier_to_base,
        is_active = coalesce(p_is_active, true),
        updated_at = now()
    WHERE id = v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Konversi unit produk tidak ditemukan';
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'conversion_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_service_consumption(uuid, uuid, uuid, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_product_unit_conversion(uuid, uuid, text, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_service_consumption(uuid, uuid, uuid, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_unit_conversion(uuid, uuid, text, numeric, boolean) TO authenticated;
