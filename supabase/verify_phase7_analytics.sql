-- ==============================================================================
-- BARBERSHOP OS - VERIFIKASI FASE 7: ANALITIK EKSEKUTIF & DASHBOARD OWNER (BI)
-- ==============================================================================

-- 1. AUDIT PERFORMA KONSOLIDASI MULTI-OUTLET (OUTLET BENCHMARK)
SELECT 
  outlet_name AS "Nama Cabang",
  outlet_code AS "Kode",
  total_transactions AS "Total Nota",
  TO_CHAR(total_revenue, 'FM999,999,999.00') AS "Total Omset (Rp)",
  TO_CHAR(service_revenue, 'FM999,999,999.00') AS "Omset Jasa (Rp)",
  TO_CHAR(product_revenue, 'FM999,999,999.00') AS "Omset Retail (Rp)",
  TO_CHAR(average_ticket_value, 'FM999,999,999.00') AS "Nilai Rata-rata Nota (ATV)"
FROM view_executive_outlet_performance
ORDER BY total_revenue DESC;


-- 2. AUDIT DISTRIBUSI JAM SIBUK OPERASIONAL (HOURLY PEAK LOAD)
SELECT 
  EXTRACT(HOUR FROM q.started_at AT TIME ZONE 'Asia/Jakarta') AS "Jam Layanan",
  COUNT(q.id) AS "Total Sesi Pangkas",
  ROUND(AVG(EXTRACT(EPOCH FROM (q.completed_at - q.started_at)) / 60)::NUMERIC, 1) AS "Rata-rata Durasi (Menit)"
FROM queues q
WHERE q.started_at IS NOT NULL AND q.completed_at IS NOT NULL
GROUP BY EXTRACT(HOUR FROM q.started_at AT TIME ZONE 'Asia/Jakarta')
ORDER BY "Jam Layanan" ASC;


-- 3. AUDIT 5 LAYANAN JASA DENGAN PENDAPATAN TERTINGGI (TOP SERVICES)
SELECT 
  s.name AS "Nama Layanan Jasa",
  COUNT(si.id) AS "Frekuensi Dipesan",
  TO_CHAR(SUM(si.total_amount), 'FM999,999,999.00') AS "Total Kontribusi Omset (Rp)"
FROM sale_items si
JOIN services s ON s.id = si.service_id
JOIN sales sa ON sa.id = si.sale_id
WHERE sa.status = 'COMPLETED' AND si.item_type = 'SERVICE'
GROUP BY s.name
ORDER BY SUM(si.total_amount) DESC
LIMIT 5;


-- 4. AUDIT 5 PRODUK RETAIL TERLARIS (TOP PRODUCTS)
SELECT 
  p.name AS "Nama Produk Retail",
  SUM(si.quantity) AS "Unit Terjual",
  TO_CHAR(SUM(si.total_amount), 'FM999,999,999.00') AS "Total Kontribusi Omset (Rp)"
FROM sale_items si
JOIN products p ON p.id = si.product_id
JOIN sales sa ON sa.id = si.sale_id
WHERE sa.status = 'COMPLETED' AND si.item_type = 'PRODUCT'
GROUP BY p.name
ORDER BY SUM(si.total_amount) DESC
LIMIT 5;


-- 5. AUDIT PRODUKTIVITAS & KONTRIBUSI KAPSTER (BARBER PERFORMANCE INDEX)
SELECT 
  e.full_name AS "Nama Kapster",
  COUNT(DISTINCT si.sale_id) AS "Total Pelanggan Dilayani",
  TO_CHAR(SUM(si.total_amount), 'FM999,999,999.00') AS "Total Omset Dihasilkan (Rp)",
  COUNT(CASE WHEN si.item_type = 'PRODUCT' THEN 1 END) AS "Produk Berhasil Di-upsell",
  ROUND(
    (COUNT(CASE WHEN si.item_type = 'PRODUCT' THEN 1 END)::NUMERIC / 
     NULLIF(COUNT(DISTINCT si.sale_id), 0)::NUMERIC) * 100, 
    1
  ) AS "Rasio Upselling (%)"
FROM sale_items si
JOIN employees e ON e.id = si.barber_id
JOIN sales sa ON sa.id = si.sale_id
WHERE sa.status = 'COMPLETED'
GROUP BY e.full_name
ORDER BY SUM(si.total_amount) DESC;
