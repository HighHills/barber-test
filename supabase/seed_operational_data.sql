-- ============================================================
-- BARBERSHOP OS: PHASE 1 INITIAL OPERATIONAL SEED & USER ONBOARDING
-- Jalankan skrip ini di Supabase SQL Editor untuk:
-- 1. Menghubungkan user login (auth.users) ke profiles & user_roles (OWNER)
-- 2. Mengisi data master: Outlet, Laci Kasir, Periode Finansial,
--    Layanan Cukur & Harga Outlet, Produk Pomade & Stok, serta Staf Barber.
-- ============================================================

-- 1. Daftarkan seluruh user dari auth.users ke public.profiles
INSERT INTO public.profiles (id, auth_user_id, display_name, phone, is_active)
SELECT
  gen_random_uuid(),
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1), 'Operator Kasir'),
  u.phone,
  TRUE
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.auth_user_id = u.id
);

-- 2. Berikan peran OWNER (Hak Akses Penuh Semua Outlet) ke semua profil
INSERT INTO public.user_roles (user_id, role_id, outlet_id)
SELECT
  p.id,
  r.id,
  NULL -- NULL outlet_id memberikan akses global ke seluruh cabang untuk OWNER
FROM public.profiles p
CROSS JOIN public.roles r
WHERE r.code = 'OWNER'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role_id = r.id
  );

-- 3. Tambahkan Cabang / Outlet Utama
INSERT INTO public.outlets (code, name, address, phone, timezone, is_active)
VALUES (
  'OUT-01',
  'Barbershop Pusat - Sudirman',
  'Jl. Jend. Sudirman No. 45, Jakarta Pusat',
  '081234567890',
  'Asia/Jakarta',
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = TRUE;

-- 4. Tambahkan Register / Laci Kasir Fisik untuk OUT-01
INSERT INTO public.cash_registers (outlet_id, name, is_active)
SELECT
  o.id,
  'Kasir Utama 01',
  TRUE
FROM public.outlets o
WHERE o.code = 'OUT-01'
  AND NOT EXISTS (
    SELECT 1 FROM public.cash_registers cr WHERE cr.outlet_id = o.id AND cr.name = 'Kasir Utama 01'
  );

-- 5. Buka Periode Finansial Aktif Berjalan (Wajib untuk Transaksi Penjualan)
INSERT INTO public.financial_periods (period_start, period_end, status)
SELECT
  DATE_TRUNC('year', CURRENT_DATE)::DATE,
  (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 day')::DATE,
  'OPEN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.financial_periods
  WHERE CURRENT_DATE >= period_start AND CURRENT_DATE <= period_end AND status = 'OPEN'
);

-- 6. Tambahkan Kategori & Layanan Jasa Barbershop
INSERT INTO public.service_categories (name, sort_order, is_active)
VALUES
  ('Potong & Styling', 1, TRUE),
  ('Perawatan & Cuci', 2, TRUE),
  ('Cukur & Kumis', 3, TRUE)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_cat_cut UUID;
  v_cat_care UUID;
  v_cat_shave UUID;
  v_out_id UUID;
  v_srv_gentle UUID;
  v_srv_shave UUID;
  v_srv_wash UUID;
BEGIN
  SELECT id INTO v_cat_cut FROM public.service_categories WHERE name = 'Potong & Styling' LIMIT 1;
  SELECT id INTO v_cat_care FROM public.service_categories WHERE name = 'Perawatan & Cuci' LIMIT 1;
  SELECT id INTO v_cat_shave FROM public.service_categories WHERE name = 'Cukur & Kumis' LIMIT 1;
  SELECT id INTO v_out_id FROM public.outlets WHERE code = 'OUT-01' LIMIT 1;

  -- 6.1 Gentle Classic Cut
  INSERT INTO public.services (code, name, category_id, duration_minutes, is_active)
  VALUES ('SRV-CUT-01', 'Gentlemen Classic Haircut', v_cat_cut, 40, TRUE)
  ON CONFLICT (code) DO NOTHING
  RETURNING id INTO v_srv_gentle;
  IF v_srv_gentle IS NULL THEN
    SELECT id INTO v_srv_gentle FROM public.services WHERE code = 'SRV-CUT-01';
  END IF;

  -- 6.2 Hot Towel Shave
  INSERT INTO public.services (code, name, category_id, duration_minutes, is_active)
  VALUES ('SRV-SHV-01', 'Traditional Hot Towel Shave', v_cat_shave, 25, TRUE)
  ON CONFLICT (code) DO NOTHING
  RETURNING id INTO v_srv_shave;
  IF v_srv_shave IS NULL THEN
    SELECT id INTO v_srv_shave FROM public.services WHERE code = 'SRV-SHV-01';
  END IF;

  -- 6.3 Hair Wash & Massage
  INSERT INTO public.services (code, name, category_id, duration_minutes, is_active)
  VALUES ('SRV-WSH-01', 'Head Massage & Hair Wash', v_cat_care, 20, TRUE)
  ON CONFLICT (code) DO NOTHING
  RETURNING id INTO v_srv_wash;
  IF v_srv_wash IS NULL THEN
    SELECT id INTO v_srv_wash FROM public.services WHERE code = 'SRV-WSH-01';
  END IF;

  -- Hubungkan Harga Jual Layanan di Outlet Pusat
  INSERT INTO public.service_outlets (service_id, outlet_id, selling_price, is_active)
  VALUES
    (v_srv_gentle, v_out_id, 55000.00, TRUE),
    (v_srv_shave, v_out_id, 35000.00, TRUE),
    (v_srv_wash, v_out_id, 25000.00, TRUE)
  ON CONFLICT (service_id, outlet_id) DO UPDATE SET selling_price = EXCLUDED.selling_price;
END $$;

-- 7. Tambahkan Kategori Produk, Produk Ritel & Stok Awal
INSERT INTO public.product_categories (name, sort_order, is_active)
VALUES
  ('Pomade & Wax', 1, TRUE),
  ('Tonic & Perawatan', 2, TRUE)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_cat_pomade UUID;
  v_cat_tonic UUID;
  v_out_id UUID;
  v_prd_clay UUID;
  v_prd_water UUID;
  v_prd_tonic UUID;
BEGIN
  SELECT id INTO v_cat_pomade FROM public.product_categories WHERE name = 'Pomade & Wax' LIMIT 1;
  SELECT id INTO v_cat_tonic FROM public.product_categories WHERE name = 'Tonic & Perawatan' LIMIT 1;
  SELECT id INTO v_out_id FROM public.outlets WHERE code = 'OUT-01' LIMIT 1;

  -- 7.1 Matte Clay Pomade
  INSERT INTO public.products (sku, barcode, name, category_id, base_unit, default_cost_price, is_active)
  VALUES ('PRD-POM-01', '899123456701', 'Matte Clay Strong Hold 100g', v_cat_pomade, 'pcs', 45000.00, TRUE)
  ON CONFLICT (sku) DO NOTHING
  RETURNING id INTO v_prd_clay;
  IF v_prd_clay IS NULL THEN
    SELECT id INTO v_prd_clay FROM public.products WHERE sku = 'PRD-POM-01';
  END IF;

  -- 7.2 Waterbased Pomade
  INSERT INTO public.products (sku, barcode, name, category_id, base_unit, default_cost_price, is_active)
  VALUES ('PRD-POM-02', '899123456702', 'Classic Waterbased Shine 100g', v_cat_pomade, 'pcs', 40000.00, TRUE)
  ON CONFLICT (sku) DO NOTHING
  RETURNING id INTO v_prd_water;
  IF v_prd_water IS NULL THEN
    SELECT id INTO v_prd_water FROM public.products WHERE sku = 'PRD-POM-02';
  END IF;

  -- 7.3 Cooling Hair Tonic
  INSERT INTO public.products (sku, barcode, name, category_id, base_unit, default_cost_price, is_active)
  VALUES ('PRD-TNC-01', '899123456703', 'Cooling Hair Tonic Menthol 150ml', v_cat_tonic, 'bottle', 35000.00, TRUE)
  ON CONFLICT (sku) DO NOTHING
  RETURNING id INTO v_prd_tonic;
  IF v_prd_tonic IS NULL THEN
    SELECT id INTO v_prd_tonic FROM public.products WHERE sku = 'PRD-TNC-01';
  END IF;

  -- Hubungkan Harga Jual Produk di Outlet Pusat
  INSERT INTO public.product_outlets (product_id, outlet_id, selling_price, is_active)
  VALUES
    (v_prd_clay, v_out_id, 85000.00, TRUE),
    (v_prd_water, v_out_id, 75000.00, TRUE),
    (v_prd_tonic, v_out_id, 60000.00, TRUE)
  ON CONFLICT (product_id, outlet_id) DO UPDATE SET selling_price = EXCLUDED.selling_price;

  -- Isi Saldo Persediaan Awal (Moving Average Cost & Stock Balances)
  INSERT INTO public.outlet_inventory (outlet_id, product_id, quantity, average_cost)
  VALUES
    (v_out_id, v_prd_clay, 25.0000, 45000.00),
    (v_out_id, v_prd_water, 20.0000, 40000.00),
    (v_out_id, v_prd_tonic, 15.0000, 35000.00)
  ON CONFLICT (outlet_id, product_id) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    average_cost = EXCLUDED.average_cost;
END $$;

-- 8. Tambahkan Staf Barber / Kapster
DO $$
DECLARE
  v_out_id UUID;
  v_emp1 UUID;
  v_emp2 UUID;
BEGIN
  SELECT id INTO v_out_id FROM public.outlets WHERE code = 'OUT-01' LIMIT 1;

  INSERT INTO public.employees (employee_code, full_name, position, is_active)
  VALUES ('BARBER-01', 'Budi Santoso', 'Senior Barber', TRUE)
  ON CONFLICT (employee_code) DO NOTHING
  RETURNING id INTO v_emp1;
  IF v_emp1 IS NULL THEN
    SELECT id INTO v_emp1 FROM public.employees WHERE employee_code = 'BARBER-01';
  END IF;

  INSERT INTO public.employees (employee_code, full_name, position, is_active)
  VALUES ('BARBER-02', 'Rian Hidayat', 'Barber Stylist', TRUE)
  ON CONFLICT (employee_code) DO NOTHING
  RETURNING id INTO v_emp2;
  IF v_emp2 IS NULL THEN
    SELECT id INTO v_emp2 FROM public.employees WHERE employee_code = 'BARBER-02';
  END IF;

  -- Hubungkan Barber ke Cabang OUT-01
  INSERT INTO public.employee_outlets (employee_id, outlet_id, is_primary, is_active)
  VALUES
    (v_emp1, v_out_id, TRUE, TRUE),
    (v_emp2, v_out_id, FALSE, TRUE)
  ON CONFLICT (employee_id, outlet_id) DO NOTHING;

  -- 9. Tambahkan Aturan Komisi Default (Tier 7 Global: 10% untuk Jasa Cukur)
  INSERT INTO public.commission_rules (
    employee_id, service_id, product_id, outlet_id,
    commission_type, commission_rate, fixed_amount, priority, is_active
  ) VALUES (
    NULL, NULL, NULL, NULL,
    'PERCENTAGE', 10.00, 0.00, 7, TRUE
  ) ON CONFLICT DO NOTHING;
END $$;

-- Verifikasi Data Akhir
SELECT 'profiles' AS table_name, COUNT(*) AS count FROM public.profiles
UNION ALL
SELECT 'user_roles', COUNT(*) FROM public.user_roles
UNION ALL
SELECT 'outlets', COUNT(*) FROM public.outlets
UNION ALL
SELECT 'cash_registers', COUNT(*) FROM public.cash_registers
UNION ALL
SELECT 'services', COUNT(*) FROM public.services
UNION ALL
SELECT 'products', COUNT(*) FROM public.products
UNION ALL
SELECT 'employees', COUNT(*) FROM public.employees;
