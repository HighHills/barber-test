-- supabase/verify_cashier_subaccounts.sql
-- Uji Coba dan Verifikasi Sub-Akun Kasir (RBAC & Outlet Assignment)
-- Jalankan di Supabase SQL Editor setelah menjalankan migration 16.

-- 1. Buat Kasir Demo 1 untuk Outlet Pusat (Sudirman)
DO $$
DECLARE
  v_sudirman_id UUID;
  v_res JSONB;
BEGIN
  SELECT id INTO v_sudirman_id FROM outlets WHERE code = 'OUT-01' LIMIT 1;
  IF v_sudirman_id IS NOT NULL THEN
    v_res := create_cashier_subaccount(
      'kasir.sudirman@barbershop.co.id',
      'Password123!',
      'Rian Kasir Sudirman',
      '081234567891',
      v_sudirman_id
    );
    RAISE NOTICE 'Hasil Kasir Sudirman: %', v_res;
  END IF;
END $$;

-- 2. Buat Kasir Demo 2 untuk Outlet Cabang (Senopati)
DO $$
DECLARE
  v_senopati_id UUID;
  v_res JSONB;
BEGIN
  SELECT id INTO v_senopati_id FROM outlets WHERE code = 'OUT-02' LIMIT 1;
  IF v_senopati_id IS NOT NULL THEN
    v_res := create_cashier_subaccount(
      'kasir.senopati@barbershop.co.id',
      'Password123!',
      'Dedi Kasir Senopati',
      '081234567892',
      v_senopati_id
    );
    RAISE NOTICE 'Hasil Kasir Senopati: %', v_res;
  END IF;
END $$;

-- 3. Cek Daftar Sub-Akun Kasir Aktif Beserta Penugasan Outlet
SELECT 
  p.display_name AS "Nama Kasir",
  u.email AS "Email Login",
  o.code AS "Kode Outlet",
  o.name AS "Nama Cabang Ditugaskan",
  r.code AS "Role Sistem",
  p.is_active AS "Status Akun",
  ur.created_at AS "Waktu Dibuat"
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
JOIN roles r ON r.id = ur.role_id AND r.code = 'CASHIER'
JOIN outlets o ON o.id = ur.outlet_id
LEFT JOIN auth.users u ON u.id = p.auth_user_id
ORDER BY o.code, p.display_name;
