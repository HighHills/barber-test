-- supabase/verify_operational_expenses.sql
-- Verification Script: Operational Expenses, Petty Cash, and Double-Entry Journal Audit

-- 1. Tampilkan Kategori Biaya Operasional yang Tersedia
SELECT
  ec.code AS "Kode",
  ec.name AS "Kategori Biaya",
  fa.account_code AS "Kode COA",
  fa.account_name AS "Nama Akun Beban",
  ec.icon AS "Ikon",
  ec.is_active AS "Status Aktif"
FROM expense_categories ec
JOIN financial_accounts fa ON fa.id = ec.financial_account_id
ORDER BY ec.created_at ASC;

-- 2. Tampilkan 10 Pengeluaran Biaya Operasional Terakhir
SELECT
  e.expense_number AS "No. Pengeluaran",
  o.name AS "Cabang Outlet",
  ec.name AS "Kategori",
  e.recipient AS "Penerima / Vendor",
  pay_fa.account_name AS "Sumber Dana",
  TO_CHAR(e.amount, 'FM999,999,999.00') AS "Nominal (Rp)",
  e.reference_number AS "No. Kuitansi / Ref",
  e.expense_date AS "Tanggal Biaya",
  TO_CHAR(e.created_at, 'YYYY-MM-DD HH24:MI') AS "Waktu Dibuat"
FROM expenses e
JOIN outlets o ON o.id = e.outlet_id
JOIN expense_categories ec ON ec.id = e.category_id
JOIN financial_accounts pay_fa ON pay_fa.id = e.payment_account_id
ORDER BY e.created_at DESC
LIMIT 10;

-- 3. Audit Jurnal Akuntansi Level 2 untuk Pengeluaran Biaya (Beban vs Kas/Bank)
SELECT
  je.journal_number AS "No. Jurnal",
  je.status AS "Status Jurnal",
  fa.account_code AS "Kode Akun",
  fa.account_name AS "Nama Akun",
  TO_CHAR(jl.debit, 'FM999,999,999.00') AS "Debit (Rp)",
  TO_CHAR(jl.credit, 'FM999,999,999.00') AS "Kredit (Rp)",
  jl.description AS "Keterangan Jurnal"
FROM journal_entries je
JOIN journal_lines jl ON jl.journal_entry_id = je.id
JOIN financial_accounts fa ON fa.id = jl.financial_account_id
WHERE je.reference_type = 'EXPENSE'
ORDER BY je.created_at DESC, jl.debit DESC
LIMIT 10;

-- 4. Rekapitulasi Total Beban Usaha per Kategori Bulan Berjalan
SELECT
  ec.name AS "Kategori Biaya",
  fa.account_code AS "Kode Akun Beban",
  COUNT(e.id) AS "Jumlah Transaksi",
  TO_CHAR(SUM(e.amount), 'FM999,999,999.00') AS "Total Beban (Rp)"
FROM expenses e
JOIN expense_categories ec ON ec.id = e.category_id
JOIN financial_accounts fa ON fa.id = e.financial_account_id
WHERE TO_CHAR(e.expense_date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
GROUP BY ec.name, fa.account_code
ORDER BY SUM(e.amount) DESC;
