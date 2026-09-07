-- ============================================================
-- VERIFIKASI REKAMAN TRANSAKSI PENJUALAN AKTUAL DI SUPABASE
-- Jalankan skrip ini di Supabase SQL Editor untuk memeriksa
-- integritas rekaman transaksi kasir yang baru saja diproses.
-- ============================================================

-- 1. DATA HEADER NOTA PENJUALAN (SALES)
SELECT
  s.invoice_number AS "No. Invoice",
  s.sold_at AS "Waktu Transaksi",
  s.status AS "Status",
  s.subtotal AS "Subtotal (Rp)",
  s.discount_amount AS "Diskon (Rp)",
  s.tax_amount AS "PPN (Rp)",
  s.total_amount AS "Total Tagihan (Rp)",
  p.display_name AS "Kasir",
  o.name AS "Outlet Cabang"
FROM public.sales s
JOIN public.profiles p ON p.id = s.created_by
JOIN public.outlets o ON o.id = s.outlet_id
ORDER BY s.sold_at DESC
LIMIT 1;

-- 2. RINCIAN BARIS BELANJAAN (SALE ITEMS)
SELECT
  si.item_type AS "Tipe",
  si.description_snapshot AS "Item",
  si.quantity AS "Jumlah",
  si.unit_price AS "Harga Satuan (Rp)",
  si.item_discount_amount AS "Diskon Item (Rp)",
  si.total_amount AS "Total Baris (Rp)",
  COALESCE(e.full_name, '-') AS "Barber Pelaksana",
  si.commission_amount AS "Komisi Tercatat (Rp)"
FROM public.sale_items si
LEFT JOIN public.employees e ON e.id = si.barber_id
WHERE si.sale_id = (SELECT id FROM public.sales ORDER BY sold_at DESC LIMIT 1)
ORDER BY si.created_at ASC;

-- 3. RINCIAN METODE PEMBAYARAN (SALE PAYMENTS)
SELECT
  pm.name AS "Metode Pembayaran",
  pm.type AS "Tipe",
  sp.amount AS "Nominal Bayar (Rp)",
  COALESCE(sp.reference_number, '-') AS "No. Referensi",
  sp.paid_at AS "Waktu Bayar"
FROM public.sale_payments sp
JOIN public.payment_methods pm ON pm.id = sp.payment_method_id
WHERE sp.sale_id = (SELECT id FROM public.sales ORDER BY sold_at DESC LIMIT 1);

-- 4. BUKU BESAR KOMISI BARBER (COMMISSIONS)
SELECT
  e.full_name AS "Nama Barber",
  c.commission_type AS "Tipe Komisi",
  c.commission_rate AS "Rate (%)",
  c.commission_amount AS "Nominal Komisi (Rp)",
  c.status AS "Status Komisi",
  c.earned_at AS "Waktu Perolehan"
FROM public.commissions c
JOIN public.employees e ON e.id = c.employee_id
WHERE c.sale_id = (SELECT id FROM public.sales ORDER BY sold_at DESC LIMIT 1);

-- 5. MUTASI & SISA STOK PRODUK (JIKA MEMBELI PRODUK RITEL)
SELECT
  p.name AS "Nama Produk",
  im.movement_type AS "Jenis Mutasi",
  im.quantity AS "Qty Mutasi",
  im.quantity_before AS "Stok Sebelum",
  im.quantity_after AS "Stok Sesudah",
  oi.quantity AS "Stok Fisik Real-time Saat Ini"
FROM public.inventory_movements im
JOIN public.products p ON p.id = im.product_id
JOIN public.outlet_inventory oi ON oi.product_id = im.product_id AND oi.outlet_id = im.outlet_id
WHERE im.reference_id = (SELECT id FROM public.sales ORDER BY sold_at DESC LIMIT 1);

-- 6. JURNAL AKUNTANSI DOUBLE-ENTRY (JOURNAL LINES)
SELECT
  je.journal_number AS "No. Jurnal",
  je.status AS "Status Jurnal",
  fa.account_code AS "Kode Akun",
  fa.account_name AS "Nama Akun",
  jl.debit AS "Debit (Rp)",
  jl.credit AS "Kredit (Rp)",
  jl.description AS "Keterangan"
FROM public.journal_entries je
JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
JOIN public.financial_accounts fa ON fa.id = jl.financial_account_id
WHERE je.reference_id = (SELECT id FROM public.sales ORDER BY sold_at DESC LIMIT 1);

-- 7. AUDIT KESEIMBANGAN JURNAL (DEBIT = KREDIT)
SELECT
  je.journal_number AS "No. Jurnal",
  SUM(jl.debit) AS "Total Debit (Rp)",
  SUM(jl.credit) AS "Total Kredit (Rp)",
  CASE
    WHEN SUM(jl.debit) = SUM(jl.credit) THEN 'PASS: SEIMBANG (DEBIT = KREDIT)'
    ELSE 'FAIL: TIDAK SEIMBANG'
  END AS "Status Keseimbangan"
FROM public.journal_entries je
JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
WHERE je.reference_id = (SELECT id FROM public.sales ORDER BY sold_at DESC LIMIT 1)
GROUP BY je.journal_number;
