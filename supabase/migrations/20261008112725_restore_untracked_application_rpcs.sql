-- Baseline RPCs used by web and Expo apps but previously only present in the live project.
-- Snapshotted from the deployed Supabase schema on 2026-10-08; no tenant data is copied.
-- Each function retains its authorization guard and hardened search_path.

CREATE OR REPLACE FUNCTION public.close_cash_session(p_session_id uuid, p_closing_balance numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor UUID;
  v_session RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_actor := public._security_current_actor_profile(NULL);

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Cash session wajib dipilih' USING ERRCODE = '22023';
  END IF;

  IF p_closing_balance IS NULL OR p_closing_balance < 0 THEN
    RAISE EXCEPTION 'Closing balance tidak boleh negatif' USING ERRCODE = '22023';
  END IF;

  SELECT
    cs.id,
    cs.cash_register_id,
    cs.opened_by,
    cs.opened_at,
    cs.opening_balance,
    cs.status,
    cr.outlet_id,
    cr.is_active AS register_is_active,
    o.is_active AS outlet_is_active
  INTO v_session
  FROM public.cash_sessions cs
  JOIN public.cash_registers cr ON cr.id = cs.cash_register_id
  JOIN public.outlets o ON o.id = cr.outlet_id
  WHERE cs.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash session tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'OPEN' THEN
    RAISE EXCEPTION 'Cash session % tidak OPEN (status saat ini: %)', p_session_id, v_session.status
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_session.register_is_active OR NOT v_session.outlet_is_active THEN
    RAISE EXCEPTION 'Cash register atau outlet untuk session ini tidak aktif' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_owner_or_admin()
     AND NOT public.current_user_has_permission('pos.session.manage', v_session.outlet_id)
  THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki izin mengelola cash session pada outlet ini' USING ERRCODE = '42501';
  END IF;

  UPDATE public.cash_sessions
  SET
    closed_by = v_actor,
    closed_at = CURRENT_TIMESTAMP,
    closing_balance = p_closing_balance,
    status = 'CLOSED'
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'session_id', v_session.id,
    'cash_register_id', v_session.cash_register_id,
    'opened_by', v_session.opened_by,
    'opened_at', v_session.opened_at,
    'opening_balance', v_session.opening_balance,
    'closed_by', v_actor,
    'closed_at', CURRENT_TIMESTAMP,
    'closing_balance', p_closing_balance,
    'status', 'CLOSED'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_financial_period(p_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_period record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_actor := public._security_current_actor_profile(NULL);

  IF p_period_id IS NULL THEN
    RAISE EXCEPTION 'Financial period wajib dipilih' USING ERRCODE = '22023';
  END IF;

  IF NOT public.current_user_has_permission('finance.period.close', NULL) THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki izin menutup periode akuntansi' USING ERRCODE = '42501';
  END IF;

  SELECT
    fp.id,
    fp.period_start,
    fp.period_end,
    fp.status,
    fp.closed_at,
    fp.closed_by
  INTO v_period
  FROM public.financial_periods fp
  WHERE fp.id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial period tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;

  IF v_period.status <> 'OPEN' THEN
    RAISE EXCEPTION 'Financial period % tidak OPEN (status saat ini: %)', p_period_id, v_period.status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.financial_periods
  SET
    status = 'CLOSED',
    closed_at = CURRENT_TIMESTAMP,
    closed_by = v_actor
  WHERE id = p_period_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'period_id', v_period.id,
    'period_start', v_period.period_start,
    'period_end', v_period.period_end,
    'closed_by', v_actor,
    'closed_at', CURRENT_TIMESTAMP,
    'status', 'CLOSED'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_queue_to_sale(p_queue_id uuid, p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_auth uuid;
  v_actor_profile uuid;
  v_queue record;
  v_sale record;
  v_existing record;
BEGIN
  v_actor_auth := auth.uid();

  IF v_actor_auth IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.id
  INTO v_actor_profile
  FROM public.profiles p
  WHERE p.auth_user_id = v_actor_auth
    AND p.is_active = TRUE
  LIMIT 1;

  IF v_actor_profile IS NULL THEN
    RAISE EXCEPTION 'Profil pengguna aktif tidak ditemukan untuk akun terautentikasi'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    q.id,
    q.outlet_id,
    q.customer_id,
    q.status
  INTO v_queue
  FROM public.queues q
  WHERE q.id = p_queue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue % tidak ditemukan', p_queue_id
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.current_user_has_outlet_access(v_queue.outlet_id)
     AND NOT public.is_owner_or_admin()
  THEN
    RAISE EXCEPTION 'Akses ditolak untuk outlet antrean ini'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    s.id,
    s.outlet_id,
    s.customer_id,
    s.status,
    s.total_amount,
    s.invoice_number
  INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % tidak ditemukan', p_sale_id
      USING ERRCODE = '22023';
  END IF;

  IF v_sale.outlet_id IS DISTINCT FROM v_queue.outlet_id THEN
    RAISE EXCEPTION 'Sale dan antrean berasal dari outlet berbeda'
      USING ERRCODE = '22023';
  END IF;

  IF v_queue.customer_id IS DISTINCT FROM v_sale.customer_id THEN
    RAISE EXCEPTION 'Customer sale tidak cocok dengan customer antrean'
      USING ERRCODE = '22023';
  END IF;

  IF v_sale.status <> 'COMPLETED'::public.sale_status_enum THEN
    RAISE EXCEPTION 'Hanya transaksi COMPLETED yang dapat ditautkan ke antrean'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    qsl.id,
    qsl.queue_id,
    qsl.sale_id
  INTO v_existing
  FROM public.queue_sale_links qsl
  WHERE qsl.queue_id = p_queue_id
     OR qsl.sale_id = p_sale_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.queue_id = p_queue_id
       AND v_existing.sale_id = p_sale_id
    THEN
      RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', true,
        'link_id', v_existing.id,
        'queue_id', v_existing.queue_id,
        'sale_id', v_existing.sale_id,
        'invoice_number', v_sale.invoice_number,
        'sale_status', v_sale.status
      );
    END IF;

    RAISE EXCEPTION 'Antrean atau transaksi sudah tertaut ke transaksi lain'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.queue_sale_links (
    queue_id,
    sale_id,
    linked_by
  )
  VALUES (
    p_queue_id,
    p_sale_id,
    v_actor_profile
  )
  RETURNING id INTO v_existing.id;

  RETURN jsonb_build_object(
    'success', true,
    'is_duplicate', false,
    'link_id', v_existing.id,
    'queue_id', p_queue_id,
    'sale_id', p_sale_id,
    'invoice_number', v_sale.invoice_number,
    'sale_status', v_sale.status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_settings_users()
 RETURNS TABLE(id uuid, display_name character varying, phone character varying, email character varying, is_active boolean, employee_id uuid, role_id uuid, role_code character varying, role_name character varying, role_is_system boolean, outlet_id uuid, outlet_name character varying, outlet_code character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT current_user_has_permission('user.manage', NULL) THEN
    RAISE EXCEPTION 'Hanya pengguna berwenang yang dapat melihat manajemen sub-akun' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.phone,
    u.email::varchar,
    p.is_active,
    p.employee_id,
    r.id,
    r.code,
    r.name,
    r.is_system,
    ur.outlet_id,
    o.name,
    o.code
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.auth_user_id
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  LEFT JOIN public.roles r ON r.id = ur.role_id
  LEFT JOIN public.outlets o ON o.id = ur.outlet_id
  ORDER BY p.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.open_cash_session(p_cash_register_id uuid, p_opening_balance numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor UUID;
  v_register RECORD;
  v_session RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_actor := public._security_current_actor_profile(NULL);

  IF p_cash_register_id IS NULL THEN
    RAISE EXCEPTION 'Cash register wajib dipilih' USING ERRCODE = '22023';
  END IF;

  IF p_opening_balance IS NULL OR p_opening_balance < 0 THEN
    RAISE EXCEPTION 'Opening balance tidak boleh negatif' USING ERRCODE = '22023';
  END IF;

  SELECT cr.id, cr.outlet_id, cr.is_active
    INTO v_register
  FROM public.cash_registers cr
  JOIN public.outlets o ON o.id = cr.outlet_id AND o.is_active = TRUE
  WHERE cr.id = p_cash_register_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_register.is_active THEN
    RAISE EXCEPTION 'Cash register tidak ditemukan atau tidak aktif' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_owner_or_admin()
     AND NOT public.current_user_has_permission('pos.session.manage', v_register.outlet_id)
  THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki izin mengelola cash session pada outlet ini' USING ERRCODE = '42501';
  END IF;

  SELECT cs.id, cs.cash_register_id, cs.opened_by, cs.opened_at, cs.opening_balance, cs.status
    INTO v_session
  FROM public.cash_sessions cs
  WHERE cs.cash_register_id = p_cash_register_id
    AND cs.status = 'OPEN'
  ORDER BY cs.opened_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'Cash register sudah memiliki cash session OPEN (%). Tutup session tersebut terlebih dahulu.', v_session.id
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.cash_sessions (
    cash_register_id,
    opened_by,
    opened_at,
    opening_balance,
    status
  ) VALUES (
    p_cash_register_id,
    v_actor,
    CURRENT_TIMESTAMP,
    p_opening_balance,
    'OPEN'
  )
  RETURNING id, cash_register_id, opened_by, opened_at, opening_balance, status
  INTO v_session;

  RETURN jsonb_build_object(
    'success', TRUE,
    'session_id', v_session.id,
    'cash_register_id', v_session.cash_register_id,
    'opened_by', v_session.opened_by,
    'opened_at', v_session.opened_at,
    'opening_balance', v_session.opening_balance,
    'status', v_session.status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_commission_payout(p_employee_id uuid, p_outlet_id uuid, p_payment_source text, p_reference_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor UUID;
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
  v_total NUMERIC(18,2) := 0.00;
  v_count INTEGER := 0;
  v_payable_id UUID;
  v_cash_id UUID;
  v_bank_id UUID;
  v_payout_account_id UUID;
  v_employee_name TEXT;
  v_journal_id UUID;
  v_journal_number TEXT;
BEGIN
  v_actor := _security_current_actor_profile(NULL);

  IF v_jwt_role <> 'service_role'
     AND NOT current_user_has_permission('commission.manage', p_outlet_id)
  THEN
    RAISE EXCEPTION 'User lacks permission commission.manage for outlet %', p_outlet_id
      USING ERRCODE = '42501';
  END IF;

  IF p_payment_source NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'Sumber pembayaran komisi harus CASH atau BANK'
      USING ERRCODE = '22023';
  END IF;

  SELECT e.full_name INTO v_employee_name
  FROM employees e
  WHERE e.id = p_employee_id
    AND e.is_active = TRUE
    AND EXISTS (
      SELECT 1 FROM employee_outlets eo
      WHERE eo.employee_id = e.id
        AND eo.outlet_id = p_outlet_id
        AND eo.is_active = TRUE
    );

  IF v_employee_name IS NULL THEN
    RAISE EXCEPTION 'Kapster tidak ditemukan/aktif pada outlet yang dipilih'
      USING ERRCODE = '22023';
  END IF;

  PERFORM c.id
  FROM public.commissions c
  WHERE c.employee_id = p_employee_id
    AND c.outlet_id = p_outlet_id
    AND c.status = 'EARNED'
  FOR UPDATE;

  SELECT COALESCE(SUM(c.commission_amount), 0.00), COUNT(*)
  INTO v_total, v_count
  FROM public.commissions c
  WHERE c.employee_id = p_employee_id
    AND c.outlet_id = p_outlet_id
    AND c.status = 'EARNED';

  IF v_count = 0 OR v_total <= 0 THEN
    RAISE EXCEPTION 'Tidak ada komisi EARNED yang dapat dicairkan untuk kapster ini'
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_payable_id FROM financial_accounts WHERE account_code = '2100' LIMIT 1;
  SELECT id INTO v_cash_id FROM financial_accounts WHERE account_code = '1000' LIMIT 1;
  SELECT id INTO v_bank_id FROM financial_accounts WHERE account_code = '1100' LIMIT 1;

  IF v_payable_id IS NULL THEN
    RAISE EXCEPTION 'Akun 2100 Commission Payable tidak ditemukan';
  END IF;

  v_payout_account_id := CASE WHEN p_payment_source = 'CASH' THEN v_cash_id ELSE v_bank_id END;
  IF v_payout_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun sumber dana % tidak ditemukan', p_payment_source;
  END IF;

  v_journal_id := gen_random_uuid();
  v_journal_number := 'JRN-COMM-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' ||
    LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

  INSERT INTO journal_entries (
    id, journal_number, journal_date, reference_type, reference_id,
    description, status, created_by
  ) VALUES (
    v_journal_id,
    v_journal_number,
    CURRENT_DATE,
    'PAYROLL',
    p_employee_id,
    'Pembayaran komisi kapster ' || v_employee_name || ' (' || v_count || ' transaksi)' ||
      CASE WHEN NULLIF(BTRIM(p_reference_number), '') IS NOT NULL
        THEN '. Ref: ' || BTRIM(p_reference_number) ELSE '' END ||
      CASE WHEN NULLIF(BTRIM(p_notes), '') IS NOT NULL
        THEN '. Catatan: ' || BTRIM(p_notes) ELSE '' END,
    'DRAFT',
    v_actor
  );

  INSERT INTO journal_lines (
    journal_entry_id, financial_account_id, outlet_id, debit, credit, description
  ) VALUES
    (v_journal_id, v_payable_id, p_outlet_id, v_total, 0.00,
      'Pelunasan hutang komisi kapster ' || v_employee_name),
    (v_journal_id, v_payout_account_id, p_outlet_id, 0.00, v_total,
      'Pengeluaran ' || p_payment_source || ' untuk pembayaran komisi ' || v_employee_name);

  PERFORM _internal_post_journal_entry(v_journal_id, v_actor);

  UPDATE public.commissions
  SET status = 'PAID', paid_at = CURRENT_TIMESTAMP
  WHERE employee_id = p_employee_id
    AND outlet_id = p_outlet_id
    AND status = 'EARNED';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gagal menyelesaikan settlement komisi';
  END IF;

  INSERT INTO audit_logs (
    user_id, action, entity_type, entity_id, before_state, after_state, reason, created_at
  ) VALUES (
    v_actor,
    'COMMISSION_PAYOUT',
    'commissions',
    p_employee_id,
    jsonb_build_object('status','EARNED','employee_id',p_employee_id,'outlet_id',p_outlet_id,
      'commission_count',v_count,'total_amount',v_total),
    jsonb_build_object('status','PAID','journal_id',v_journal_id,'journal_number',v_journal_number,
      'payment_source',p_payment_source,'reference_number',NULLIF(BTRIM(p_reference_number),''),
      'notes',NULLIF(BTRIM(p_notes),'')),
    'Settlement pembayaran komisi',
    CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'employee_id', p_employee_id,
    'employee_name', v_employee_name,
    'outlet_id', p_outlet_id,
    'commission_count', v_count,
    'total_amount', v_total,
    'payment_source', p_payment_source,
    'journal_id', v_journal_id,
    'journal_number', v_journal_number,
    'status', 'PAID'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_business_settings(p_id uuid DEFAULT NULL::uuid, p_business_name text DEFAULT NULL::text, p_legal_name text DEFAULT NULL::text, p_logo_url text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_currency text DEFAULT 'IDR'::text, p_timezone text DEFAULT 'Asia/Jakarta'::text, p_tax_enabled boolean DEFAULT false, p_tax_rate numeric DEFAULT 0, p_tax_inclusive boolean DEFAULT true, p_receipt_header text DEFAULT NULL::text, p_receipt_footer text DEFAULT NULL::text, p_booking_enabled boolean DEFAULT true, p_inventory_enabled boolean DEFAULT true, p_commission_enabled boolean DEFAULT true, p_finance_enabled boolean DEFAULT true)
 RETURNS business_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row public.business_settings%ROWTYPE;
BEGIN
  PERFORM _security_current_actor_profile(NULL);
  IF NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya Owner/Admin yang dapat mengubah pengaturan bisnis' USING ERRCODE='42501';
  END IF;
  IF NULLIF(BTRIM(p_business_name),'') IS NULL THEN
    RAISE EXCEPTION 'Nama bisnis wajib diisi' USING ERRCODE='22023';
  END IF;
  IF COALESCE(p_tax_rate,0) < 0 OR COALESCE(p_tax_rate,0) > 100 THEN
    RAISE EXCEPTION 'Tarif pajak harus berada antara 0 dan 100 persen' USING ERRCODE='22023';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_row FROM business_settings WHERE id=p_id FOR UPDATE;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pengaturan bisnis tidak ditemukan' USING ERRCODE='P0002'; END IF;
  ELSE
    SELECT * INTO v_row FROM business_settings ORDER BY created_at ASC LIMIT 1 FOR UPDATE;
  END IF;

  IF v_row.id IS NULL THEN
    INSERT INTO business_settings (
      business_name,legal_name,logo_url,address,phone,email,currency,timezone,
      tax_enabled,tax_rate,tax_inclusive,receipt_header,receipt_footer,
      booking_enabled,inventory_enabled,commission_enabled,finance_enabled,updated_at
    ) VALUES (
      BTRIM(p_business_name),NULLIF(BTRIM(p_legal_name),''),NULLIF(BTRIM(p_logo_url),''),NULLIF(BTRIM(p_address),''),
      NULLIF(BTRIM(p_phone),''),NULLIF(BTRIM(p_email),''),COALESCE(NULLIF(BTRIM(p_currency),''),'IDR'),
      COALESCE(NULLIF(BTRIM(p_timezone),''),'Asia/Jakarta'),COALESCE(p_tax_enabled,false),COALESCE(p_tax_rate,0),
      COALESCE(p_tax_inclusive,true),NULLIF(BTRIM(p_receipt_header),''),NULLIF(BTRIM(p_receipt_footer),''),
      COALESCE(p_booking_enabled,true),COALESCE(p_inventory_enabled,true),COALESCE(p_commission_enabled,true),COALESCE(p_finance_enabled,true),CURRENT_TIMESTAMP
    ) RETURNING * INTO v_row;
  ELSE
    UPDATE business_settings SET
      business_name=BTRIM(p_business_name),legal_name=NULLIF(BTRIM(p_legal_name),''),logo_url=NULLIF(BTRIM(p_logo_url),''),
      address=NULLIF(BTRIM(p_address),''),phone=NULLIF(BTRIM(p_phone),''),email=NULLIF(BTRIM(p_email),''),
      currency=COALESCE(NULLIF(BTRIM(p_currency),''),'IDR'),timezone=COALESCE(NULLIF(BTRIM(p_timezone),''),'Asia/Jakarta'),
      tax_enabled=COALESCE(p_tax_enabled,false),tax_rate=COALESCE(p_tax_rate,0),tax_inclusive=COALESCE(p_tax_inclusive,true),
      receipt_header=NULLIF(BTRIM(p_receipt_header),''),receipt_footer=NULLIF(BTRIM(p_receipt_footer),''),
      booking_enabled=COALESCE(p_booking_enabled,true),inventory_enabled=COALESCE(p_inventory_enabled,true),
      commission_enabled=COALESCE(p_commission_enabled,true),finance_enabled=COALESCE(p_finance_enabled,true),updated_at=CURRENT_TIMESTAMP
    WHERE id=v_row.id RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_custom_role(p_role_id uuid, p_code text, p_name text, p_description text, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role_id uuid;
  v_caller_profile_id uuid;
  v_existing_system boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT current_user_has_permission('user.manage', NULL) THEN
    RAISE EXCEPTION 'Tidak memiliki izin mengelola role' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_caller_profile_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

  IF p_name IS NULL OR length(trim(p_name)) < 2 OR length(trim(p_name)) > 80 THEN
    RAISE EXCEPTION 'Nama role harus 2-80 karakter';
  END IF;
  IF p_code IS NULL OR trim(p_code) !~ '^[A-Z][A-Z0-9_]{1,30}$' THEN
    RAISE EXCEPTION 'Kode role harus uppercase A-Z, angka, underscore, 2-31 karakter';
  END IF;

  IF p_role_id IS NOT NULL THEN
    SELECT is_system INTO v_existing_system FROM public.roles WHERE id = p_role_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Role tidak ditemukan';
    END IF;
    IF v_existing_system THEN
      RAISE EXCEPTION 'Role sistem tidak dapat diubah';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.roles WHERE code = upper(trim(p_code)) AND id <> COALESCE(p_role_id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
    RAISE EXCEPTION 'Kode role sudah digunakan';
  END IF;

  IF p_role_id IS NULL THEN
    INSERT INTO public.roles (code, name, description, is_system, is_active)
    VALUES (upper(trim(p_code)), trim(p_name), NULLIF(trim(p_description), ''), false, COALESCE(p_is_active, true))
    RETURNING id INTO v_role_id;
  ELSE
    UPDATE public.roles
    SET code = upper(trim(p_code)),
        name = trim(p_name),
        description = NULLIF(trim(p_description), ''),
        is_active = COALESCE(p_is_active, true),
        updated_at = now()
    WHERE id = p_role_id
    RETURNING id INTO v_role_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, before_state, after_state, reason)
  VALUES (
    v_caller_profile_id,
    CASE WHEN p_role_id IS NULL THEN 'CREATE' ELSE 'UPDATE' END,
    'ROLE',
    v_role_id,
    NULL,
    jsonb_build_object('role_id', v_role_id, 'code', upper(trim(p_code)), 'name', trim(p_name), 'is_system', false, 'is_active', COALESCE(p_is_active, true)),
    'Settings Phase 1B role management'
  );

  RETURN jsonb_build_object('success', true, 'role_id', v_role_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_employee(p_employee_id uuid DEFAULT NULL::uuid, p_employee_code text DEFAULT NULL::text, p_full_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_position text DEFAULT NULL::text, p_hire_date date DEFAULT NULL::date, p_termination_date date DEFAULT NULL::date, p_is_active boolean DEFAULT true)
 RETURNS employees
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row public.employees%ROWTYPE;
BEGIN
  IF NOT is_owner_or_admin() THEN RAISE EXCEPTION 'Akses ditolak: hanya Owner/Admin yang dapat mengelola staff' USING ERRCODE='42501'; END IF;
  IF NULLIF(BTRIM(p_employee_code),'') IS NULL OR NULLIF(BTRIM(p_full_name),'') IS NULL THEN RAISE EXCEPTION 'Kode staff dan nama staff wajib diisi' USING ERRCODE='22023'; END IF;
  IF p_employee_id IS NULL THEN
    INSERT INTO employees(employee_code,full_name,phone,email,position,hire_date,termination_date,is_active)
    VALUES(UPPER(BTRIM(p_employee_code)),BTRIM(p_full_name),NULLIF(BTRIM(p_phone),''),NULLIF(BTRIM(p_email),''),NULLIF(BTRIM(p_position),''),p_hire_date,p_termination_date,COALESCE(p_is_active,true))
    RETURNING * INTO v_row;
  ELSE
    UPDATE employees SET employee_code=UPPER(BTRIM(p_employee_code)),full_name=BTRIM(p_full_name),phone=NULLIF(BTRIM(p_phone),''),email=NULLIF(BTRIM(p_email),''),position=NULLIF(BTRIM(p_position),''),hire_date=p_hire_date,termination_date=p_termination_date,is_active=COALESCE(p_is_active,true),updated_at=CURRENT_TIMESTAMP
    WHERE id=p_employee_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Staff tidak ditemukan' USING ERRCODE='P0002'; END IF;
  END IF;
  RETURN v_row;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Kode staff sudah digunakan' USING ERRCODE='23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_outlet(p_outlet_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_timezone text DEFAULT 'Asia/Jakarta'::text, p_is_active boolean DEFAULT true)
 RETURNS outlets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row public.outlets%ROWTYPE;
BEGIN
  IF NOT is_owner_or_admin() THEN RAISE EXCEPTION 'Akses ditolak: hanya Owner/Admin yang dapat mengelola outlet' USING ERRCODE='42501'; END IF;
  IF NULLIF(BTRIM(p_code),'') IS NULL OR NULLIF(BTRIM(p_name),'') IS NULL THEN RAISE EXCEPTION 'Kode dan nama outlet wajib diisi' USING ERRCODE='22023'; END IF;
  IF p_outlet_id IS NULL THEN
    INSERT INTO outlets(code,name,address,phone,email,timezone,is_active)
    VALUES(UPPER(BTRIM(p_code)),BTRIM(p_name),NULLIF(BTRIM(p_address),''),NULLIF(BTRIM(p_phone),''),NULLIF(BTRIM(p_email),''),COALESCE(NULLIF(BTRIM(p_timezone),''),'Asia/Jakarta'),COALESCE(p_is_active,true))
    RETURNING * INTO v_row;
  ELSE
    UPDATE outlets SET code=UPPER(BTRIM(p_code)),name=BTRIM(p_name),address=NULLIF(BTRIM(p_address),''),phone=NULLIF(BTRIM(p_phone),''),email=NULLIF(BTRIM(p_email),''),timezone=COALESCE(NULLIF(BTRIM(p_timezone),''),'Asia/Jakarta'),is_active=COALESCE(p_is_active,true),updated_at=CURRENT_TIMESTAMP
    WHERE id=p_outlet_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Outlet tidak ditemukan' USING ERRCODE='P0002'; END IF;
  END IF;
  RETURN v_row;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Kode outlet sudah digunakan' USING ERRCODE='23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_payment_method(p_payment_method_id uuid, p_code text, p_name text, p_type text, p_financial_account_id uuid, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid := p_payment_method_id;
BEGIN
  IF auth.uid() IS NULL OR NOT is_owner_or_admin() THEN RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat mengelola metode pembayaran' USING ERRCODE='42501'; END IF;
  IF nullif(trim(p_code),'') IS NULL OR nullif(trim(p_name),'') IS NULL OR nullif(trim(p_type),'') IS NULL THEN RAISE EXCEPTION 'Kode, nama, dan tipe metode pembayaran wajib diisi'; END IF;
  IF p_financial_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM financial_accounts WHERE id=p_financial_account_id) THEN RAISE EXCEPTION 'Akun keuangan tidak ditemukan'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO payment_methods(code,name,type,financial_account_id,is_active) VALUES(upper(trim(p_code)),trim(p_name),upper(trim(p_type)),p_financial_account_id,COALESCE(p_is_active,true)) RETURNING id INTO v_id;
  ELSE
    UPDATE payment_methods SET code=upper(trim(p_code)),name=trim(p_name),type=upper(trim(p_type)),financial_account_id=p_financial_account_id,is_active=COALESCE(p_is_active,true) WHERE id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Metode pembayaran tidak ditemukan'; END IF;
  END IF;
  RETURN jsonb_build_object('success',true,'payment_method_id',v_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.save_product(p_product_id uuid, p_category_id uuid, p_sku text, p_barcode text, p_name text, p_description text, p_base_unit text, p_default_cost_price numeric, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid := p_product_id;
BEGIN
  IF auth.uid() IS NULL OR NOT is_owner_or_admin() THEN RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat mengelola produk' USING ERRCODE='42501'; END IF;
  IF p_category_id IS NULL OR NOT EXISTS (SELECT 1 FROM product_categories WHERE id=p_category_id) THEN RAISE EXCEPTION 'Kategori produk tidak valid'; END IF;
  IF nullif(trim(p_sku),'') IS NULL OR nullif(trim(p_name),'') IS NULL OR nullif(trim(p_base_unit),'') IS NULL THEN RAISE EXCEPTION 'SKU, nama produk, dan unit dasar wajib diisi'; END IF;
  IF p_default_cost_price IS NOT NULL AND p_default_cost_price < 0 THEN RAISE EXCEPTION 'Harga modal produk tidak boleh negatif'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO products(category_id,sku,barcode,name,description,base_unit,default_cost_price,is_active) VALUES(p_category_id,upper(trim(p_sku)),nullif(trim(p_barcode),''),trim(p_name),nullif(trim(p_description),''),trim(p_base_unit),p_default_cost_price,COALESCE(p_is_active,true)) RETURNING id INTO v_id;
  ELSE
    UPDATE products SET category_id=p_category_id,sku=upper(trim(p_sku)),barcode=nullif(trim(p_barcode),''),name=trim(p_name),description=nullif(trim(p_description),''),base_unit=trim(p_base_unit),default_cost_price=p_default_cost_price,is_active=COALESCE(p_is_active,true),updated_at=now() WHERE id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;
  END IF;
  RETURN jsonb_build_object('success',true,'product_id',v_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.save_product_category(p_category_id uuid, p_name text, p_description text, p_sort_order integer, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid := p_category_id;
  v_name text := trim(p_name);
BEGIN
  IF auth.uid() IS NULL OR NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat mengelola kategori produk' USING ERRCODE='42501';
  END IF;

  IF nullif(v_name,'') IS NULL THEN
    RAISE EXCEPTION 'Nama kategori produk wajib diisi';
  END IF;

  IF p_sort_order IS NULL OR p_sort_order < 0 THEN
    RAISE EXCEPTION 'Urutan kategori produk tidak valid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_categories pc
    WHERE lower(btrim(pc.name)) = lower(v_name)
      AND (v_id IS NULL OR pc.id <> v_id)
  ) THEN
    RAISE EXCEPTION 'Kategori produk dengan nama tersebut sudah ada' USING ERRCODE='23505';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.product_categories(name,description,sort_order,is_active)
    VALUES(v_name,nullif(trim(p_description),''),p_sort_order,COALESCE(p_is_active,true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.product_categories
    SET name=v_name,
        description=nullif(trim(p_description),''),
        sort_order=p_sort_order,
        is_active=COALESCE(p_is_active,true),
        updated_at=now()
    WHERE id=v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kategori produk tidak ditemukan';
    END IF;
  END IF;

  RETURN jsonb_build_object('success',true,'category_id',v_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Kategori produk dengan nama tersebut sudah ada' USING ERRCODE='23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_role_permissions(p_role_id uuid, p_permission_codes text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_profile_id uuid;
  v_is_system boolean;
  v_before jsonb;
  v_after jsonb;
  v_unknown integer;
BEGIN
  IF auth.uid() IS NULL OR NOT current_user_has_permission('user.manage', NULL) THEN
    RAISE EXCEPTION 'Tidak memiliki izin mengelola permission role' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_caller_profile_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  SELECT is_system INTO v_is_system FROM public.roles WHERE id = p_role_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role tidak ditemukan';
  END IF;
  IF v_is_system THEN
    RAISE EXCEPTION 'Permission role sistem tidak dapat diubah dari Settings';
  END IF;

  SELECT jsonb_agg(perm.code ORDER BY perm.code)
    INTO v_before
  FROM public.role_permissions rp
  JOIN public.permissions perm ON perm.id = rp.permission_id
  WHERE rp.role_id = p_role_id;

  SELECT count(*) INTO v_unknown
  FROM unnest(COALESCE(p_permission_codes, ARRAY[]::text[])) c(code)
  WHERE NOT EXISTS (SELECT 1 FROM public.permissions perm WHERE perm.code = c.code);
  IF v_unknown > 0 THEN
    RAISE EXCEPTION 'Terdapat permission code yang tidak dikenal';
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = p_role_id;

  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT p_role_id, perm.id
  FROM public.permissions perm
  WHERE perm.code = ANY(COALESCE(p_permission_codes, ARRAY[]::text[]));

  SELECT jsonb_agg(perm.code ORDER BY perm.code)
    INTO v_after
  FROM public.role_permissions rp
  JOIN public.permissions perm ON perm.id = rp.permission_id
  WHERE rp.role_id = p_role_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, before_state, after_state, reason)
  VALUES (
    v_caller_profile_id,
    'UPDATE',
    'ROLE_PERMISSIONS',
    p_role_id,
    jsonb_build_object('permission_codes', COALESCE(v_before, '[]'::jsonb)),
    jsonb_build_object('permission_codes', COALESCE(v_after, '[]'::jsonb)),
    'Settings Phase 1B permission management'
  );

  RETURN jsonb_build_object('success', true, 'role_id', p_role_id, 'permission_codes', COALESCE(v_after, '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_service(p_service_id uuid, p_category_id uuid, p_code text, p_name text, p_description text, p_duration_minutes integer, p_default_cost_price numeric, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid := p_service_id;
BEGIN
  IF auth.uid() IS NULL OR NOT is_owner_or_admin() THEN RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat mengelola layanan' USING ERRCODE='42501'; END IF;
  IF p_category_id IS NULL OR NOT EXISTS (SELECT 1 FROM service_categories WHERE id=p_category_id) THEN RAISE EXCEPTION 'Kategori layanan tidak valid'; END IF;
  IF nullif(trim(p_code),'') IS NULL OR nullif(trim(p_name),'') IS NULL THEN RAISE EXCEPTION 'Kode dan nama layanan wajib diisi'; END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes <= 0 THEN RAISE EXCEPTION 'Durasi layanan harus lebih dari 0 menit'; END IF;
  IF p_default_cost_price IS NOT NULL AND p_default_cost_price < 0 THEN RAISE EXCEPTION 'Harga modal layanan tidak boleh negatif'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO services(category_id,code,name,description,duration_minutes,default_cost_price,is_active) VALUES(p_category_id,upper(trim(p_code)),trim(p_name),nullif(trim(p_description),''),p_duration_minutes,p_default_cost_price,COALESCE(p_is_active,true)) RETURNING id INTO v_id;
  ELSE
    UPDATE services SET category_id=p_category_id,code=upper(trim(p_code)),name=trim(p_name),description=nullif(trim(p_description),''),duration_minutes=p_duration_minutes,default_cost_price=p_default_cost_price,is_active=COALESCE(p_is_active,true),updated_at=now() WHERE id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Layanan tidak ditemukan'; END IF;
  END IF;
  RETURN jsonb_build_object('success',true,'service_id',v_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.save_service_category(p_category_id uuid, p_name text, p_description text, p_sort_order integer, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid := p_category_id;
  v_name text := trim(p_name);
BEGIN
  IF auth.uid() IS NULL OR NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang dapat mengelola kategori layanan' USING ERRCODE='42501';
  END IF;

  IF nullif(v_name,'') IS NULL THEN
    RAISE EXCEPTION 'Nama kategori layanan wajib diisi';
  END IF;

  IF p_sort_order IS NULL OR p_sort_order < 0 THEN
    RAISE EXCEPTION 'Urutan kategori layanan tidak valid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.service_categories sc
    WHERE lower(btrim(sc.name)) = lower(v_name)
      AND (v_id IS NULL OR sc.id <> v_id)
  ) THEN
    RAISE EXCEPTION 'Kategori layanan dengan nama tersebut sudah ada' USING ERRCODE='23505';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.service_categories(name,description,sort_order,is_active)
    VALUES(v_name,nullif(trim(p_description),''),p_sort_order,COALESCE(p_is_active,true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.service_categories
    SET name=v_name,
        description=nullif(trim(p_description),''),
        sort_order=p_sort_order,
        is_active=COALESCE(p_is_active,true),
        updated_at=now()
    WHERE id=v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kategori layanan tidak ditemukan';
    END IF;
  END IF;

  RETURN jsonb_build_object('success',true,'category_id',v_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Kategori layanan dengan nama tersebut sudah ada' USING ERRCODE='23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_user_role(p_profile_id uuid, p_role_id uuid, p_outlet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_profile_id uuid;
  v_caller_role text;
  v_target_active boolean;
  v_target_role text;
  v_new_role text;
  v_role_system boolean;
  v_before jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT current_user_has_permission('user.manage', NULL) THEN
    RAISE EXCEPTION 'Tidak memiliki izin mengelola role pengguna' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_caller_profile_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  SELECT COALESCE(r.code, 'NONE') INTO v_caller_role
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_caller_profile_id LIMIT 1;

  SELECT p.is_active INTO v_target_active FROM public.profiles p WHERE p.id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile target tidak ditemukan'; END IF;

  SELECT r.code, r.is_system INTO v_new_role, v_role_system
  FROM public.roles r WHERE r.id = p_role_id AND r.is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Role tujuan tidak ditemukan atau tidak aktif'; END IF;

  SELECT r.code INTO v_target_role
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = p_profile_id LIMIT 1;

  IF p_profile_id = v_caller_profile_id THEN
    RAISE EXCEPTION 'Tidak dapat mengubah role akun sendiri dari Settings';
  END IF;

  IF v_target_role = 'OWNER' AND v_caller_role <> 'OWNER' THEN
    RAISE EXCEPTION 'Akun OWNER hanya dapat dikelola oleh OWNER';
  END IF;
  IF v_new_role = 'OWNER' AND v_caller_role <> 'OWNER' THEN
    RAISE EXCEPTION 'Hanya OWNER yang dapat menetapkan role OWNER';
  END IF;
  IF v_new_role = 'ADMIN' AND v_caller_role <> 'OWNER' THEN
    RAISE EXCEPTION 'Hanya OWNER yang dapat menetapkan role ADMIN';
  END IF;
  IF v_new_role = 'OWNER' AND p_outlet_id IS NOT NULL THEN
    RAISE EXCEPTION 'Role OWNER bersifat global dan tidak memakai outlet';
  END IF;
  IF v_new_role = 'ADMIN' AND p_outlet_id IS NOT NULL THEN
    RAISE EXCEPTION 'Role ADMIN bersifat global dan tidak memakai outlet';
  END IF;
  IF v_new_role NOT IN ('OWNER', 'ADMIN', 'ACCOUNTING') AND p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'Role operasional wajib memiliki outlet';
  END IF;
  IF p_outlet_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.outlets WHERE id = p_outlet_id AND is_active = true) THEN
    RAISE EXCEPTION 'Outlet tujuan tidak ditemukan atau tidak aktif';
  END IF;
  IF NOT COALESCE(v_target_active, false) THEN
    RAISE EXCEPTION 'Akun target tidak aktif';
  END IF;

  SELECT jsonb_build_object('role_id', ur.role_id, 'role_code', r.code, 'outlet_id', ur.outlet_id)
    INTO v_before
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = p_profile_id LIMIT 1;

  DELETE FROM public.user_roles WHERE user_id = p_profile_id;
  INSERT INTO public.user_roles (user_id, role_id, outlet_id, created_by)
  VALUES (p_profile_id, p_role_id, p_outlet_id, v_caller_profile_id);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, before_state, after_state, reason)
  VALUES (
    v_caller_profile_id,
    'UPDATE',
    'USER_ROLE',
    p_profile_id,
    v_before,
    jsonb_build_object('role_id', p_role_id, 'role_code', v_new_role, 'outlet_id', p_outlet_id),
    'Settings Phase 1B user role assignment'
  );

  RETURN jsonb_build_object('success', true, 'profile_id', p_profile_id, 'role_id', p_role_id, 'role_code', v_new_role, 'outlet_id', p_outlet_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_employee_outlet(p_employee_id uuid, p_outlet_id uuid, p_is_primary boolean DEFAULT false, p_is_active boolean DEFAULT true)
 RETURNS employee_outlets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row public.employee_outlets%ROWTYPE;
BEGIN
  IF NOT is_owner_or_admin() THEN RAISE EXCEPTION 'Akses ditolak: hanya Owner/Admin yang dapat menugaskan staff ke outlet' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM employees WHERE id=p_employee_id) THEN RAISE EXCEPTION 'Staff tidak ditemukan' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM outlets WHERE id=p_outlet_id) THEN RAISE EXCEPTION 'Outlet tidak ditemukan' USING ERRCODE='P0002'; END IF;
  IF p_is_primary THEN UPDATE employee_outlets SET is_primary=false WHERE employee_id=p_employee_id AND is_primary=true; END IF;
  INSERT INTO employee_outlets(employee_id,outlet_id,is_primary,is_active)
  VALUES(p_employee_id,p_outlet_id,COALESCE(p_is_primary,false),COALESCE(p_is_active,true))
  ON CONFLICT (employee_id,outlet_id) DO UPDATE SET is_primary=EXCLUDED.is_primary,is_active=EXCLUDED.is_active
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_active(p_profile_id uuid, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_profile_id uuid;
  v_caller_role text;
  v_target_role text;
  v_before boolean;
  v_owner_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT current_user_has_permission('user.manage', NULL) THEN
    RAISE EXCEPTION 'Tidak memiliki izin mengubah status pengguna' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_caller_profile_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  SELECT COALESCE(r.code, 'NONE') INTO v_caller_role
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_caller_profile_id LIMIT 1;

  IF p_profile_id = v_caller_profile_id THEN
    RAISE EXCEPTION 'Tidak dapat menonaktifkan akun sendiri';
  END IF;

  SELECT p.is_active INTO v_before FROM public.profiles p WHERE p.id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile target tidak ditemukan'; END IF;
  SELECT r.code INTO v_target_role
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = p_profile_id LIMIT 1;

  IF v_target_role = 'OWNER' AND v_caller_role <> 'OWNER' THEN
    RAISE EXCEPTION 'Akun OWNER hanya dapat dikelola oleh OWNER';
  END IF;

  IF v_target_role = 'OWNER' AND p_is_active = false THEN
    SELECT count(*) INTO v_owner_count
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE r.code = 'OWNER' AND p.is_active = true;
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'Tidak dapat menonaktifkan satu-satunya akun OWNER aktif';
    END IF;
  END IF;

  UPDATE public.profiles
  SET is_active = p_is_active, updated_at = now()
  WHERE id = p_profile_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, before_state, after_state, reason)
  VALUES (
    v_caller_profile_id,
    'UPDATE',
    'USER_STATUS',
    p_profile_id,
    jsonb_build_object('is_active', v_before),
    jsonb_build_object('is_active', p_is_active),
    'Settings Phase 1B account status change'
  );

  RETURN jsonb_build_object('success', true, 'profile_id', p_profile_id, 'is_active', p_is_active);
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_appointment_status(p_appointment_id uuid, p_outlet_id uuid, p_target_status appointment_status_enum, p_expected_current_status appointment_status_enum)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_appointment public.appointments%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.current_user_has_outlet_access(p_outlet_id) then
    raise exception 'Access denied for outlet %', p_outlet_id using errcode = '42501';
  end if;
  select * into v_appointment
  from public.appointments
  where id = p_appointment_id and outlet_id = p_outlet_id
  for update;
  if not found then
    raise exception 'Appointment % was not found in outlet %', p_appointment_id, p_outlet_id using errcode = 'P0002';
  end if;
  if v_appointment.status <> p_expected_current_status then
    raise exception 'Appointment status changed by another operator (current: %)', v_appointment.status using errcode = 'P0003';
  end if;
  if v_appointment.status = 'PENDING' then
    if p_target_status not in ('CONFIRMED','CANCELLED','NO_SHOW') then
      raise exception 'Invalid appointment transition from PENDING to %', p_target_status using errcode = 'P0004';
    end if;
  elsif v_appointment.status = 'CONFIRMED' then
    if p_target_status not in ('CANCELLED','NO_SHOW') then
      raise exception 'Invalid appointment transition from CONFIRMED to %', p_target_status using errcode = 'P0004';
    end if;
  elsif v_appointment.status in ('ARRIVED','IN_SERVICE','COMPLETED','CANCELLED','NO_SHOW') then
    raise exception 'Appointment is already in a managed or terminal state and must not be changed directly' using errcode = 'P0004';
  else
    raise exception 'Unsupported appointment status %', v_appointment.status using errcode = 'P0004';
  end if;
  if p_target_status in ('CANCELLED','NO_SHOW') and exists (
    select 1 from public.queues q
    where q.appointment_id = v_appointment.id and q.status in ('WAITING','CALLED','IN_SERVICE')
  ) then
    raise exception 'Appointment has an active queue and must be managed through queue transitions' using errcode = 'P0004';
  end if;
  update public.appointments
  set status = p_target_status, updated_at = v_now
  where id = v_appointment.id and outlet_id = p_outlet_id;
  if not found then
    raise exception 'Appointment status update failed' using errcode = '23514';
  end if;
  return jsonb_build_object('success',true,'appointment_id',v_appointment.id,'outlet_id',p_outlet_id,'status',p_target_status,'updated_at',v_now);
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_customer_profile(p_customer_id uuid, p_full_name text, p_phone text, p_email text DEFAULT NULL::text, p_gender text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date, p_tier_id uuid DEFAULT NULL::uuid, p_preferred_barber_id uuid DEFAULT NULL::uuid, p_haircut_preferences jsonb DEFAULT NULL::jsonb, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profile_id UUID;
  v_outlet_id UUID;
  v_can_manage BOOLEAN := FALSE;
  v_old RECORD;
  v_updated RECORD;
BEGIN
  v_profile_id := _security_current_actor_profile(NULL);

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profil pengguna aktif tidak ditemukan' USING ERRCODE = '42501';
  END IF;

  SELECT ur.outlet_id
  INTO v_outlet_id
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_profile_id
    AND r.is_active = TRUE
  ORDER BY (ur.outlet_id IS NULL) DESC
  LIMIT 1;

  v_can_manage :=
    is_owner_or_admin()
    OR current_user_has_permission('booking.manage', v_outlet_id)
    OR current_user_has_permission('pos.sale.create', v_outlet_id);

  IF NOT v_can_manage THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk mengubah data pelanggan' USING ERRCODE = '42501';
  END IF;

  SELECT id, tier_id, current_loyalty_points, lifetime_loyalty_points
  INTO v_old
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pelanggan % tidak ditemukan', p_customer_id USING ERRCODE = '22023';
  END IF;

  IF p_full_name IS NULL OR btrim(p_full_name) = '' THEN
    RAISE EXCEPTION 'Nama pelanggan wajib diisi' USING ERRCODE = '22023';
  END IF;

  IF p_phone IS NULL OR regexp_replace(p_phone, '[^0-9]', '', 'g') = '' THEN
    RAISE EXCEPTION 'Nomor telepon pelanggan wajib diisi' USING ERRCODE = '22023';
  END IF;

  UPDATE public.customers
  SET
    full_name = btrim(p_full_name),
    phone = btrim(p_phone),
    email = NULLIF(btrim(COALESCE(p_email, '')), ''),
    gender = NULLIF(btrim(COALESCE(p_gender, '')), ''),
    date_of_birth = p_date_of_birth,
    tier_id = CASE WHEN is_owner_or_admin() AND p_tier_id IS NOT NULL THEN p_tier_id ELSE tier_id END,
    preferred_barber_id = p_preferred_barber_id,
    haircut_preferences = p_haircut_preferences,
    notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_customer_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object(
    'success', TRUE,
    'customer_id', v_updated.id,
    'tier_id', v_updated.tier_id,
    'current_loyalty_points', v_updated.current_loyalty_points,
    'lifetime_loyalty_points', v_updated.lifetime_loyalty_points
  );
END;
$function$;

-- New SECURITY DEFINER functions must not inherit PostgreSQL's PUBLIC execute default.
DO $revoke$
DECLARE fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY['close_cash_session', 'close_financial_period', 'link_queue_to_sale', 'list_settings_users', 'open_cash_session', 'process_commission_payout', 'save_business_settings', 'save_custom_role', 'save_employee', 'save_outlet', 'save_payment_method', 'save_product', 'save_product_category', 'save_role_permissions', 'save_service', 'save_service_category', 'save_user_role', 'set_employee_outlet', 'set_user_active', 'transition_appointment_status', 'update_customer_profile'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $revoke$;
