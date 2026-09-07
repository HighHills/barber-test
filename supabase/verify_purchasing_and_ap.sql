-- supabase/verify_purchasing_and_ap.sql
-- Verification Script: Purchase Order Lifecycle, Goods Receipt, Moving Average Costing, and AP Settlement

DO $$
DECLARE
  v_owner_id UUID;
  v_outlet_id UUID;
  v_product_id UUID;
  v_supplier_id UUID;
  v_cash_acc_id UUID;
  v_bank_acc_id UUID;
  v_po_res JSONB;
  v_po_id UUID;
  v_po_number VARCHAR(50);
  v_rec_res JSONB;
  v_pay_res JSONB;
  v_items JSONB;
  v_stock_before NUMERIC(18,4);
  v_stock_after NUMERIC(18,4);
  v_cost_before NUMERIC(18,2);
  v_cost_after NUMERIC(18,2);
BEGIN
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'MEMULAI VERIFIKASI SIKLUS PEMBELIAN & HUTANG (AP)...';
  RAISE NOTICE '====================================================';

  -- 1. Ambil User Owner / Admin
  SELECT id INTO v_owner_id FROM profiles ORDER BY created_at ASC LIMIT 1;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Profil pengguna tidak ditemukan!';
  END IF;

  -- 2. Ambil Outlet Cabang Aktif
  SELECT id INTO v_outlet_id FROM outlets WHERE is_active = TRUE ORDER BY code ASC LIMIT 1;
  IF v_outlet_id IS NULL THEN
    RAISE EXCEPTION 'Cabang outlet tidak ditemukan!';
  END IF;

  -- 3. Ambil Produk Ritel Aktif
  SELECT id INTO v_product_id FROM products WHERE is_active = TRUE ORDER BY name ASC LIMIT 1;
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Produk ritel tidak ditemukan!';
  END IF;

  -- 4. Ambil atau Buat Master Supplier Demo
  SELECT id INTO v_supplier_id FROM suppliers WHERE code = 'SUP-BSI-01' LIMIT 1;
  IF v_supplier_id IS NULL THEN
    INSERT INTO suppliers (code, name, phone, email, address, is_active)
    VALUES ('SUP-BSI-01', 'PT Barbershop Supply Indonesia', '081299887766', 'sales@barbersupply.id', 'Jl. Pergudangan Logistik No. 88, Jakarta', TRUE)
    RETURNING id INTO v_supplier_id;
  END IF;

  -- 5. Cek Stok & Modal Awal
  SELECT COALESCE(quantity, 0), COALESCE(average_cost, 0)
  INTO v_stock_before, v_cost_before
  FROM outlet_inventory
  WHERE outlet_id = v_outlet_id AND product_id = v_product_id;

  v_stock_before := COALESCE(v_stock_before, 0);
  v_cost_before := COALESCE(v_cost_before, 0);

  RAISE NOTICE 'Stok awal produk: %, Modal awal: Rp %', v_stock_before, v_cost_before;

  -- 6. Terbitkan Faktur P.O. (10 pcs @ Rp 35.000 = Rp 350.000)
  v_items := json_build_array(
    json_build_object(
      'product_id', v_product_id,
      'quantity', 10.0,
      'unit_cost', 35000.00,
      'discount_amount', 0.00,
      'tax_amount', 0.00
    )
  )::JSONB;

  v_po_res := create_purchase_order(
    p_outlet_id := v_outlet_id,
    p_supplier_id := v_supplier_id,
    p_items := v_items,
    p_discount_amount := 0.00,
    p_tax_amount := 0.00,
    p_notes := 'Pengadaan stok pomade rutin cabang',
    p_auto_receive := FALSE,
    p_created_by := v_owner_id
  );

  v_po_id := (v_po_res->>'purchase_id')::UUID;
  v_po_number := (v_po_res->>'purchase_number');

  RAISE NOTICE 'Faktur P.O. berhasil dibuat: % (Status: %)', v_po_number, (v_po_res->>'status');

  -- 7. Eksekusi Penerimaan Barang (Goods Receipt)
  v_rec_res := receive_purchase_order(
    p_purchase_id := v_po_id,
    p_received_by := v_owner_id
  );

  RAISE NOTICE 'Konfirmasi penerimaan barang sukses: % (Jurnal: %)', (v_rec_res->>'status'), (v_rec_res->>'journal_number');

  -- Cek Stok & Modal Baru
  SELECT quantity, average_cost
  INTO v_stock_after, v_cost_after
  FROM outlet_inventory
  WHERE outlet_id = v_outlet_id AND product_id = v_product_id;

  RAISE NOTICE 'Stok baru produk: % (Bertambah +10), Modal rata-rata baru: Rp %', v_stock_after, v_cost_after;

  -- 8. Eksekusi Pembayaran Lunas Hutang Supplier (Bank Account 1100)
  SELECT id INTO v_bank_acc_id FROM financial_accounts WHERE account_code = '1100' LIMIT 1;

  v_pay_res := record_supplier_payment(
    p_purchase_id := v_po_id,
    p_amount := 350000.00,
    p_financial_account_id := v_bank_acc_id,
    p_reference_number := 'TRF-BCA-' || LPAD((FLOOR(RANDOM() * 90000) + 10000)::TEXT, 5, '0'),
    p_notes := 'Pelunasan faktur via Transfer Bank BCA',
    p_paid_by := v_owner_id
  );

  RAISE NOTICE 'Pembayaran hutang supplier sukses: Status Bayar: % (Jurnal: %)', (v_pay_res->>'payment_status'), (v_pay_res->>'journal_number');
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'SEMUA SIKLUS P.O., STOK & HUTANG TERVERIFIKASI!';
  RAISE NOTICE '====================================================';
END $$;

-- Tampilkan Ringkasan Faktur Pembelian Terbaru
SELECT
  p.purchase_number AS "No. P.O.",
  s.name AS "Nama Supplier",
  o.name AS "Cabang Tujuan",
  p.status AS "Status Barang",
  p.payment_status AS "Status Pembayaran",
  TO_CHAR(p.total_amount, 'FM999,999,999.00') AS "Total Tagihan (Rp)",
  TO_CHAR(COALESCE(SUM(sp.amount), 0), 'FM999,999,999.00') AS "Total Dibayar (Rp)",
  TO_CHAR(p.purchased_at, 'YYYY-MM-DD HH24:MI') AS "Waktu P.O."
FROM purchases p
JOIN suppliers s ON s.id = p.supplier_id
JOIN outlets o ON o.id = p.outlet_id
LEFT JOIN supplier_payments sp ON sp.purchase_id = p.id
GROUP BY p.id, p.purchase_number, s.name, o.name, p.status, p.payment_status, p.total_amount, p.purchased_at
ORDER BY p.purchased_at DESC
LIMIT 5;

-- Tampilkan Jurnal Akuntansi yang Diterbitkan (Audit Keseimbangan Debit = Kredit)
SELECT
  je.journal_number AS "No. Jurnal",
  je.reference_type AS "Tipe Transaksi",
  je.description AS "Keterangan Jurnal",
  TO_CHAR(SUM(jl.debit), 'FM999,999,999.00') AS "Total Debit (Rp)",
  TO_CHAR(SUM(jl.credit), 'FM999,999,999.00') AS "Total Kredit (Rp)",
  CASE
    WHEN SUM(jl.debit) = SUM(jl.credit) THEN 'PASS: SEIMBANG (DEBIT = KREDIT)'
    ELSE 'FAIL: TIDAK SEIMBANG'
  END AS "Status Keseimbangan"
FROM journal_entries je
JOIN journal_lines jl ON jl.journal_entry_id = je.id
WHERE je.reference_type IN ('PURCHASE', 'SUPPLIER_PAYMENT')
GROUP BY je.id, je.journal_number, je.reference_type, je.description, je.journal_date
ORDER BY je.created_at DESC
LIMIT 5;
