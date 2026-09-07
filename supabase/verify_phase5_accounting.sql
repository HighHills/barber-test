-- ==============================================================================
-- BARBERSHOP OS - VERIFIKASI FASE 5: LAPORAN KEUANGAN & REKONSILIASI KASIR
-- ==============================================================================
-- Jalankan query ini di Supabase SQL Editor untuk memverifikasi keakuratan
-- Laporan Keuangan Level 2 Double-Entry, Neraca Saldo, Laba Rugi, & Sesi Kasir.
-- ==============================================================================

-- 1. AUDIT NERACA SALDO (TRIAL BALANCE) - KESEIMBANGAN DEBIT VS KREDIT
WITH account_balances AS (
    SELECT 
        fa.account_code AS "Kode",
        fa.account_name AS "Nama Akun",
        fa.account_type AS "Golongan",
        fa.normal_balance AS "Saldo Normal",
        COALESCE(SUM(jl.debit), 0) AS total_debit,
        COALESCE(SUM(jl.credit), 0) AS total_credit
    FROM financial_accounts fa
    LEFT JOIN journal_lines jl ON jl.financial_account_id = fa.id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'POSTED'
    GROUP BY fa.id, fa.account_code, fa.account_name, fa.account_type, fa.normal_balance
)
SELECT 
    "Kode",
    "Nama Akun",
    "Golongan",
    "Saldo Normal",
    TO_CHAR(
        CASE 
            WHEN "Saldo Normal" = 'DEBIT' AND (total_debit - total_credit) >= 0 THEN (total_debit - total_credit)
            WHEN "Saldo Normal" = 'CREDIT' AND (total_credit - total_debit) < 0 THEN ABS(total_credit - total_debit)
            ELSE 0 
        END, 'FM999,999,999.00'
    ) AS "Saldo Debit (Rp)",
    TO_CHAR(
        CASE 
            WHEN "Saldo Normal" = 'CREDIT' AND (total_credit - total_debit) >= 0 THEN (total_credit - total_debit)
            WHEN "Saldo Normal" = 'DEBIT' AND (total_debit - total_credit) < 0 THEN ABS(total_debit - total_credit)
            ELSE 0 
        END, 'FM999,999,999.00'
    ) AS "Saldo Kredit (Rp)"
FROM account_balances
ORDER BY "Kode" ASC;

-- SUMMARY VALIDASI TOTAL NERACA SALDO
SELECT 
    TO_CHAR(SUM(jl.debit), 'FM999,999,999.00') AS "Total Seluruh Debit (Rp)",
    TO_CHAR(SUM(jl.credit), 'FM999,999,999.00') AS "Total Seluruh Kredit (Rp)",
    CASE 
        WHEN SUM(jl.debit) = SUM(jl.credit) AND SUM(jl.debit) > 0 THEN 'PASS: SEIMBANG (DEBIT = KREDIT)'
        ELSE 'FAIL: TIDAK SEIMBANG'
    END AS "Status Keseimbangan Neraca Saldo"
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE je.status = 'POSTED';


-- 2. AUDIT LAPORAN LABA RUGI (INCOME STATEMENT / P&L)
WITH pl_summary AS (
    SELECT 
        COALESCE(SUM(CASE WHEN fa.account_code = '4000' THEN (jl.credit - jl.debit) ELSE 0 END), 0) AS service_rev,
        COALESCE(SUM(CASE WHEN fa.account_code = '4100' THEN (jl.credit - jl.debit) ELSE 0 END), 0) AS product_rev,
        COALESCE(SUM(CASE WHEN fa.account_code = '5600' THEN (jl.debit - jl.credit) ELSE 0 END), 0) AS discounts_refunds,
        COALESCE(SUM(CASE WHEN fa.account_code = '5000' THEN (jl.debit - jl.credit) ELSE 0 END), 0) AS cogs,
        COALESCE(SUM(CASE WHEN fa.account_code = '5100' THEN (jl.debit - jl.credit) ELSE 0 END), 0) AS commission_exp,
        COALESCE(SUM(CASE WHEN fa.account_code = '5700' THEN (jl.debit - jl.credit) ELSE 0 END), 0) AS inventory_loss_exp,
        COALESCE(SUM(CASE WHEN fa.account_code = '5500' THEN (jl.debit - jl.credit) ELSE 0 END), 0) AS merchant_fee_exp,
        COALESCE(SUM(CASE WHEN fa.account_code IN ('5200', '5300', '5400') THEN (jl.debit - jl.credit) ELSE 0 END), 0) AS other_exp
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'POSTED'
    JOIN financial_accounts fa ON fa.id = jl.financial_account_id
)
SELECT 
    TO_CHAR(service_rev, 'FM999,999,999.00') AS "Pendapatan Jasa Pangkas (4000)",
    TO_CHAR(product_rev, 'FM999,999,999.00') AS "Pendapatan Produk (4100)",
    TO_CHAR((service_rev + product_rev - discounts_refunds), 'FM999,999,999.00') AS "Total Pendapatan Bersih",
    TO_CHAR(cogs, 'FM999,999,999.00') AS "Harga Pokok Penjualan HPP (5000)",
    TO_CHAR(((service_rev + product_rev - discounts_refunds) - cogs), 'FM999,999,999.00') AS "Laba Kotor (Gross Profit)",
    TO_CHAR(commission_exp, 'FM999,999,999.00') AS "Beban Komisi Kapster (5100)",
    TO_CHAR((commission_exp + inventory_loss_exp + merchant_fee_exp + other_exp), 'FM999,999,999.00') AS "Total Beban Operasional",
    TO_CHAR(
        ((service_rev + product_rev - discounts_refunds) - cogs - (commission_exp + inventory_loss_exp + merchant_fee_exp + other_exp)), 
        'FM999,999,999.00'
    ) AS "Laba Bersih Usaha (Net Profit)"
FROM pl_summary;


-- 3. AUDIT PERSAMAAN AKUNTANSI NERACA KEUANGAN (ASET = LIABILITAS + EKUITAS)
WITH balance_sheet AS (
    SELECT 
        COALESCE(SUM(CASE WHEN fa.account_type = 'ASSET' THEN (jl.debit - jl.credit) ELSE 0 END), 0) AS total_assets,
        COALESCE(SUM(CASE WHEN fa.account_type = 'LIABILITY' THEN (jl.credit - jl.debit) ELSE 0 END), 0) AS total_liabilities,
        COALESCE(SUM(CASE WHEN fa.account_type = 'EQUITY' THEN (jl.credit - jl.debit) ELSE 0 END), 0) AS owner_equity,
        COALESCE(SUM(CASE WHEN fa.account_type = 'REVENUE' THEN (jl.credit - jl.debit) ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN fa.account_type = 'EXPENSE' THEN (jl.debit - jl.credit) ELSE 0 END), 0) AS current_earnings
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'POSTED'
    JOIN financial_accounts fa ON fa.id = jl.financial_account_id
)
SELECT 
    TO_CHAR(total_assets, 'FM999,999,999.00') AS "Total Aset (Kas, Bank, Persediaan)",
    TO_CHAR(total_liabilities, 'FM999,999,999.00') AS "Total Liabilitas (Hutang Komisi & Pajak)",
    TO_CHAR((owner_equity + current_earnings), 'FM999,999,999.00') AS "Total Ekuitas (Modal + Laba Berjalan)",
    TO_CHAR((total_liabilities + owner_equity + current_earnings), 'FM999,999,999.00') AS "Total Liabilitas + Ekuitas",
    CASE 
        WHEN ABS(total_assets - (total_liabilities + owner_equity + current_earnings)) < 0.05 THEN 'PASS: PERSAMAAN SEIMBANG (ASET = LIABILITAS + EKUITAS)'
        ELSE 'FAIL: TIDAK SEIMBANG'
    END AS "Status Audit Neraca"
FROM balance_sheet;


-- 4. AUDIT REKONSILIASI SESI KASIR (CASH DRAWER RECONCILIATION)
SELECT 
    cs.id AS "ID Sesi",
    cr.name AS "Laci Kasir",
    p.display_name AS "Kasir Pembuka",
    TO_CHAR(cs.opening_balance, 'FM999,999,999.00') AS "Modal Awal (Rp)",
    TO_CHAR(COALESCE(cs.closing_balance, 0), 'FM999,999,999.00') AS "Kas Fisik Akhir (Rp)",
    cs.status AS "Status Sesi",
    TO_CHAR(cs.opened_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS "Waktu Buka",
    TO_CHAR(cs.closed_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS "Waktu Tutup"
FROM cash_sessions cs
JOIN cash_registers cr ON cr.id = cs.cash_register_id
JOIN profiles p ON p.id = cs.opened_by
ORDER BY cs.opened_at DESC
LIMIT 10;
