-- ==============================================================================
-- BARBERSHOP OS - VERIFIKASI FASE 4: SISTEM KOMISI KAPSTER & SETTLEMENT PAYOUT
-- ==============================================================================
-- Jalankan query ini di Supabase SQL Editor untuk memverifikasi data komisi,
-- aturan berjenjang (8-Tier), serta keseimbangan jurnal akuntansi pencairan.
-- ==============================================================================

-- 1. DAFTAR ATURAN KOMISI (8-TIER RULES ENGINE)
SELECT 
    cr.priority AS "Tier",
    CASE cr.priority
        WHEN 1 THEN 'Tier 1: Kapster + Layanan/Produk + Cabang'
        WHEN 2 THEN 'Tier 2: Kapster + Layanan/Produk (Semua Cabang)'
        WHEN 3 THEN 'Tier 3: Kapster + Cabang Tertentu'
        WHEN 4 THEN 'Tier 4: Default Kapster Tertentu'
        WHEN 5 THEN 'Tier 5: Layanan/Produk + Cabang Tertentu'
        WHEN 6 THEN 'Tier 6: Default Layanan/Produk Tertentu'
        WHEN 7 THEN 'Tier 7: Default Cabang Tertentu'
        WHEN 8 THEN 'Tier 8: Default Bisnis Keseluruhan'
        ELSE 'Khusus'
    END AS "Deskripsi Tingkatan",
    COALESCE(e.full_name, 'Semua Kapster') AS "Kapster",
    COALESCE(s.name, p.name, 'Semua Item') AS "Target Item",
    COALESCE(o.name, 'Semua Cabang') AS "Cabang",
    cr.commission_type AS "Jenis Komisi",
    CASE 
        WHEN cr.commission_type = 'PERCENTAGE' THEN cr.commission_rate || '%'
        ELSE 'Rp ' || TO_CHAR(cr.fixed_amount, 'FM999,999,999')
    END AS "Besaran Komisi",
    cr.is_active AS "Aktif",
    cr.effective_from AS "Berlaku Sejak"
FROM commission_rules cr
LEFT JOIN employees e ON e.id = cr.employee_id
LEFT JOIN services s ON s.id = cr.service_id
LEFT JOIN products p ON p.id = cr.product_id
LEFT JOIN outlets o ON o.id = cr.outlet_id
ORDER BY cr.priority ASC, cr.created_at DESC;

-- 2. BUKU BESAR LIABILITAS KOMISI (COMMISSIONS ACCRUED)
SELECT 
    c.id AS "ID Komisi",
    s.invoice_number AS "No. Faktur Kasir",
    e.full_name AS "Kapster",
    si.description_snapshot AS "Layanan / Produk",
    c.commission_type AS "Tipe Komisi",
    CASE 
        WHEN c.commission_type = 'PERCENTAGE' THEN c.commission_rate || '%'
        ELSE 'Nominal Tetap'
    END AS "Tarif",
    TO_CHAR(c.commission_amount, 'FM999,999,999.00') AS "Nominal Komisi (Rp)",
    c.status AS "Status Komisi",
    TO_CHAR(c.earned_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS "Waktu Diperoleh",
    TO_CHAR(c.paid_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS "Waktu Dicairkan"
FROM commissions c
JOIN employees e ON e.id = c.employee_id
JOIN sales s ON s.id = c.sale_id
JOIN sale_items si ON si.id = c.sale_item_id
ORDER BY c.earned_at DESC
LIMIT 20;

-- 3. REKAPITULASI & PERFORMA KAPSTER (LEADERBOARD & SALDO)
SELECT 
    e.full_name AS "Nama Kapster",
    e.position AS "Jabatan",
    COUNT(c.id) AS "Total Transaksi Komisi",
    TO_CHAR(COALESCE(SUM(c.commission_amount), 0), 'FM999,999,999.00') AS "Total Komisi Diperoleh (Rp)",
    TO_CHAR(COALESCE(SUM(CASE WHEN c.status = 'PAID' THEN c.commission_amount ELSE 0 END), 0), 'FM999,999,999.00') AS "Komisi Sudah Dibayar (Rp)",
    TO_CHAR(COALESCE(SUM(CASE WHEN c.status = 'EARNED' THEN c.commission_amount ELSE 0 END), 0), 'FM999,999,999.00') AS "Sisa Hutang Komisi (Rp)"
FROM employees e
LEFT JOIN commissions c ON c.employee_id = e.id
WHERE e.is_active = TRUE
GROUP BY e.id, e.full_name, e.position
ORDER BY SUM(COALESCE(c.commission_amount, 0)) DESC;

-- 4. AUDIT KESEIMBANGAN JURNAL AKUNTANSI PENCAIRAN KOMISI (LEVEL 2 DOUBLE-ENTRY)
-- (Memverifikasi Debit = Kredit pada jurnal pembayaran komisi: Dr 2100 Hutang Komisi / Cr 1000 Kas / 1100 Bank)
SELECT 
    je.journal_number AS "No. Jurnal Payout",
    je.journal_date AS "Tanggal Jurnal",
    je.reference_type AS "Tipe Referensi",
    je.description AS "Keterangan",
    je.status AS "Status Jurnal",
    TO_CHAR(SUM(jl.debit), 'FM999,999,999.00') AS "Total Debit (Rp)",
    TO_CHAR(SUM(jl.credit), 'FM999,999,999.00') AS "Total Kredit (Rp)",
    CASE 
        WHEN SUM(jl.debit) = SUM(jl.credit) AND SUM(jl.debit) > 0 THEN 'PASS: SEIMBANG (DEBIT = KREDIT)'
        WHEN SUM(jl.debit) = 0 THEN 'WARNING: JURNAL KOSONG'
        ELSE 'FAIL: TIDAK SEIMBANG'
    END AS "Status Keseimbangan Akuntansi"
FROM journal_entries je
JOIN journal_lines jl ON jl.journal_entry_id = je.id
WHERE je.reference_type = 'PAYROLL' 
   OR je.description ILIKE '%pembayaran komisi%'
   OR je.journal_number LIKE 'JRN-COMM-%'
GROUP BY je.id, je.journal_number, je.journal_date, je.reference_type, je.description, je.status
ORDER BY je.journal_date DESC, je.journal_number DESC;
