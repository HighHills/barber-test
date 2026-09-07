-- ====================================================================
-- VERIFY & DEMO: POS CATALOG CRUD & MULTI-OUTLET PRICING
-- Jalankan skrip ini di Supabase SQL Editor untuk memverifikasi RPC CRUD
-- ====================================================================

DO $$
DECLARE
  v_sudirman_id UUID;
  v_senopati_id UUID;
  v_res JSONB;
BEGIN
  SELECT id INTO v_sudirman_id FROM outlets WHERE code = 'OUT-01' LIMIT 1;
  SELECT id INTO v_senopati_id FROM outlets WHERE code = 'OUT-02' LIMIT 1;

  IF v_sudirman_id IS NULL THEN
    RAISE NOTICE 'Outlet OUT-01 tidak ditemukan, lewati tes demo.';
    RETURN;
  END IF;

  RAISE NOTICE 'Testing upsert_catalog_service...';
  -- 1. Tambah Layanan Jasa Demo Baru
  v_res := upsert_catalog_service(
    NULL,
    v_sudirman_id,
    'Gentlemen Beard Trim & Hot Towel',
    'SRV-BRD-01',
    'Shaving & Beard',
    30,
    65000,
    'Perapian janggut presisi dengan handuk hangat aromaterapi',
    TRUE
  );
  RAISE NOTICE 'Hasil Layanan: %', v_res;

  RAISE NOTICE 'Testing upsert_catalog_product...';
  -- 2. Tambah Produk Ritel Demo Baru
  v_res := upsert_catalog_product(
    NULL,
    v_sudirman_id,
    'Premium Beard Oil 30ml',
    'PRD-BRD-01',
    '899123456001',
    'Hair Tonic & Serum',
    'botol',
    85000,
    15,
    'Minyak perawatan janggut dan kumis dengan argan oil',
    TRUE
  );
  RAISE NOTICE 'Hasil Produk: %', v_res;

  RAISE NOTICE 'Verifikasi RPC Katalog Selesai dengan Sukses!';
END;
$$;
