-- ==============================================================================
-- BARBERSHOP OS - VERIFIKASI FASE 6: CRM PELANGGAN, MEMBERSHIP & POIN LOYALITAS
-- ==============================================================================
-- Jalankan query ini di Supabase SQL Editor untuk memverifikasi struktur dan data
-- CRM Pelanggan, Tingkatan Membership, Mutasi Poin, & Riwayat Potongan Rambut.
-- ==============================================================================

-- 1. AUDIT TINGKATAN MEMBERSHIP (CUSTOMER TIERS)
SELECT 
  code AS "Kode Tier",
  name AS "Nama Tingkatan",
  TO_CHAR(min_spending, 'FM999,999,999.00') AS "Syarat Min. Belanja (Rp)",
  min_visits AS "Syarat Min. Kunjungan",
  CONCAT(discount_percent_service, '%') AS "Diskon Jasa",
  CONCAT(discount_percent_product, '%') AS "Diskon Produk",
  CONCAT(points_multiplier, 'x') AS "Multiplier Poin",
  color_hex AS "Warna Hex",
  badge_icon AS "Ikon",
  CASE WHEN is_active THEN 'AKTIF' ELSE 'NON-AKTIF' END AS "Status"
FROM customer_tiers
ORDER BY min_spending ASC;


-- 2. AUDIT DATA PELANGGAN CRM & TIER AKTIF
SELECT 
  c.customer_code AS "Kode Pelanggan",
  c.full_name AS "Nama Pelanggan",
  c.phone AS "No. Handphone",
  COALESCE(ct.name, 'Bronze Member') AS "Tingkatan Membership",
  c.current_loyalty_points AS "Saldo Poin Aktif",
  c.lifetime_loyalty_points AS "Total Akumulasi Poin",
  (
    SELECT COUNT(s.id) 
    FROM sales s 
    WHERE s.customer_id = c.id AND s.status = 'COMPLETED'
  ) AS "Total Kunjungan",
  TO_CHAR(
    COALESCE(
      (SELECT SUM(s.total_amount) FROM sales s WHERE s.customer_id = c.id AND s.status = 'COMPLETED'), 
      0
    ), 'FM999,999,999.00'
  ) AS "Total Belanja (LTV)",
  e.full_name AS "Barber Langganan",
  CASE WHEN c.is_active THEN 'AKTIF' ELSE 'NON-AKTIF' END AS "Status"
FROM customers c
LEFT JOIN customer_tiers ct ON ct.id = c.tier_id
LEFT JOIN employees e ON e.id = c.preferred_barber_id
ORDER BY c.created_at DESC
LIMIT 15;


-- 3. AUDIT BUKU BESAR MUTASI POIN LOYALITAS (LOYALTY LEDGER)
SELECT 
  cll.id AS "ID Mutasi",
  c.full_name AS "Nama Pelanggan",
  cll.transaction_type AS "Tipe Transaksi",
  CASE 
    WHEN cll.points_change > 0 THEN CONCAT('+', cll.points_change) 
    ELSE CAST(cll.points_change AS TEXT) 
  END AS "Perubahan Poin",
  cll.points_balance_after AS "Saldo Akhir",
  s.invoice_number AS "No. Faktur POS",
  o.name AS "Cabang Outlet",
  cll.notes AS "Keterangan",
  TO_CHAR(cll.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS "Waktu Mutasi"
FROM customer_loyalty_ledger cll
JOIN customers c ON c.id = cll.customer_id
JOIN outlets o ON o.id = cll.outlet_id
LEFT JOIN sales s ON s.id = cll.sale_id
ORDER BY cll.created_at DESC
LIMIT 15;


-- 4. AUDIT RIWAYAT GAYA PANGKAS RAMBUT (HAIRCUT HISTORY)
SELECT 
  chh.id AS "ID Riwayat",
  c.full_name AS "Nama Pelanggan",
  e.full_name AS "Barber Pemangkas",
  chh.style_name AS "Model Pangkas",
  chh.clipper_guard_sides AS "Sepatu Samping",
  chh.clipper_guard_top AS "Sepatu Atas",
  chh.styling_product_used AS "Produk Styling",
  chh.special_notes AS "Catatan Khusus",
  chh.visit_date AS "Tanggal Pangkas"
FROM customer_haircut_history chh
JOIN customers c ON c.id = chh.customer_id
JOIN employees e ON e.id = chh.barber_id
ORDER BY chh.visit_date DESC, chh.created_at DESC
LIMIT 10;
