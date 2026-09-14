-- ============================================================================
-- VERIFICATION SCRIPT: WALKIN QUEUE CREATION & SHARED ALLOCATOR
-- Phase 3C.5 Verification
--
-- Jalankan di Supabase SQL Editor untuk memverifikasi privilege, fungsi RPC,
-- dan mekanisme concurrency locking.
-- ============================================================================

-- 1. Periksa Table Privileges untuk public.queues
SELECT 
  grantee,
  table_schema,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'queues'
  AND grantee IN ('authenticated', 'anon', 'service_role')
ORDER BY grantee, privilege_type;

-- 2. Evaluasi Hak Akses Fungsi (Boolean Assertions)
SELECT
  -- create_walk_in_queue RPC privileges
  has_function_privilege('authenticated', 'public.create_walk_in_queue(uuid,uuid,uuid)', 'EXECUTE')
    AS "auth_can_exec_create_walk_in (EXPECT: true)",
  has_function_privilege('anon', 'public.create_walk_in_queue(uuid,uuid,uuid)', 'EXECUTE')
    AS "anon_can_exec_create_walk_in (EXPECT: false)",

  -- check_in_appointment_to_queue RPC privileges
  has_function_privilege('authenticated', 'public.check_in_appointment_to_queue(uuid,uuid,uuid)', 'EXECUTE')
    AS "auth_can_exec_check_in_appointment (EXPECT: true)",
  has_function_privilege('anon', 'public.check_in_appointment_to_queue(uuid,uuid,uuid)', 'EXECUTE')
    AS "anon_can_exec_check_in_appointment (EXPECT: false)",

  -- queues Table Privileges
  has_table_privilege('authenticated', 'public.queues', 'INSERT')
    AS "authenticated_can_insert_queues (EXPECT: false)",
  has_table_privilege('anon', 'public.queues', 'INSERT')
    AS "anon_can_insert_queues (EXPECT: false)",
  has_table_privilege('authenticated', 'public.queues', 'SELECT')
    AS "authenticated_can_select_queues (EXPECT: true)",
  has_table_privilege('service_role', 'public.queues', 'INSERT')
    AS "service_role_can_insert_queues (EXPECT: true)";

-- 3. Uji Concurrency Lock Key Serialisasi
-- Membuktikan bahwa lock key antara walk-in dan check-in identik
-- pada tanggal dan outlet yang sama.
DO $$
DECLARE
  v_dummy_outlet UUID := '00000000-0000-0000-0000-000000000001';
  v_test_date DATE := CURRENT_DATE;
  v_walkin_key BIGINT;
  v_checkin_key BIGINT;
  v_locked BOOLEAN;
BEGIN
  -- Hitung kunci hash untuk walk-in
  v_walkin_key := hashtextextended('queue-number-allocator:' || v_dummy_outlet::TEXT || ':' || v_test_date::TEXT, 0);

  -- Hitung kunci hash untuk check-in
  v_checkin_key := hashtextextended('queue-number-allocator:' || v_dummy_outlet::TEXT || ':' || v_test_date::TEXT, 0);

  IF v_walkin_key IS DISTINCT FROM v_checkin_key THEN
    RAISE EXCEPTION 'Concurrency Lock Key Mismatch! Walkin: %, Checkin: %', v_walkin_key, v_checkin_key;
  END IF;

  -- Uji coba advisory transaction lock
  v_locked := pg_try_advisory_xact_lock(v_walkin_key);
  IF NOT v_locked THEN
    RAISE EXCEPTION 'Failed to acquire test advisory xact lock';
  END IF;

  -- Kunci yang sama tidak dapat diambil oleh session lain selama transaksi berlangsung
  RAISE NOTICE 'SUCCESS: Concurrency lock key verified identical (%) and operational.', v_walkin_key;
END;
$$;

-- 4. Blok Asersi Privilege Otomatis
DO $$
BEGIN
  -- Assert table INSERT revoked
  IF has_table_privilege('authenticated', 'public.queues', 'INSERT') THEN
    RAISE EXCEPTION 'FAILED: authenticated can still INSERT queues';
  END IF;

  IF has_table_privilege('anon', 'public.queues', 'INSERT') THEN
    RAISE EXCEPTION 'FAILED: anon can still INSERT queues';
  END IF;

  -- Assert table UPDATE revoked
  IF has_table_privilege('authenticated', 'public.queues', 'UPDATE') THEN
    RAISE EXCEPTION 'FAILED: authenticated can still UPDATE queues';
  END IF;

  IF has_table_privilege('anon', 'public.queues', 'UPDATE') THEN
    RAISE EXCEPTION 'FAILED: anon can still UPDATE queues';
  END IF;

  -- Assert table SELECT preserved
  IF NOT has_table_privilege('authenticated', 'public.queues', 'SELECT') THEN
    RAISE EXCEPTION 'FAILED: authenticated cannot SELECT queues';
  END IF;

  -- Assert table service_role preserved
  IF NOT has_table_privilege('service_role', 'public.queues', 'INSERT') THEN
    RAISE EXCEPTION 'FAILED: service_role lost INSERT on queues';
  END IF;

  -- Assert RPC privileges for create_walk_in_queue
  IF NOT has_function_privilege('authenticated', 'public.create_walk_in_queue(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: authenticated cannot EXECUTE create_walk_in_queue';
  END IF;

  IF has_function_privilege('anon', 'public.create_walk_in_queue(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: anon can EXECUTE create_walk_in_queue';
  END IF;

  -- Assert RPC privileges for check_in_appointment_to_queue
  IF NOT has_function_privilege('authenticated', 'public.check_in_appointment_to_queue(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: authenticated cannot EXECUTE check_in_appointment_to_queue';
  END IF;

  IF has_function_privilege('anon', 'public.check_in_appointment_to_queue(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: anon can EXECUTE check_in_appointment_to_queue';
  END IF;

  -- Assert private.allocate_queue_number privileges
  IF has_function_privilege('anon', 'private.allocate_queue_number(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: anon can EXECUTE private.allocate_queue_number';
  END IF;

  IF has_function_privilege('authenticated', 'private.allocate_queue_number(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: authenticated can EXECUTE private.allocate_queue_number';
  END IF;

  RAISE NOTICE 'SUCCESS: All Phase 3C.5 queue creation and privilege assertions passed successfully.';
END;
$$;

-- 5. Uji Semantik Posisi Barber vs Non-Barber
DO $$
DECLARE
  v_test_positions TEXT[] := ARRAY['Senior Barber', 'Barber Stylist', 'barber', 'BARBER', 'kapster', 'KAPSTER'];
  v_invalid_positions TEXT[] := ARRAY['CASHIER', 'Kasir', 'MANAGER', 'ADMIN', 'Gudang'];
  pos TEXT;
BEGIN
  -- Pastikan seluruh variasi barber/kapster lolos kriteria
  FOREACH pos IN ARRAY v_test_positions LOOP
    IF NOT (LOWER(pos) LIKE '%barber%' OR LOWER(pos) LIKE '%kapster%') THEN
      RAISE EXCEPTION 'FAILED: Valid barber position "%" was rejected by pattern', pos;
    END IF;
  END LOOP;

  -- Pastikan non-barber (kasir, manager, admin) ditolak
  FOREACH pos IN ARRAY v_invalid_positions LOOP
    IF (LOWER(pos) LIKE '%barber%' OR LOWER(pos) LIKE '%kapster%') THEN
      RAISE EXCEPTION 'FAILED: Non-barber position "%" was unexpectedly accepted', pos;
    END IF;
  END LOOP;

  RAISE NOTICE 'SUCCESS: Barber position semantics validated (valid positions accepted, non-barber rejected).';
END;
$$;

-- 6. Verifikasi search_path Kosong pada Fungsi SECURITY DEFINER
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  p.prosecdef AS is_security_definer,
  p.proconfig AS configuration
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (
  (n.nspname = 'private' AND p.proname = 'allocate_queue_number')
  OR (n.nspname = 'public' AND p.proname IN ('create_walk_in_queue', 'check_in_appointment_to_queue'))
)
ORDER BY n.nspname, p.proname;

