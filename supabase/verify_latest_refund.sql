-- ============================================================
-- VERIFIKASI REKAMAN DOKUMEN REFUND & JURNAL AKUNTANSI DI SUPABASE
-- Jalankan skrip ini di Supabase SQL Editor untuk memverifikasi
-- integritas transaksi pengembalian dana (Refund) yang baru saja diproses.
-- ============================================================

-- 1. DATA DOKUMEN PENGEMBALIAN DANA (SALE REFUNDS)
SELECT
  sr.refund_number AS "No. Refund",
  s.invoice_number AS "No. Invoice Asal",
  sr.refund_type AS "Tipe Refund",
  sr.status AS "Status Refund",
  s.status AS "Status Nota Terkini",
  sr.subtotal AS "Subtotal (Rp)",
  sr.discount_amount AS "Potongan Diskon (Rp)",
  sr.tax_amount AS "Penyesuaian PPN (Rp)",
  sr.total_amount AS "Total Pengembalian (Rp)",
  sr.reason AS "Alasan Refund",
  sr.refunded_at AS "Waktu Refund",
  p.display_name AS "Kasir Pemroses"
FROM public.sale_refunds sr
JOIN public.sales s ON s.id = sr.sale_id
JOIN public.profiles p ON p.id = sr.created_by
ORDER BY sr.refunded_at DESC
LIMIT 1;

-- 2. RINCIAN BARIS ITEM YANG DIREFUND (SALE REFUND ITEMS)
SELECT
  si.description_snapshot AS "Nama Item",
  si.item_type AS "Tipe Item",
  sri.quantity AS "Qty Direfund",
  sri.refund_amount AS "Nominal Refund (Rp)",
  sri.tax_amount AS "PPN Refund (Rp)",
  CASE WHEN sri.return_to_inventory THEN 'YA (Restock Gudang)' ELSE 'TIDAK' END AS "Kembalikan ke Stok",
  sri.reason AS "Alasan Item"
FROM public.sale_refund_items sri
JOIN public.sale_items si ON si.id = sri.sale_item_id
WHERE sri.refund_id = (SELECT id FROM public.sale_refunds ORDER BY refunded_at DESC LIMIT 1);

-- 3. ALOKASI METODE PENGELUARAN KAS REFUND (SALE REFUND PAYMENTS)
SELECT
  pm.name AS "Metode Pengeluaran",
  pm.type AS "Tipe",
  srp.amount AS "Nominal Pengeluaran (Rp)",
  fa.account_code AS "Kode Akun Finansial",
  fa.account_name AS "Nama Akun Kas/Bank"
FROM public.sale_refund_payments srp
JOIN public.payment_methods pm ON pm.id = srp.payment_method_id
LEFT JOIN public.financial_accounts fa ON fa.id = pm.financial_account_id
WHERE srp.refund_id = (SELECT id FROM public.sale_refunds ORDER BY refunded_at DESC LIMIT 1);

-- 4. JURNAL AKUNTANSI PENGEMBALIAN DANA (JOURNAL LINES)
SELECT
  je.journal_number AS "No. Jurnal Refund",
  je.status AS "Status Jurnal",
  fa.account_code AS "Kode Akun",
  fa.account_name AS "Nama Akun",
  jl.debit AS "Debit (Rp)",
  jl.credit AS "Kredit (Rp)",
  jl.description AS "Keterangan Baris"
FROM public.journal_entries je
JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
JOIN public.financial_accounts fa ON fa.id = jl.financial_account_id
WHERE je.reference_type = 'REFUND'
  AND je.reference_id = (SELECT id FROM public.sale_refunds ORDER BY refunded_at DESC LIMIT 1)
ORDER BY jl.debit DESC, jl.credit DESC;

-- 5. AUDIT KESEIMBANGAN JURNAL REFUND (DEBIT = KREDIT)
SELECT
  je.journal_number AS "No. Jurnal Refund",
  SUM(jl.debit) AS "Total Debit (Rp)",
  SUM(jl.credit) AS "Total Kredit (Rp)",
  CASE
    WHEN SUM(jl.debit) = SUM(jl.credit) THEN 'PASS: SEIMBANG (DEBIT = KREDIT)'
    ELSE 'FAIL: TIDAK SEIMBANG'
  END AS "Status Keseimbangan Akuntansi"
FROM public.journal_entries je
JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
WHERE je.reference_type = 'REFUND'
  AND je.reference_id = (SELECT id FROM public.sale_refunds ORDER BY refunded_at DESC LIMIT 1)
GROUP BY je.journal_number;

-- 6. AUDIT MUTASI PENGEMBALIAN STOK (RETURN_IN) JIKA ADA PRODUK RESTOCK
SELECT
  p.name AS "Nama Produk Restock",
  im.movement_type AS "Jenis Mutasi",
  im.quantity AS "Qty Masuk Kembali",
  im.quantity_before AS "Stok Sebelum",
  im.quantity_after AS "Stok Sesudah",
  im.occurred_at AS "Waktu Mutasi"
FROM public.inventory_movements im
JOIN public.products p ON p.id = im.product_id
WHERE im.reference_type = 'REFUND'
  AND im.reference_id = (SELECT id FROM public.sale_refunds ORDER BY refunded_at DESC LIMIT 1);
