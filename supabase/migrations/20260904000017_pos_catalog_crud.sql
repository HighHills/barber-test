-- ====================================================================
-- MIGRATION 20260904000017: POS CATALOG CRUD & MULTI-OUTLET PRICING
-- Strict Role Guard: Owner and Admin Only
-- ====================================================================

-- 1. RPC: UPSERT CATALOG SERVICE (Layanan Jasa)
CREATE OR REPLACE FUNCTION upsert_catalog_service(
  p_id UUID,
  p_outlet_id UUID,
  p_name VARCHAR(255),
  p_code VARCHAR(50),
  p_category_name VARCHAR(150),
  p_duration_minutes INT DEFAULT 30,
  p_selling_price NUMERIC(18,2) DEFAULT 0,
  p_description TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_category_id UUID;
  v_service_id UUID;
  v_other_outlet RECORD;
BEGIN
  -- RBAC Guard: Only Owner or Admin can modify catalog
  IF NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Akses Ditolak: Hanya Owner dan Admin yang memiliki izin untuk mengelola katalog menu.';
  END IF;

  -- Validate inputs
  IF TRIM(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Nama layanan tidak boleh kosong.';
  END IF;

  IF TRIM(COALESCE(p_code, '')) = '' THEN
    RAISE EXCEPTION 'Kode layanan tidak boleh kosong.';
  END IF;

  IF p_duration_minutes <= 0 THEN
    RAISE EXCEPTION 'Durasi pengerjaan harus lebih besar dari 0 menit.';
  END IF;

  IF p_selling_price < 0 THEN
    RAISE EXCEPTION 'Harga jual tidak boleh bernilai negatif.';
  END IF;

  -- 1. Handle Category (Find existing or create new)
  SELECT id INTO v_category_id
  FROM service_categories
  WHERE LOWER(TRIM(name)) = LOWER(TRIM(p_category_name))
  LIMIT 1;

  IF v_category_id IS NULL THEN
    INSERT INTO service_categories (name, description, is_active)
    VALUES (TRIM(p_category_name), 'Kategori dibuat dari POS', TRUE)
    RETURNING id INTO v_category_id;
  END IF;

  -- 2. Insert or Update services table
  IF p_id IS NULL THEN
    -- Check uniqueness of code
    IF EXISTS (SELECT 1 FROM services WHERE code = TRIM(p_code)) THEN
      RAISE EXCEPTION 'Kode layanan "%" sudah terdaftar. Silakan gunakan kode lain.', TRIM(p_code);
    END IF;

    v_service_id := gen_random_uuid();

    INSERT INTO services (
      id,
      category_id,
      code,
      name,
      description,
      duration_minutes,
      is_active
    ) VALUES (
      v_service_id,
      v_category_id,
      TRIM(p_code),
      TRIM(p_name),
      TRIM(p_description),
      p_duration_minutes,
      p_is_active
    );

    -- Link to current outlet
    INSERT INTO service_outlets (
      service_id,
      outlet_id,
      selling_price,
      is_active
    ) VALUES (
      v_service_id,
      p_outlet_id,
      p_selling_price,
      p_is_active
    );

    -- Ensure other active outlets also have an entry (so they can activate/price it later)
    FOR v_other_outlet IN SELECT id FROM outlets WHERE id <> p_outlet_id AND is_active = TRUE LOOP
      INSERT INTO service_outlets (service_id, outlet_id, selling_price, is_active)
      VALUES (v_service_id, v_other_outlet.id, p_selling_price, TRUE)
      ON CONFLICT (service_id, outlet_id) DO NOTHING;
    END LOOP;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'CREATED',
      'id', v_service_id,
      'message', 'Layanan jasa baru berhasil ditambahkan ke katalog.'
    );
  ELSE
    v_service_id := p_id;

    -- Check uniqueness of code if changed
    IF EXISTS (SELECT 1 FROM services WHERE code = TRIM(p_code) AND id <> v_service_id) THEN
      RAISE EXCEPTION 'Kode layanan "%" sudah terdaftar pada layanan lain.', TRIM(p_code);
    END IF;

    UPDATE services
    SET
      category_id = v_category_id,
      code = TRIM(p_code),
      name = TRIM(p_name),
      description = TRIM(p_description),
      duration_minutes = p_duration_minutes,
      is_active = p_is_active,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_service_id;

    -- Update outlet price and status
    INSERT INTO service_outlets (
      service_id,
      outlet_id,
      selling_price,
      is_active
    ) VALUES (
      v_service_id,
      p_outlet_id,
      p_selling_price,
      p_is_active
    )
    ON CONFLICT (service_id, outlet_id)
    DO UPDATE SET
      selling_price = EXCLUDED.selling_price,
      is_active = EXCLUDED.is_active;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'UPDATED',
      'id', v_service_id,
      'message', 'Layanan jasa berhasil diperbarui.'
    );
  END IF;
END;
$$;


-- 2. RPC: UPSERT CATALOG PRODUCT (Produk Ritel)
CREATE OR REPLACE FUNCTION upsert_catalog_product(
  p_id UUID,
  p_outlet_id UUID,
  p_name VARCHAR(255),
  p_sku VARCHAR(50),
  p_barcode VARCHAR(100) DEFAULT NULL,
  p_category_name VARCHAR(150) DEFAULT 'General',
  p_base_unit VARCHAR(20) DEFAULT 'pcs',
  p_selling_price NUMERIC(18,2) DEFAULT 0,
  p_initial_stock NUMERIC(18,4) DEFAULT 0,
  p_description TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_category_id UUID;
  v_product_id UUID;
  v_other_outlet RECORD;
BEGIN
  -- RBAC Guard: Only Owner or Admin can modify catalog
  IF NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Akses Ditolak: Hanya Owner dan Admin yang memiliki izin untuk mengelola katalog menu.';
  END IF;

  -- Validate inputs
  IF TRIM(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Nama produk ritel tidak boleh kosong.';
  END IF;

  IF TRIM(COALESCE(p_sku, '')) = '' THEN
    RAISE EXCEPTION 'SKU produk tidak boleh kosong.';
  END IF;

  IF p_selling_price < 0 THEN
    RAISE EXCEPTION 'Harga jual tidak boleh bernilai negatif.';
  END IF;

  -- 1. Handle Category (Find existing or create new)
  SELECT id INTO v_category_id
  FROM product_categories
  WHERE LOWER(TRIM(name)) = LOWER(TRIM(p_category_name))
  LIMIT 1;

  IF v_category_id IS NULL THEN
    INSERT INTO product_categories (name, description, is_active)
    VALUES (TRIM(p_category_name), 'Kategori dibuat dari POS', TRUE)
    RETURNING id INTO v_category_id;
  END IF;

  -- 2. Insert or Update products table
  IF p_id IS NULL THEN
    -- Check uniqueness of SKU
    IF EXISTS (SELECT 1 FROM products WHERE sku = TRIM(p_sku)) THEN
      RAISE EXCEPTION 'SKU "%" sudah terdaftar. Silakan gunakan SKU lain.', TRIM(p_sku);
    END IF;

    v_product_id := gen_random_uuid();

    INSERT INTO products (
      id,
      category_id,
      sku,
      barcode,
      name,
      description,
      base_unit,
      is_active
    ) VALUES (
      v_product_id,
      v_category_id,
      TRIM(p_sku),
      NULLIF(TRIM(p_barcode), ''),
      TRIM(p_name),
      TRIM(p_description),
      COALESCE(NULLIF(TRIM(p_base_unit), ''), 'pcs'),
      p_is_active
    );

    -- Link to current outlet price
    INSERT INTO product_outlets (
      product_id,
      outlet_id,
      selling_price,
      is_active
    ) VALUES (
      v_product_id,
      p_outlet_id,
      p_selling_price,
      p_is_active
    );

    -- Initialize stock in outlet_inventory if specified
    IF p_initial_stock > 0 THEN
      INSERT INTO outlet_inventory (
        outlet_id,
        product_id,
        quantity,
        average_cost
      ) VALUES (
        p_outlet_id,
        v_product_id,
        p_initial_stock,
        0
      )
      ON CONFLICT (outlet_id, product_id)
      DO UPDATE SET quantity = EXCLUDED.quantity;
    END IF;

    -- Ensure other active outlets have price entry
    FOR v_other_outlet IN SELECT id FROM outlets WHERE id <> p_outlet_id AND is_active = TRUE LOOP
      INSERT INTO product_outlets (product_id, outlet_id, selling_price, is_active)
      VALUES (v_product_id, v_other_outlet.id, p_selling_price, TRUE)
      ON CONFLICT (product_id, outlet_id) DO NOTHING;
    END LOOP;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'CREATED',
      'id', v_product_id,
      'message', 'Produk ritel baru berhasil ditambahkan ke katalog.'
    );
  ELSE
    v_product_id := p_id;

    -- Check uniqueness of SKU if changed
    IF EXISTS (SELECT 1 FROM products WHERE sku = TRIM(p_sku) AND id <> v_product_id) THEN
      RAISE EXCEPTION 'SKU "%" sudah terdaftar pada produk lain.', TRIM(p_sku);
    END IF;

    UPDATE products
    SET
      category_id = v_category_id,
      sku = TRIM(p_sku),
      barcode = NULLIF(TRIM(p_barcode), ''),
      name = TRIM(p_name),
      description = TRIM(p_description),
      base_unit = COALESCE(NULLIF(TRIM(p_base_unit), ''), 'pcs'),
      is_active = p_is_active,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_product_id;

    -- Update outlet price and status
    INSERT INTO product_outlets (
      product_id,
      outlet_id,
      selling_price,
      is_active
    ) VALUES (
      v_product_id,
      p_outlet_id,
      p_selling_price,
      p_is_active
    )
    ON CONFLICT (product_id, outlet_id)
    DO UPDATE SET
      selling_price = EXCLUDED.selling_price,
      is_active = EXCLUDED.is_active;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'UPDATED',
      'id', v_product_id,
      'message', 'Produk ritel berhasil diperbarui.'
    );
  END IF;
END;
$$;


-- 3. RPC: DELETE / DEACTIVATE CATALOG ITEM
CREATE OR REPLACE FUNCTION delete_catalog_item(
  p_id UUID,
  p_type VARCHAR(20), -- 'SERVICE' or 'PRODUCT'
  p_outlet_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_has_sales BOOLEAN := FALSE;
BEGIN
  -- RBAC Guard: Only Owner or Admin can delete/deactivate
  IF NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Akses Ditolak: Hanya Owner dan Admin yang memiliki izin untuk menghapus atau menonaktifkan katalog.';
  END IF;

  IF UPPER(p_type) = 'SERVICE' THEN
    -- Check if service has historical transactions
    SELECT EXISTS (
      SELECT 1 FROM sale_items WHERE service_id = p_id
      UNION
      SELECT 1 FROM appointments WHERE service_id = p_id
    ) INTO v_has_sales;

    IF v_has_sales THEN
      -- Soft delete: Deactivate from active catalog
      UPDATE service_outlets
      SET is_active = FALSE
      WHERE service_id = p_id AND outlet_id = p_outlet_id;

      UPDATE services
      SET is_active = FALSE
      WHERE id = p_id;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'DEACTIVATED',
        'soft_deleted', true,
        'message', 'Layanan telah dinonaktifkan dari katalog karena telah memiliki riwayat transaksi/reservasi.'
      );
    ELSE
      -- Hard delete: Safe to remove
      DELETE FROM service_consumptions WHERE service_id = p_id;
      DELETE FROM service_outlets WHERE service_id = p_id;
      DELETE FROM services WHERE id = p_id;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'DELETED',
        'soft_deleted', false,
        'message', 'Layanan berhasil dihapus secara permanen dari sistem.'
      );
    END IF;

  ELSIF UPPER(p_type) = 'PRODUCT' THEN
    -- Check if product has historical transactions or stock movements
    SELECT EXISTS (
      SELECT 1 FROM sale_items WHERE product_id = p_id
      UNION
      SELECT 1 FROM inventory_movements WHERE product_id = p_id
      UNION
      SELECT 1 FROM purchase_items WHERE product_id = p_id
    ) INTO v_has_sales;

    IF v_has_sales THEN
      -- Soft delete: Deactivate from active catalog
      UPDATE product_outlets
      SET is_active = FALSE
      WHERE product_id = p_id AND outlet_id = p_outlet_id;

      UPDATE products
      SET is_active = FALSE
      WHERE id = p_id;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'DEACTIVATED',
        'soft_deleted', true,
        'message', 'Produk telah dinonaktifkan dari katalog karena telah memiliki riwayat mutasi/stok/penjualan.'
      );
    ELSE
      -- Hard delete: Safe to remove
      DELETE FROM outlet_inventory WHERE product_id = p_id;
      DELETE FROM product_unit_conversions WHERE product_id = p_id;
      DELETE FROM product_outlets WHERE product_id = p_id;
      DELETE FROM products WHERE id = p_id;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'DELETED',
        'soft_deleted', false,
        'message', 'Produk berhasil dihapus secara permanen dari sistem.'
      );
    END IF;

  ELSE
    RAISE EXCEPTION 'Tipe item tidak valid: harus "SERVICE" atau "PRODUCT".';
  END IF;
END;
$$;

-- 4. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION upsert_catalog_service(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, INT, NUMERIC, TEXT, BOOLEAN) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION upsert_catalog_product(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, NUMERIC, NUMERIC, TEXT, BOOLEAN) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION delete_catalog_item(UUID, VARCHAR, UUID) TO authenticated, anon;
