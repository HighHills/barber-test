-- 20260904000019_operational_expenses_and_petty_cash.sql
-- Module: Operational Expenses, Petty Cash Ledger, and Double-Entry General Ledger Integration

-- ============================================================================
-- 1. EXTEND CHART OF ACCOUNTS (ADD 5800 & 5900 IF NOT PRESENT)
-- ============================================================================
INSERT INTO financial_accounts (account_code, account_name, account_type, normal_balance, is_system, is_active)
VALUES
  ('5800', 'Supplies & Consumables Expense', 'EXPENSE', 'DEBIT', true, true),
  ('5900', 'Maintenance & General Ops Expense', 'EXPENSE', 'DEBIT', true, true)
ON CONFLICT (account_code) DO UPDATE
SET
  account_name = EXCLUDED.account_name,
  is_active = TRUE;


-- ============================================================================
-- 2. TABLE: EXPENSE_CATEGORIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  financial_account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  icon VARCHAR(50) DEFAULT 'Receipt',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_code ON expense_categories(code);

-- Seed Default Expense Categories Linked to Correct COA
DO $$
DECLARE
  v_util_id UUID;
  v_rent_id UUID;
  v_supplies_id UUID;
  v_maint_id UUID;
BEGIN
  SELECT id INTO v_util_id FROM financial_accounts WHERE account_code = '5300' LIMIT 1;
  SELECT id INTO v_rent_id FROM financial_accounts WHERE account_code = '5200' LIMIT 1;
  SELECT id INTO v_supplies_id FROM financial_accounts WHERE account_code = '5800' LIMIT 1;
  SELECT id INTO v_maint_id FROM financial_accounts WHERE account_code = '5900' LIMIT 1;

  -- Fallbacks if not resolved
  IF v_util_id IS NULL THEN v_util_id := (SELECT id FROM financial_accounts WHERE account_type = 'EXPENSE' LIMIT 1); END IF;
  IF v_rent_id IS NULL THEN v_rent_id := v_util_id; END IF;
  IF v_supplies_id IS NULL THEN v_supplies_id := v_util_id; END IF;
  IF v_maint_id IS NULL THEN v_maint_id := v_util_id; END IF;

  INSERT INTO expense_categories (code, name, description, financial_account_id, icon, is_active)
  VALUES
    ('UTIL', 'Listrik, Air & Internet', 'Tagihan rutin PLN, PDAM, dan koneksi internet WiFi toko', v_util_id, 'Zap', true),
    ('RENT', 'Sewa Tempat & Gedung', 'Biaya sewa ruko, sewa tempat, atau iuran pengelola gedung', v_rent_id, 'Building2', true),
    ('SUPPLIES', 'Perlengkapan & Bahan Toko', 'Pembelian silet sekali pakai, tisu leher, sabun cuci handuk, bedak, disinfectant', v_supplies_id, 'Scissors', true),
    ('MAINT', 'Pemeliharaan & Perbaikan Toko', 'Servis mesin cukur (clipper), perbaikan AC, lampu, kursi barber, dan fasilitas toko', v_maint_id, 'Wrench', true),
    ('MEALS', 'Konsumsi Karyawan & Tamu', 'Air mineral, kopi, teh untuk tamu serta makan/snack kapster dan staf', v_maint_id, 'Coffee', true),
    ('MARKETING', 'Pemasaran & Promosi Toko', 'Cetak brosur, spanduk, iklan media sosial, dan materi promosi', v_maint_id, 'Megaphone', true),
    ('OTHER', 'Biaya Operasional Lain-lain', 'Pengeluaran kas kecil atau keperluan tak terduga lainnya', v_maint_id, 'MoreHorizontal', true)
  ON CONFLICT (code) DO UPDATE
  SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    financial_account_id = EXCLUDED.financial_account_id,
    icon = EXCLUDED.icon,
    is_active = TRUE;
END $$;


-- ============================================================================
-- 3. TABLE: EXPENSES
-- ============================================================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number VARCHAR(50) NOT NULL UNIQUE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  financial_account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  payment_account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recipient VARCHAR(255),
  notes TEXT,
  reference_number VARCHAR(100),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenses_outlet ON expenses(outlet_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);


-- ============================================================================
-- 4. RPC: RECORD OPERATIONAL EXPENSE WITH LEVEL 2 DOUBLE-ENTRY JOURNAL
-- ============================================================================
CREATE OR REPLACE FUNCTION record_expense(
  p_outlet_id UUID,
  p_category_id UUID,
  p_payment_account_id UUID,
  p_amount NUMERIC,
  p_expense_date DATE DEFAULT CURRENT_DATE,
  p_recipient TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_reference_number TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_expense_id UUID := gen_random_uuid();
  v_expense_number VARCHAR(50);
  v_fin_acc_id UUID;
  v_cat_name VARCHAR(150) := 'Biaya Operasional';
  v_pay_acc_name VARCHAR(150) := 'Kas/Bank';
  v_journal_id UUID;
  v_journal_number VARCHAR(50);
  v_res JSONB;
BEGIN
  -- 1. Resolve Profile ID
  IF p_created_by IS NOT NULL THEN
    v_user_id := p_created_by;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_user_id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM profiles ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- 2. Security Guard: Owner, Admin, Manager, Accounting, Cashier (Petty Cash), or dev anon
  IF NOT (
    is_owner_or_admin() 
    OR current_user_has_permission('finance.post')
    OR (v_user_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = v_user_id
           AND r.code IN ('OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTING', 'CASHIER')
           AND r.is_active = TRUE
       ))
    OR (auth.uid() IS NULL AND v_user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki izin untuk mencatat biaya operasional';
  END IF;

  -- 3. Input Validations
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal pengeluaran harus lebih besar dari Rp 0';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM outlets WHERE id = p_outlet_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Cabang outlet tidak valid atau tidak aktif';
  END IF;

  -- Resolve category & expense account
  SELECT name, financial_account_id INTO v_cat_name, v_fin_acc_id
  FROM expense_categories
  WHERE id = p_category_id;

  IF v_fin_acc_id IS NULL THEN
    SELECT id INTO v_fin_acc_id FROM financial_accounts WHERE account_code = '5900' LIMIT 1;
  END IF;

  IF v_fin_acc_id IS NULL THEN
    SELECT id INTO v_fin_acc_id FROM financial_accounts WHERE account_type = 'EXPENSE' LIMIT 1;
  END IF;

  -- Resolve payment account name
  SELECT account_name INTO v_pay_acc_name
  FROM financial_accounts
  WHERE id = p_payment_account_id;

  IF v_pay_acc_name IS NULL THEN
    v_pay_acc_name := 'Kas/Bank';
  END IF;

  -- 4. Generate Expense Number: EXP-YYYYMMDD-XXXXXX
  v_expense_number := 'EXP-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

  -- 5. Insert into expenses
  INSERT INTO expenses (
    id, expense_number, outlet_id, category_id, financial_account_id, payment_account_id,
    amount, expense_date, recipient, notes, reference_number, created_by, created_at, updated_at
  ) VALUES (
    v_expense_id, v_expense_number, p_outlet_id, p_category_id, v_fin_acc_id, p_payment_account_id,
    p_amount, COALESCE(p_expense_date, CURRENT_DATE), TRIM(p_recipient), TRIM(p_notes),
    TRIM(p_reference_number), v_user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  -- 6. Post Level 2 Double-Entry Accounting Journal
  --    [DEBIT]  Beban Operasional Terkait (5200/5300/5800/5900)
  --    [KREDIT] Kas Toko (1000) atau Bank (1100)
  v_journal_id := gen_random_uuid();
  v_journal_number := 'JRN-EXP-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

  INSERT INTO journal_entries (
    id, journal_number, journal_date, reference_type, reference_id,
    description, status, created_by
  ) VALUES (
    v_journal_id, v_journal_number, COALESCE(p_expense_date, CURRENT_DATE), 'EXPENSE', v_expense_id,
    v_cat_name || ' (' || COALESCE(NULLIF(TRIM(p_recipient), ''), 'Operasional Toko') || ') - Ref: ' || COALESCE(NULLIF(TRIM(p_reference_number), ''), 'Nota Fisik'),
    'DRAFT', v_user_id
  );

  -- Line 1: Debit Expense Account
  INSERT INTO journal_lines (
    journal_entry_id, financial_account_id, outlet_id, debit, credit, description
  ) VALUES (
    v_journal_id, v_fin_acc_id, p_outlet_id, p_amount, 0.00,
    'Beban: ' || v_cat_name || COALESCE(' - ' || NULLIF(TRIM(p_notes), ''), '')
  );

  -- Line 2: Credit Cash/Bank Asset Account
  INSERT INTO journal_lines (
    journal_entry_id, financial_account_id, outlet_id, debit, credit, description
  ) VALUES (
    v_journal_id, p_payment_account_id, p_outlet_id, 0.00, p_amount,
    'Pengeluaran kas/bank untuk: ' || v_cat_name
  );

  -- Central Gate: Enforce Double-Entry Invariant and post
  PERFORM _internal_post_journal_entry(v_journal_id, v_user_id);

  SELECT json_build_object(
    'success', true,
    'expense_id', v_expense_id,
    'expense_number', v_expense_number,
    'journal_number', v_journal_number,
    'amount', p_amount,
    'category', v_cat_name,
    'message', 'Biaya operasional berhasil dicatat dan jurnal akuntansi telah diposting.'
  )::JSONB INTO v_res;

  RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_expense(UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_expense(UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID) TO authenticated, anon;


-- ============================================================================
-- 5. RPC: VOID / CANCEL OPERATIONAL EXPENSE
-- ============================================================================
CREATE OR REPLACE FUNCTION void_expense(
  p_expense_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_voided_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_exp expenses%ROWTYPE;
  v_rev_journal_id UUID := gen_random_uuid();
  v_rev_journal_num VARCHAR(50);
  v_orig_journal RECORD;
  v_res JSONB;
BEGIN
  IF p_voided_by IS NOT NULL THEN
    v_user_id := p_voided_by;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_user_id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM profiles ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF NOT (
    is_owner_or_admin() 
    OR (auth.uid() IS NULL AND v_user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Owner atau Admin yang dapat membatalkan biaya operasional';
  END IF;

  SELECT * INTO v_exp FROM expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data pengeluaran biaya tidak ditemukan';
  END IF;

  -- Reverse posted journal
  SELECT * INTO v_orig_journal
  FROM journal_entries
  WHERE reference_type = 'EXPENSE' AND reference_id = p_expense_id AND status = 'POSTED'
  LIMIT 1;

  IF FOUND THEN
    v_rev_journal_num := 'JRN-REV-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

    INSERT INTO journal_entries (
      id, journal_number, journal_date, reference_type, reference_id,
      description, status, created_by, reversed_journal_id
    ) VALUES (
      v_rev_journal_id, v_rev_journal_num, CURRENT_DATE, 'EXPENSE', p_expense_id,
      'Pembalikan pengeluaran ' || v_exp.expense_number || ': ' || COALESCE(p_reason, 'Pembatalan transaksi'),
      'DRAFT', v_user_id, v_orig_journal.id
    );

    -- Reverse Line 1: Credit Expense Account
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_rev_journal_id, v_exp.financial_account_id, v_exp.outlet_id, 0.00, v_exp.amount,
      'Pembalikan beban operasional ' || v_exp.expense_number
    );

    -- Reverse Line 2: Debit Cash/Bank Account (Restore money)
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_rev_journal_id, v_exp.payment_account_id, v_exp.outlet_id, v_exp.amount, 0.00,
      'Pengembalian kas/bank dari pembalikan ' || v_exp.expense_number
    );

    PERFORM _internal_post_journal_entry(v_rev_journal_id, v_user_id);

    -- Update original journal status to REVERSED
    UPDATE journal_entries
    SET status = 'REVERSED'
    WHERE id = v_orig_journal.id;
  END IF;

  -- Delete expense record
  DELETE FROM expenses WHERE id = p_expense_id;

  SELECT json_build_object(
    'success', true,
    'expense_id', p_expense_id,
    'reversal_journal_number', v_rev_journal_num,
    'message', 'Biaya operasional berhasil dibatalkan dan jurnal pembalikan telah diposting.'
  )::JSONB INTO v_res;

  RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION void_expense(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_expense(UUID, TEXT, UUID) TO authenticated, anon;


-- ============================================================================
-- 6. PERMISSIONS & GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_categories TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON expenses TO authenticated, anon;
