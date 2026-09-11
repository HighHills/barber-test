-- Settings multi-outlet catalog atomic mutation boundaries.
-- The payload is validated before any master or outlet mutation.
-- Missing outlet configurations are preserved and marked inactive.

CREATE OR REPLACE FUNCTION public.save_service_catalog_with_outlets(
  p_service_id uuid,
  p_category_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_duration_minutes integer,
  p_default_cost_price numeric,
  p_is_active boolean,
  p_outlets jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service_id uuid := p_service_id;
  v_outlet_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat mengelola katalog layanan' USING ERRCODE='42501';
  END IF;

  IF p_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.service_categories WHERE id = p_category_id
  ) THEN
    RAISE EXCEPTION 'Kategori layanan tidak valid';
  END IF;

  IF nullif(trim(p_code),'') IS NULL OR nullif(trim(p_name),'') IS NULL THEN
    RAISE EXCEPTION 'Kode dan nama layanan wajib diisi';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes <= 0 THEN
    RAISE EXCEPTION 'Durasi layanan harus lebih dari 0 menit';
  END IF;

  IF p_default_cost_price IS NOT NULL AND p_default_cost_price < 0 THEN
    RAISE EXCEPTION 'Harga modal layanan tidak boleh negatif';
  END IF;

  IF p_outlets IS NULL OR jsonb_typeof(p_outlets) <> 'array' OR jsonb_array_length(p_outlets) = 0 THEN
    RAISE EXCEPTION 'Minimal satu konfigurasi outlet wajib diisi';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_outlets) AS x(value)
    WHERE jsonb_typeof(x.value) <> 'object'
       OR nullif(x.value->>'outlet_id','') IS NULL
       OR (x.value->>'outlet_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR nullif(x.value->>'selling_price','') IS NULL
       OR (x.value->>'selling_price') !~ '^[0-9]+([.][0-9]+)?$'
       OR (x.value->>'selling_price')::numeric < 0
  ) THEN
    RAISE EXCEPTION 'Konfigurasi outlet layanan tidak valid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT (x.value->>'outlet_id')::uuid AS outlet_id
      FROM jsonb_array_elements(p_outlets) AS x(value)
    ) d
    GROUP BY outlet_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Konfigurasi outlet layanan tidak boleh duplikat';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT (x.value->>'outlet_id')::uuid AS outlet_id
      FROM jsonb_array_elements(p_outlets) AS x(value)
    ) requested
    LEFT JOIN public.outlets o ON o.id = requested.outlet_id AND o.is_active = true
    WHERE o.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Satu atau lebih outlet tidak ditemukan atau tidak aktif';
  END IF;

  IF v_service_id IS NULL THEN
    INSERT INTO public.services(
      category_id, code, name, description, duration_minutes,
      default_cost_price, is_active
    )
    VALUES(
      p_category_id,
      upper(trim(p_code)),
      trim(p_name),
      nullif(trim(p_description),''),
      p_duration_minutes,
      p_default_cost_price,
      coalesce(p_is_active, true)
    )
    RETURNING id INTO v_service_id;
  ELSE
    UPDATE public.services
    SET category_id = p_category_id,
        code = upper(trim(p_code)),
        name = trim(p_name),
        description = nullif(trim(p_description),''),
        duration_minutes = p_duration_minutes,
        default_cost_price = p_default_cost_price,
        is_active = coalesce(p_is_active, true),
        updated_at = now()
    WHERE id = v_service_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Layanan tidak ditemukan';
    END IF;
  END IF;

  INSERT INTO public.service_outlets(service_id, outlet_id, selling_price, is_active)
  SELECT
    v_service_id,
    (x.value->>'outlet_id')::uuid,
    (x.value->>'selling_price')::numeric,
    coalesce((x.value->>'is_active')::boolean, true)
  FROM jsonb_array_elements(p_outlets) AS x(value)
  ON CONFLICT (service_id, outlet_id) DO UPDATE
  SET selling_price = excluded.selling_price,
      is_active = excluded.is_active;

  UPDATE public.service_outlets so
  SET is_active = false
  WHERE so.service_id = v_service_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_outlets) AS x(value)
      WHERE (x.value->>'outlet_id')::uuid = so.outlet_id
    );

  SELECT jsonb_array_length(p_outlets) INTO v_outlet_count;

  RETURN jsonb_build_object(
    'success', true,
    'service_id', v_service_id,
    'outlet_count', v_outlet_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_service_catalog_with_outlets(uuid,uuid,text,text,text,integer,numeric,boolean,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_service_catalog_with_outlets(uuid,uuid,text,text,text,integer,numeric,boolean,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_product_catalog_with_outlets(
  p_product_id uuid,
  p_category_id uuid,
  p_sku text,
  p_barcode text,
  p_name text,
  p_description text,
  p_base_unit text,
  p_default_cost_price numeric,
  p_is_active boolean,
  p_outlets jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product_id uuid := p_product_id;
  v_outlet_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat mengelola katalog produk' USING ERRCODE='42501';
  END IF;

  IF p_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.product_categories WHERE id = p_category_id
  ) THEN
    RAISE EXCEPTION 'Kategori produk tidak valid';
  END IF;

  IF nullif(trim(p_sku),'') IS NULL
     OR nullif(trim(p_name),'') IS NULL
     OR nullif(trim(p_base_unit),'') IS NULL THEN
    RAISE EXCEPTION 'SKU, nama produk, dan unit dasar wajib diisi';
  END IF;

  IF p_default_cost_price IS NOT NULL AND p_default_cost_price < 0 THEN
    RAISE EXCEPTION 'Harga modal produk tidak boleh negatif';
  END IF;

  IF p_outlets IS NULL OR jsonb_typeof(p_outlets) <> 'array' OR jsonb_array_length(p_outlets) = 0 THEN
    RAISE EXCEPTION 'Minimal satu konfigurasi outlet wajib diisi';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_outlets) AS x(value)
    WHERE jsonb_typeof(x.value) <> 'object'
       OR nullif(x.value->>'outlet_id','') IS NULL
       OR (x.value->>'outlet_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR nullif(x.value->>'selling_price','') IS NULL
       OR (x.value->>'selling_price') !~ '^[0-9]+([.][0-9]+)?$'
       OR (x.value->>'selling_price')::numeric < 0
  ) THEN
    RAISE EXCEPTION 'Konfigurasi outlet produk tidak valid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT (x.value->>'outlet_id')::uuid AS outlet_id
      FROM jsonb_array_elements(p_outlets) AS x(value)
    ) d
    GROUP BY outlet_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Konfigurasi outlet produk tidak boleh duplikat';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT (x.value->>'outlet_id')::uuid AS outlet_id
      FROM jsonb_array_elements(p_outlets) AS x(value)
    ) requested
    LEFT JOIN public.outlets o ON o.id = requested.outlet_id AND o.is_active = true
    WHERE o.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Satu atau lebih outlet tidak ditemukan atau tidak aktif';
  END IF;

  IF v_product_id IS NULL THEN
    INSERT INTO public.products(
      category_id, sku, barcode, name, description, base_unit,
      default_cost_price, is_active
    )
    VALUES(
      p_category_id,
      upper(trim(p_sku)),
      nullif(trim(p_barcode),''),
      trim(p_name),
      nullif(trim(p_description),''),
      trim(p_base_unit),
      p_default_cost_price,
      coalesce(p_is_active, true)
    )
    RETURNING id INTO v_product_id;
  ELSE
    UPDATE public.products
    SET category_id = p_category_id,
        sku = upper(trim(p_sku)),
        barcode = nullif(trim(p_barcode),''),
        name = trim(p_name),
        description = nullif(trim(p_description),''),
        base_unit = trim(p_base_unit),
        default_cost_price = p_default_cost_price,
        is_active = coalesce(p_is_active, true),
        updated_at = now()
    WHERE id = v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produk tidak ditemukan';
    END IF;
  END IF;

  INSERT INTO public.product_outlets(product_id, outlet_id, selling_price, is_active)
  SELECT
    v_product_id,
    (x.value->>'outlet_id')::uuid,
    (x.value->>'selling_price')::numeric,
    coalesce((x.value->>'is_active')::boolean, true)
  FROM jsonb_array_elements(p_outlets) AS x(value)
  ON CONFLICT (product_id, outlet_id) DO UPDATE
  SET selling_price = excluded.selling_price,
      is_active = excluded.is_active;

  UPDATE public.product_outlets po
  SET is_active = false
  WHERE po.product_id = v_product_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_outlets) AS x(value)
      WHERE (x.value->>'outlet_id')::uuid = po.outlet_id
    );

  SELECT jsonb_array_length(p_outlets) INTO v_outlet_count;

  RETURN jsonb_build_object(
    'success', true,
    'product_id', v_product_id,
    'outlet_count', v_outlet_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_product_catalog_with_outlets(uuid,uuid,text,text,text,text,text,numeric,boolean,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_product_catalog_with_outlets(uuid,uuid,text,text,text,text,text,numeric,boolean,jsonb) TO authenticated;
