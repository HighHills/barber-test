-- ============================================================================
-- PHASE 0.5 — BUSINESS TRANSACTION INTEGRITY AUDIT
-- READ-ONLY / ZERO MUTATION
-- Designed for Supabase SQL Editor / PostgreSQL 15+
-- Schema Contract: FINAL ERD v3 (49 Tables, RLS Enabled & Forced)
-- ============================================================================

-- ============================================================================
-- PART 1: EXECUTIVE CONSOLIDATED AUDIT SUMMARY
-- Run this block first to get an immediate status dashboard across all domains.
-- Status values: PASS (0 violations), FAIL (integrity violation), REVIEW (requires business inspection)
-- ============================================================================
WITH
chk_sales_subtotal AS (
  SELECT COUNT(*) AS violations
  FROM public.sales s
  JOIN (
    SELECT sale_id, COALESCE(SUM(quantity * unit_price), 0) AS calc_subtotal
    FROM public.sale_items GROUP BY sale_id
  ) si ON si.sale_id = s.id
  WHERE ABS(s.subtotal - si.calc_subtotal) > 0.01
),
chk_sales_total AS (
  SELECT COUNT(*) AS violations
  FROM public.sales s
  JOIN (
    SELECT sale_id, COALESCE(SUM(total_amount), 0) AS calc_total
    FROM public.sale_items GROUP BY sale_id
  ) si ON si.sale_id = s.id
  WHERE ABS(s.total_amount - si.calc_total) > 0.01
),
chk_sales_payment AS (
  SELECT COUNT(*) AS violations
  FROM public.sales s
  LEFT JOIN (
    SELECT sale_id, COALESCE(SUM(amount), 0) AS paid_total
    FROM public.sale_payments GROUP BY sale_id
  ) sp ON sp.sale_id = s.id
  WHERE s.status NOT IN ('VOIDED')
    AND ABS(s.total_amount - COALESCE(sp.paid_total, 0)) > 0.01
),
chk_sale_item_snapshots AS (
  SELECT COUNT(*) AS violations
  FROM public.sale_items
  WHERE unit_price IS NULL OR cost_price IS NULL OR total_amount IS NULL
),
chk_commission_sync AS (
  SELECT COUNT(*) AS violations
  FROM public.commissions c
  JOIN public.sale_items si ON si.id = c.sale_item_id
  WHERE ROUND(COALESCE(c.commission_amount, 0)::numeric, 2) <> ROUND(COALESCE(si.commission_amount, 0)::numeric, 2)
     OR c.commission_type IS DISTINCT FROM si.commission_type
),
chk_commission_priority AS (
  SELECT COUNT(*) AS violations
  FROM public.commission_rules
  WHERE priority < 1 OR priority > 8
     OR (effective_until IS NOT NULL AND effective_until < effective_from)
),
chk_tiered_commission_rules AS (
  SELECT COUNT(*) AS count_tiered
  FROM public.commission_rules
  WHERE commission_type = 'TIERED'
),
chk_journal_balance AS (
  SELECT COUNT(*) AS violations FROM (
    SELECT journal_entry_id
    FROM public.journal_lines
    GROUP BY journal_entry_id
    HAVING ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)) > 0.01
  ) t
),
chk_posted_journal_lines AS (
  SELECT COUNT(*) AS violations FROM (
    SELECT je.id
    FROM public.journal_entries je
    LEFT JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
    WHERE je.status = 'POSTED'
    GROUP BY je.id
    HAVING COUNT(jl.id) < 2
  ) t
),
chk_journal_immutability AS (
  SELECT COUNT(*) AS trigger_count
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'journal_entries'
    AND t.tgname = 'trg_journal_entries_immutable'
),
chk_inventory_arithmetic AS (
  SELECT COUNT(*) AS violations
  FROM public.inventory_movements
  WHERE ABS(quantity_before + quantity - quantity_after) > 0.0001
),
chk_inventory_reconciliation AS (
  SELECT COUNT(*) AS violations FROM (
    WITH lm AS (
      SELECT DISTINCT ON (outlet_id, product_id) outlet_id, product_id, quantity_after
      FROM public.inventory_movements ORDER BY outlet_id, product_id, occurred_at DESC, id DESC
    )
    SELECT oi.id
    FROM public.outlet_inventory oi
    JOIN lm ON lm.outlet_id = oi.outlet_id AND lm.product_id = oi.product_id
    WHERE ABS(oi.quantity - lm.quantity_after) > 0.0001
  ) t
),
chk_negative_inventory AS (
  SELECT COUNT(*) AS violations
  FROM public.outlet_inventory
  WHERE quantity < 0
),
chk_negative_avg_cost AS (
  SELECT COUNT(*) AS violations
  FROM public.outlet_inventory
  WHERE average_cost < 0
),
chk_transfer_pairing AS (
  SELECT COUNT(*) AS violations FROM (
    SELECT reference_id
    FROM public.inventory_movements
    WHERE movement_type IN ('TRANSFER_OUT', 'TRANSFER_IN') AND reference_id IS NOT NULL
    GROUP BY reference_id
    HAVING COUNT(*) FILTER (WHERE movement_type = 'TRANSFER_OUT') = 0
        OR COUNT(*) FILTER (WHERE movement_type = 'TRANSFER_IN') = 0
  ) t
),
chk_refund_quantities AS (
  SELECT COUNT(*) AS violations FROM (
    SELECT sri.sale_item_id
    FROM public.sale_refund_items sri
    JOIN public.sale_refunds sr ON sr.id = sri.refund_id
    JOIN public.sale_items si ON si.id = sri.sale_item_id
    WHERE sr.status <> 'CANCELLED'
    GROUP BY sri.sale_item_id, si.quantity, si.total_amount
    HAVING SUM(sri.quantity) > si.quantity
        OR SUM(sri.refund_amount) > si.total_amount + 0.01
  ) t
),
chk_partial_refund_status AS (
  SELECT COUNT(*) AS violations FROM (
    WITH ref AS (
      SELECT sri.sale_item_id, SUM(sri.refund_amount) AS total_ref
      FROM public.sale_refund_items sri
      JOIN public.sale_refunds sr ON sr.id = sri.refund_id
      WHERE sr.status <> 'CANCELLED'
      GROUP BY sri.sale_item_id
    )
    SELECT s.id
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN ref r ON r.sale_item_id = si.id
    GROUP BY s.id, s.status
    HAVING s.status = 'REFUNDED'
       AND COALESCE(SUM(r.total_ref), 0) < SUM(si.total_amount) - 0.01
  ) t
),
chk_void_reversal_journal AS (
  SELECT COUNT(*) AS violations
  FROM public.sales s
  WHERE s.status = 'VOIDED'
    AND NOT EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.reference_type = 'SALE' AND je.reference_id = s.id
        AND je.description LIKE 'Reversal journal of VOID sale%'
    )
),
chk_secdef_search_path AS (
  SELECT COUNT(*) AS violations
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef = true
    AND (
      p.proconfig IS NULL
      OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%')
    )
),
chk_pos_client_commission_fallback AS (
  SELECT
    CASE
      WHEN pg_get_functiondef(p.oid) ~* 'v_comm_type\s*:=\s*\(?v_item->>''commission_type'''
        OR pg_get_functiondef(p.oid) ~* 'v_comm_rate\s*:=\s*\(?v_item->>''commission_rate'''
      THEN 1 ELSE 0
    END AS has_fallback
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'process_pos_sale'
),
chk_central_posting_gate AS (
  SELECT COUNT(*) AS unrouted_funcs FROM (
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('process_pos_sale', 'process_sale_refund', 'void_sale', 'process_stock_adjustment')
      AND pg_get_functiondef(p.oid) !~* '_internal_post_journal_entry\s*\('
  ) t
)
SELECT 'SALES-01' AS check_id, 'Sale Subtotal vs Sum(Qty * Price)' AS check_name,
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
  violations || ' sales mismatch between stored subtotal and sum(quantity * unit_price)' AS detail FROM chk_sales_subtotal
UNION ALL
SELECT 'SALES-02', 'Sale Total vs Sum(Items Total)',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' sales mismatch between total_amount and sum(sale_items.total_amount)' FROM chk_sales_total
UNION ALL
SELECT 'SALES-03', 'Payment Total vs Sale Total',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' non-void sales have payment totals mismatching sale total_amount' FROM chk_sales_payment
UNION ALL
SELECT 'SALES-04', 'Sale Item Price/Cost Snapshots',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' sale items missing unit_price, cost_price, or total_amount snapshots' FROM chk_sale_item_snapshots
UNION ALL
SELECT 'COMM-01', 'Commission Record vs Sale Item Snapshot',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' mismatches between commissions ledger and sale_items snapshot' FROM chk_commission_sync
UNION ALL
SELECT 'COMM-02', 'Commission Rule Priority (1..8)',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' commission rules have invalid priority (<1 or >8) or inverted dates' FROM chk_commission_priority
UNION ALL
SELECT 'COMM-03', 'TIERED Commission Rules Configuration',
  CASE WHEN count_tiered > 0 THEN 'REVIEW' ELSE 'PASS' END,
  count_tiered || ' TIERED commission rules found; requires review of cumulative monthly turnover logic' FROM chk_tiered_commission_rules
UNION ALL
SELECT 'ACCT-01', 'Journal Balance (Debit = Credit)',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' unbalanced journal entries found' FROM chk_journal_balance
UNION ALL
SELECT 'ACCT-02', 'Posted Journal Structure (Lines >= 2)',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' posted journals have fewer than 2 lines' FROM chk_posted_journal_lines
UNION ALL
SELECT 'ACCT-03', 'Posted Journal Immutability Trigger',
  CASE WHEN trigger_count >= 1 THEN 'PASS' ELSE 'FAIL' END,
  'trg_journal_entries_immutable active count: ' || trigger_count FROM chk_journal_immutability
UNION ALL
SELECT 'INV-01', 'Movement Arithmetic (before + qty = after)',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' inventory movements fail quantity_before + quantity = quantity_after' FROM chk_inventory_arithmetic
UNION ALL
SELECT 'INV-02', 'Inventory Balance vs Last Movement',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' outlet_inventory records mismatch last movement quantity_after' FROM chk_inventory_reconciliation
UNION ALL
SELECT 'INV-03', 'Negative Inventory Stock',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' outlet_inventory records have negative quantity' FROM chk_negative_inventory
UNION ALL
SELECT 'INV-04', 'Moving Average Cost Non-Negative',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' outlet_inventory records have negative average_cost' FROM chk_negative_avg_cost
UNION ALL
SELECT 'INV-05', 'Stock Transfer Dual-Sided Pairing',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' stock transfer reference_ids missing TRANSFER_OUT or TRANSFER_IN' FROM chk_transfer_pairing
UNION ALL
SELECT 'REF-01', 'Refund Quantities & Amounts vs Original',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' refund items exceed original sale item quantity or total_amount' FROM chk_refund_quantities
UNION ALL
SELECT 'REF-02', 'Partial Refund Sale Status Integrity',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' sales marked REFUNDED despite refunded amount < sold amount' FROM chk_partial_refund_status
UNION ALL
SELECT 'VOID-01', 'Voided Sale Reversal Journal',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' voided sales missing corresponding reversal journal entry' FROM chk_void_reversal_journal
UNION ALL
SELECT 'SEC-01', 'Security Definer Search Path Hardening',
  CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END,
  violations || ' public SECURITY DEFINER functions lack search_path setting' FROM chk_secdef_search_path
UNION ALL
SELECT 'SEC-02', 'POS Client Commission Fallback Scan',
  CASE WHEN has_fallback = 1 THEN 'REVIEW' ELSE 'PASS' END,
  CASE WHEN has_fallback = 1
    THEN 'process_pos_sale contains client commission fallback (lines 842-851)'
    ELSE 'No client commission fallback detected in process_pos_sale'
  END FROM chk_pos_client_commission_fallback
UNION ALL
SELECT 'SEC-03', 'Transactional RPC Central Posting Gate',
  CASE WHEN unrouted_funcs = 0 THEN 'PASS' ELSE 'FAIL' END,
  unrouted_funcs || ' transactional RPCs fail to route through _internal_post_journal_entry' FROM chk_central_posting_gate
ORDER BY check_id;


-- ============================================================================
-- PART 2: DETAILED DRILL-DOWN QUERIES
-- If any summary check above returns FAIL or REVIEW, execute the corresponding
-- diagnostic query below to isolate the specific records.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. SALES DRILL-DOWN
-- ----------------------------------------------------------------------------

-- A.1 Sales Subtotal Reconciliation
SELECT
  s.id AS sale_id,
  s.invoice_number,
  s.subtotal AS stored_subtotal,
  si.calc_subtotal,
  ROUND((s.subtotal - si.calc_subtotal)::numeric, 2) AS diff
FROM public.sales s
JOIN (
  SELECT sale_id, SUM(quantity * unit_price) AS calc_subtotal
  FROM public.sale_items GROUP BY sale_id
) si ON si.sale_id = s.id
WHERE ABS(s.subtotal - si.calc_subtotal) > 0.01;

-- A.2 Sales Total Reconciliation (Subtotal - Total Discount + Tax)
SELECT
  s.id AS sale_id,
  s.invoice_number,
  s.total_amount AS stored_total,
  si.calc_total,
  ROUND((s.total_amount - si.calc_total)::numeric, 2) AS diff
FROM public.sales s
JOIN (
  SELECT sale_id, SUM(total_amount) AS calc_total
  FROM public.sale_items GROUP BY sale_id
) si ON si.sale_id = s.id
WHERE ABS(s.total_amount - si.calc_total) > 0.01;

-- A.3 Sales Payments vs Total Amount
SELECT
  s.id AS sale_id,
  s.invoice_number,
  s.status,
  s.total_amount,
  COALESCE(sp.paid_total, 0) AS paid_total,
  ROUND((s.total_amount - COALESCE(sp.paid_total, 0))::numeric, 2) AS diff
FROM public.sales s
LEFT JOIN (
  SELECT sale_id, SUM(amount) AS paid_total
  FROM public.sale_payments GROUP BY sale_id
) sp ON sp.sale_id = s.id
WHERE s.status NOT IN ('VOIDED')
  AND ABS(s.total_amount - COALESCE(sp.paid_total, 0)) > 0.01;

-- A.4 Missing Price or Cost Snapshots on Sale Items
SELECT
  si.id AS sale_item_id,
  si.sale_id,
  si.item_type,
  si.quantity,
  si.unit_price,
  si.cost_price,
  si.total_amount
FROM public.sale_items si
WHERE si.unit_price IS NULL
   OR si.cost_price IS NULL
   OR si.total_amount IS NULL;


-- ----------------------------------------------------------------------------
-- B. COMMISSION DRILL-DOWN
-- ----------------------------------------------------------------------------

-- B.1 Commission Record vs Sale Item Snapshot Mismatch
SELECT
  c.id AS commission_id,
  c.sale_id,
  c.sale_item_id,
  c.employee_id,
  c.commission_amount AS recorded_amount,
  si.commission_amount AS snapshot_amount,
  c.commission_type AS recorded_type,
  si.commission_type AS snapshot_type
FROM public.commissions c
JOIN public.sale_items si ON si.id = c.sale_item_id
WHERE ROUND(COALESCE(c.commission_amount, 0)::numeric, 2) <> ROUND(COALESCE(si.commission_amount, 0)::numeric, 2)
   OR c.commission_type IS DISTINCT FROM si.commission_type;

-- B.2 Commission Rules Invariant Violations (Priority, Dates, Negative Values)
SELECT
  cr.id,
  cr.priority,
  cr.commission_type,
  cr.commission_rate,
  cr.fixed_amount,
  cr.effective_from,
  cr.effective_until,
  cr.is_active
FROM public.commission_rules cr
WHERE cr.priority < 1 OR cr.priority > 8
   OR (cr.effective_until IS NOT NULL AND cr.effective_until < cr.effective_from)
   OR (cr.commission_type = 'PERCENTAGE' AND (cr.commission_rate IS NULL OR cr.commission_rate < 0))
   OR (cr.commission_type = 'FIXED' AND (cr.fixed_amount IS NULL OR cr.fixed_amount < 0));

-- B.3 Inventory of All Active TIERED Commission Rules
SELECT
  cr.id,
  cr.employee_id,
  cr.service_id,
  cr.product_id,
  cr.outlet_id,
  cr.priority,
  cr.commission_rate,
  cr.fixed_amount,
  cr.effective_from,
  cr.effective_until
FROM public.commission_rules cr
WHERE cr.commission_type = 'TIERED';


-- ----------------------------------------------------------------------------
-- C. ACCOUNTING DRILL-DOWN
-- ----------------------------------------------------------------------------

-- C.1 Unbalanced Journal Entries (Debit != Credit)
SELECT
  je.id AS journal_entry_id,
  je.journal_number,
  je.journal_date,
  je.status,
  ROUND(COALESCE(SUM(jl.debit), 0)::numeric, 2) AS total_debit,
  ROUND(COALESCE(SUM(jl.credit), 0)::numeric, 2) AS total_credit,
  ROUND((COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0))::numeric, 2) AS diff
FROM public.journal_entries je
JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
GROUP BY je.id, je.journal_number, je.journal_date, je.status
HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.01;

-- C.2 Posted Journals with Fewer than 2 Lines
SELECT
  je.id AS journal_entry_id,
  je.journal_number,
  je.journal_date,
  je.status,
  COUNT(jl.id) AS line_count
FROM public.journal_entries je
LEFT JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
WHERE je.status = 'POSTED'
GROUP BY je.id, je.journal_number, je.journal_date, je.status
HAVING COUNT(jl.id) < 2;

-- C.3 Completed Sales Without Posted Accounting Journal
SELECT
  s.id AS sale_id,
  s.invoice_number,
  s.total_amount,
  s.sold_at
FROM public.sales s
WHERE s.status = 'COMPLETED'
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_entries je
    WHERE je.reference_type = 'SALE' AND je.reference_id = s.id
      AND je.status = 'POSTED'
  );


-- ----------------------------------------------------------------------------
-- D. INVENTORY DRILL-DOWN
-- ----------------------------------------------------------------------------

-- D.1 Inventory Movement Arithmetic Check (quantity_before + quantity != quantity_after)
SELECT
  im.id AS movement_id,
  im.outlet_id,
  im.product_id,
  im.movement_type,
  im.quantity_before,
  im.quantity,
  im.quantity_after,
  ROUND((im.quantity_before + im.quantity - im.quantity_after)::numeric, 4) AS diff
FROM public.inventory_movements im
WHERE ABS(im.quantity_before + im.quantity - im.quantity_after) > 0.0001;

-- D.2 Discrepancies Between Current Outlet Inventory and Last Movement
WITH last_mov AS (
  SELECT DISTINCT ON (outlet_id, product_id)
    outlet_id, product_id, quantity_after, occurred_at
  FROM public.inventory_movements
  ORDER BY outlet_id, product_id, occurred_at DESC, id DESC
)
SELECT
  oi.outlet_id,
  oi.product_id,
  oi.quantity AS current_stock,
  lm.quantity_after AS last_movement_stock,
  ROUND((oi.quantity - lm.quantity_after)::numeric, 4) AS diff
FROM public.outlet_inventory oi
JOIN last_mov lm ON lm.outlet_id = oi.outlet_id AND lm.product_id = oi.product_id
WHERE ABS(oi.quantity - lm.quantity_after) > 0.0001;

-- D.3 Negative Quantity in Outlet Inventory
SELECT
  oi.outlet_id,
  oi.product_id,
  oi.quantity,
  oi.average_cost
FROM public.outlet_inventory oi
WHERE oi.quantity < 0;

-- D.4 Stock Transfers Missing Either TRANSFER_OUT or TRANSFER_IN
WITH transfer_counts AS (
  SELECT
    reference_id AS transfer_id,
    COUNT(*) FILTER (WHERE movement_type = 'TRANSFER_OUT') AS out_count,
    COUNT(*) FILTER (WHERE movement_type = 'TRANSFER_IN') AS in_count
  FROM public.inventory_movements
  WHERE movement_type IN ('TRANSFER_OUT', 'TRANSFER_IN') AND reference_id IS NOT NULL
  GROUP BY reference_id
)
SELECT
  st.id AS transfer_id,
  st.transfer_number,
  st.status,
  COALESCE(tc.out_count, 0) AS out_movements,
  COALESCE(tc.in_count, 0) AS in_movements
FROM public.stock_transfers st
LEFT JOIN transfer_counts tc ON tc.transfer_id = st.id
WHERE st.status = 'COMPLETED'
  AND (COALESCE(tc.out_count, 0) = 0 OR COALESCE(tc.in_count, 0) = 0);


-- ----------------------------------------------------------------------------
-- E. REFUND DRILL-DOWN
-- ----------------------------------------------------------------------------

-- E.1 Refund Items Exceeding Sold Item Quantity or Total Amount
SELECT
  sr.refund_number,
  si.sale_id,
  sri.sale_item_id,
  si.quantity AS sold_qty,
  SUM(sri.quantity) AS total_refunded_qty,
  si.total_amount AS sold_amount,
  SUM(sri.refund_amount) AS total_refunded_amount
FROM public.sale_refund_items sri
JOIN public.sale_refunds sr ON sr.id = sri.refund_id
JOIN public.sale_items si ON si.id = sri.sale_item_id
WHERE sr.status <> 'CANCELLED'
GROUP BY sr.refund_number, si.sale_id, sri.sale_item_id, si.quantity, si.total_amount
HAVING SUM(sri.quantity) > si.quantity
    OR SUM(sri.refund_amount) > si.total_amount + 0.01;

-- E.2 Premature REFUNDED Status on Partially Refunded Sales
WITH ref_summary AS (
  SELECT sri.sale_item_id, SUM(sri.refund_amount) AS total_ref
  FROM public.sale_refund_items sri
  JOIN public.sale_refunds sr ON sr.id = sri.refund_id
  WHERE sr.status <> 'CANCELLED'
  GROUP BY sri.sale_item_id
),
sale_summary AS (
  SELECT
    si.sale_id,
    SUM(si.total_amount) AS total_sale_amount,
    SUM(COALESCE(rs.total_ref, 0)) AS total_refunded_amount
  FROM public.sale_items si
  LEFT JOIN ref_summary rs ON rs.sale_item_id = si.id
  GROUP BY si.sale_id
)
SELECT
  s.id AS sale_id,
  s.invoice_number,
  s.status AS current_status,
  ss.total_sale_amount,
  ss.total_refunded_amount,
  ROUND((ss.total_sale_amount - ss.total_refunded_amount)::numeric, 2) AS remaining_unrefunded
FROM public.sales s
JOIN sale_summary ss ON ss.sale_id = s.id
WHERE s.status = 'REFUNDED'
  AND ss.total_refunded_amount < ss.total_sale_amount - 0.01;

-- E.3 Refund Payments Mismatch Refund Header Total
SELECT
  sr.id AS refund_id,
  sr.refund_number,
  sr.total_amount AS refund_total,
  COALESCE(SUM(srp.amount), 0) AS payment_alloc_total,
  ROUND((sr.total_amount - COALESCE(SUM(srp.amount), 0))::numeric, 2) AS diff
FROM public.sale_refunds sr
LEFT JOIN public.sale_refund_payments srp ON srp.refund_id = sr.id
WHERE sr.status = 'COMPLETED'
GROUP BY sr.id, sr.refund_number, sr.total_amount
HAVING ABS(sr.total_amount - COALESCE(SUM(srp.amount), 0)) > 0.01;


-- ----------------------------------------------------------------------------
-- F. VOID DRILL-DOWN
-- ----------------------------------------------------------------------------

-- F.1 Voided Sales Missing Reversal Accounting Journal
SELECT
  s.id AS sale_id,
  s.invoice_number,
  s.status,
  s.total_amount
FROM public.sales s
WHERE s.status = 'VOIDED'
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_entries je
    WHERE je.reference_type = 'SALE' AND je.reference_id = s.id
      AND je.description LIKE 'Reversal journal of VOID sale%'
  );

-- F.2 Voided Sales with Active Commissions Still Marked EARNED or PAID
SELECT
  c.id AS commission_id,
  c.sale_id,
  s.invoice_number,
  c.employee_id,
  c.status AS commission_status,
  c.commission_amount
FROM public.commissions c
JOIN public.sales s ON s.id = c.sale_id
WHERE s.status = 'VOIDED' AND c.status != 'VOIDED';


-- ----------------------------------------------------------------------------
-- G. SECURITY & STATIC FUNCTION SOURCE DRILL-DOWN
-- ----------------------------------------------------------------------------

-- G.1 Public SECURITY DEFINER Functions Missing Locked search_path
SELECT
  p.oid::regprocedure AS function_signature,
  p.prosecdef AS is_security_definer,
  array_to_string(p.proconfig, ', ') AS search_path_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef = true
  AND (
    p.proconfig IS NULL
    OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%')
  );

-- G.2 Transactional RPCs Bypassing Central Journal Posting Gate
SELECT
  p.oid::regprocedure AS function_signature,
  CASE
    WHEN pg_get_functiondef(p.oid) ~* '_internal_post_journal_entry\s*\('
    THEN 'PASS: calls _internal_post_journal_entry'
    ELSE 'FAIL: does not route through central posting gate'
  END AS central_gate_check
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('process_pos_sale', 'process_sale_refund', 'void_sale', 'process_stock_adjustment');
