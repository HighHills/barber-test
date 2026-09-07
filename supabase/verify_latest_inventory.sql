-- ============================================================
-- VERIFIKASI REKAMAN OPERASIONAL PERSEDIAAN & JURNAL DI SUPABASE
-- Jalankan skrip ini di Supabase SQL Editor setelah mencoba
-- fitur Stok Opname atau Transfer Cabang di aplikasi web.
-- ============================================================

-- 1. SALDO STOK PRODUK TERKINI DI OUTLET
SELECT
  p.sku AS "SKU",
  p.name AS "Nama Produk",
  oi.quantity AS "Stok Fisik",
  oi.average_cost AS "HPP (Average Cost)",
  (oi.quantity * oi.average_cost) AS "Total Nilai Aset (Rp)",
  oi.updated_at AS "Terakhir Diperbarui"
FROM public.outlet_inventory oi
JOIN public.products p ON p.id = oi.product_id
ORDER BY p.name ASC;

-- 2. DOKUMEN STOK OPNAME TERAKHIR (STOCK ADJUSTMENTS)
SELECT
  sa.adjustment_number AS "No. Dokumen Opname",
  sa.status AS "Status",
  sa.reason AS "Alasan Penyesuaian",
  p.name AS "Produk",
  sai.quantity_before AS "Stok Sebelum",
  sai.quantity_after AS "Hitungan Fisik",
  sai.quantity_delta AS "Selisih Delta",
  sai.unit_cost AS "HPP Satuan (Rp)",
  (ABS(sai.quantity_delta) * sai.unit_cost) AS "Nilai Dampak Selisih (Rp)",
  sa.created_at AS "Waktu Dibuat"
FROM public.stock_adjustments sa
JOIN public.stock_adjustment_items sai ON sai.adjustment_id = sa.id
JOIN public.products p ON p.id = sai.product_id
ORDER BY sa.created_at DESC
LIMIT 5;

-- 3. JURNAL AKUNTANSI PENYESUAIAN STOK (JRN-ADJ-...)
SELECT
  je.journal_number AS "No. Jurnal Opname",
  fa.account_code AS "Kode Akun",
  fa.account_name AS "Nama Akun",
  jl.debit AS "Debit (Rp)",
  jl.credit AS "Kredit (Rp)",
  jl.description AS "Keterangan"
FROM public.journal_entries je
JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
JOIN public.financial_accounts fa ON fa.id = jl.financial_account_id
WHERE je.reference_type = 'ADJUSTMENT'
ORDER BY je.created_at DESC, jl.debit DESC
LIMIT 10;

-- 4. KESEIMBANGAN JURNAL OPNAME (DEBIT = KREDIT)
SELECT
  je.journal_number AS "No. Jurnal Opname",
  SUM(jl.debit) AS "Total Debit (Rp)",
  SUM(jl.credit) AS "Total Kredit (Rp)",
  CASE
    WHEN SUM(jl.debit) = SUM(jl.credit) THEN 'PASS: SEIMBANG (DEBIT = KREDIT)'
    ELSE 'FAIL: TIDAK SEIMBANG'
  END AS "Status Keseimbangan"
FROM public.journal_entries je
JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
WHERE je.reference_type = 'ADJUSTMENT'
GROUP BY je.journal_number
ORDER BY je.journal_number DESC
LIMIT 5;

-- 5. MUTASI BUKU BESAR PERSEDIAAN TERAKHIR (INVENTORY MOVEMENTS)
SELECT
  im.occurred_at AS "Waktu Mutasi",
  p.name AS "Nama Produk",
  im.movement_type AS "Jenis Mutasi",
  im.quantity AS "Qty Mutasi",
  im.quantity_before AS "Sebelum",
  im.quantity_after AS "Sesudah",
  im.unit_cost AS "HPP Satuan",
  im.reference_type AS "Tipe Ref",
  prof.display_name AS "Petugas"
FROM public.inventory_movements im
JOIN public.products p ON p.id = im.product_id
LEFT JOIN public.profiles prof ON prof.id = im.created_by
ORDER BY im.occurred_at DESC
LIMIT 10;
