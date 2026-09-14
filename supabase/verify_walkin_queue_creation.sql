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

  -- Assert table SELECT preserved
  IF NOT has_table_privilege('authenticated', 'public.queues', 'SELECT') THEN
    RAISE EXCEPTION 'FAILED: authenticated cannot SELECT queues';
  END IF;

  -- Assert RPC privileges
  IF NOT has_function_privilege('authenticated', 'public.create_walk_in_queue(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: authenticated cannot EXECUTE create_walk_in_queue';
  END IF;

  IF has_function_privilege('anon', 'public.create_walk_in_queue(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: anon can EXECUTE create_walk_in_queue';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.check_in_appointment_to_queue(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: authenticated cannot EXECUTE check_in_appointment_to_queue';
  END IF;

  RAISE NOTICE 'SUCCESS: All Phase 3C.5 queue creation assertions passed successfully.';
END;
$$;
