-- ==============================================================================
-- BARBERSHOP OS - MIGRATION 15: EXECUTIVE ANALYTICS & BI INDEXES
-- ==============================================================================

-- 1. Index Optimasi Pemindaian Analitik Penjualan (Multi-Outlet & Rentang Waktu)
CREATE INDEX IF NOT EXISTS idx_sales_analytics_lookup 
ON sales(outlet_id, created_at, status);

CREATE INDEX IF NOT EXISTS idx_sale_items_analytics_lookup 
ON sale_items(item_type, sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_barber_revenue
ON sale_items(barber_id, item_type);

-- 2. Index Optimasi Analisis Jam Paling Sibuk Kursi Pangkas (Peak Hours Heatmap)
CREATE INDEX IF NOT EXISTS idx_queues_started_status 
ON queues(outlet_id, started_at, status);

CREATE INDEX IF NOT EXISTS idx_appointments_start_status 
ON appointments(outlet_id, start_at, status);

-- 3. View Konsolidasi Analitik Multi-Outlet (Multi-Outlet Performance View)
CREATE OR REPLACE VIEW view_executive_outlet_performance AS
SELECT 
  o.id AS outlet_id,
  o.name AS outlet_name,
  o.code AS outlet_code,
  COUNT(DISTINCT s.id) AS total_transactions,
  COALESCE(SUM(s.total_amount), 0) AS total_revenue,
  COALESCE(SUM(s.subtotal), 0) AS total_subtotal,
  COALESCE(SUM(s.discount_amount), 0) AS total_discounts,
  CASE 
    WHEN COUNT(DISTINCT s.id) > 0 THEN ROUND(COALESCE(SUM(s.total_amount), 0) / COUNT(DISTINCT s.id), 2)
    ELSE 0 
  END AS average_ticket_value,
  COALESCE(
    SUM(CASE WHEN si.item_type = 'SERVICE' THEN si.total_amount ELSE 0 END), 
    0
  ) AS service_revenue,
  COALESCE(
    SUM(CASE WHEN si.item_type = 'PRODUCT' THEN si.total_amount ELSE 0 END), 
    0
  ) AS product_revenue
FROM outlets o
LEFT JOIN sales s ON s.outlet_id = o.id AND s.status = 'COMPLETED'
LEFT JOIN sale_items si ON si.sale_id = s.id
GROUP BY o.id, o.name, o.code;

-- Berikan izin akses pada view
GRANT SELECT ON view_executive_outlet_performance TO authenticated;
GRANT ALL ON view_executive_outlet_performance TO service_role;
