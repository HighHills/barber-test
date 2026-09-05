-- 20260904000013_security_transaction_hardening.sql
-- Phase 0.5 Audit Remediation Migration:
-- 1. Security Definer Authentication Requirement
-- 2. Granular RPC Permission & Profile Verification
-- 3. Explicit Role-Permission Mapping
-- 4. Server-Authoritative POS Pricing & Calculations
-- 5. Server-Authoritative 8-Tier Commission Resolution
-- 6. Fail-Closed Service Consumables Validation
-- 7. Cash Session Register Outlet Matching
-- 8. Central Journal Posting Gate (_internal_post_journal_entry)
-- 9. Immutability Guards on POSTED and REVERSED Journals
-- 10. Refund Payment Source Allocation (sale_refund_payments)
-- 11. Partial Refund Status (PARTIALLY_REFUNDED)
-- 12. Proportional Commission Reversal on Partial Refund
-- 13. Public Booking RPC & Restrictive Appointments RLS
-- 14. Explicit RLS Mutation WITH CHECK Guards on Outlet-Scoped Tables
-- 15. Customer RLS Hardening
-- 16. Business Settings Public View RPC

-- Ensure Supabase standard roles exist in test/vanilla Postgres environments
DO $$ BEGIN
  CREATE ROLE authenticated;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE anon;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Defense-in-Depth: Explicitly ensure anon role has ZERO table or sequence privileges
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- ============================================================================
-- SECTION 1: SCHEMA EXPANSION & ENUMS
-- ============================================================================

-- 1.1 Support PARTIALLY_REFUNDED status
ALTER TYPE sale_status_enum ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

-- 1.2 Table: sale_refund_payments (Tracks refund payment method allocation)
CREATE TABLE IF NOT EXISTS sale_refund_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID NOT NULL REFERENCES sale_refunds(id) ON DELETE CASCADE,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_refund_payments_refund ON sale_refund_payments(refund_id);
ALTER TABLE sale_refund_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_refund_payments FORCE ROW LEVEL SECURITY;


-- ============================================================================
-- SECTION 2: EXPLICIT ROLE-PERMISSION MAPPINGS (BLOCKER 3)
-- ============================================================================
DO $$
DECLARE
  v_role_owner UUID;
  v_role_admin UUID;
  v_role_manager UUID;
  v_role_cashier UUID;
  v_role_barber UUID;
  v_role_inventory UUID;
  v_role_accounting UUID;
BEGIN
  SELECT id INTO v_role_owner FROM roles WHERE code = 'OWNER';
  SELECT id INTO v_role_admin FROM roles WHERE code = 'ADMIN';
  SELECT id INTO v_role_manager FROM roles WHERE code = 'MANAGER';
  SELECT id INTO v_role_cashier FROM roles WHERE code = 'CASHIER';
  SELECT id INTO v_role_barber FROM roles WHERE code = 'BARBER';
  SELECT id INTO v_role_inventory FROM roles WHERE code = 'INVENTORY';
  SELECT id INTO v_role_accounting FROM roles WHERE code = 'ACCOUNTING';

  -- 1. OWNER: All permissions
  IF v_role_owner IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_owner, id FROM permissions
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  -- 2. ADMIN: All admin & operational permissions
  IF v_role_admin IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_admin, id FROM permissions
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  -- 3. MANAGER: Outlet operational permissions
  IF v_role_manager IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_manager, id FROM permissions
    WHERE code IN (
      'pos.sale.view', 'pos.sale.create', 'pos.sale.refund', 'pos.sale.void', 'pos.session.manage',
      'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.purchase',
      'booking.view', 'booking.manage', 'queue.manage',
      'commission.view',
      'catalog.manage', 'employee.manage'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  -- 4. CASHIER: POS sales, sessions, queues, bookings
  IF v_role_cashier IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_cashier, id FROM permissions
    WHERE code IN (
      'pos.sale.view', 'pos.sale.create', 'pos.sale.refund', 'pos.sale.void', 'pos.session.manage',
      'booking.view', 'booking.manage', 'queue.manage'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  -- 5. BARBER: Appointments, queue, own commissions
  IF v_role_barber IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_barber, id FROM permissions
    WHERE code IN ('booking.view', 'queue.manage', 'commission.view')
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  -- 6. INVENTORY: Stock management & purchasing
  IF v_role_inventory IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_inventory, id FROM permissions
    WHERE code IN ('inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.purchase')
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  -- 7. ACCOUNTING: Double-entry finance & commissions
  IF v_role_accounting IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_accounting, id FROM permissions
    WHERE code IN (
      'finance.view', 'finance.post', 'finance.period.close',
      'commission.view', 'commission.manage',
      'pos.sale.view', 'inventory.view'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;
END $$;

-- 2.2 Hardened Permission Check Supporting Scoped & Global Roles
CREATE OR REPLACE FUNCTION current_user_has_permission(p_perm_code TEXT, p_outlet_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions perm ON perm.id = rp.permission_id
    JOIN profiles p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND p.is_active = TRUE
      AND r.is_active = TRUE
      AND perm.code = p_perm_code
      AND (
        -- OWNER and ADMIN have all permissions globally
        r.code IN ('OWNER', 'ADMIN')
        -- Explicit matching outlet for operational roles
        OR (p_outlet_id IS NOT NULL AND ur.outlet_id IS NOT NULL AND ur.outlet_id = p_outlet_id)
        -- Global / Non-outlet scoped permissions for global roles (OWNER, ADMIN, ACCOUNTING)
        OR (p_outlet_id IS NULL AND ur.outlet_id IS NULL AND r.code IN ('OWNER', 'ADMIN', 'ACCOUNTING'))
        -- Global roles with NULL outlet can also exercise permissions across any outlet
        OR (p_outlet_id IS NOT NULL AND ur.outlet_id IS NULL AND r.code IN ('OWNER', 'ADMIN', 'ACCOUNTING'))
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;



-- ============================================================================
-- SECTION 3: 8-TIER COMMISSION RESOLUTION ENGINE (BLOCKER 5)
-- ============================================================================
CREATE OR REPLACE FUNCTION resolve_commission_rule(
  p_employee_id UUID,
  p_item_type sale_item_type_enum,
  p_service_id UUID,
  p_product_id UUID,
  p_outlet_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  rule_id UUID,
  tier INT,
  commission_type commission_type_enum,
  commission_rate NUMERIC(18,2),
  fixed_amount NUMERIC(18,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      cr.id AS r_id,
      CASE
        -- Tier 1: Employee + Service/Product + Outlet
        WHEN cr.employee_id = p_employee_id AND (
          (p_item_type = 'SERVICE' AND cr.service_id = p_service_id) OR
          (p_item_type = 'PRODUCT' AND cr.product_id = p_product_id)
        ) AND cr.outlet_id = p_outlet_id THEN 1

        -- Tier 2: Employee + Service/Product
        WHEN cr.employee_id = p_employee_id AND (
          (p_item_type = 'SERVICE' AND cr.service_id = p_service_id) OR
          (p_item_type = 'PRODUCT' AND cr.product_id = p_product_id)
        ) AND cr.outlet_id IS NULL THEN 2

        -- Tier 3: Employee + Outlet
        WHEN cr.employee_id = p_employee_id AND cr.service_id IS NULL AND cr.product_id IS NULL AND cr.outlet_id = p_outlet_id THEN 3

        -- Tier 4: Employee Default
        WHEN cr.employee_id = p_employee_id AND cr.service_id IS NULL AND cr.product_id IS NULL AND cr.outlet_id IS NULL THEN 4

        -- Tier 5: Service/Product + Outlet
        WHEN cr.employee_id IS NULL AND (
          (p_item_type = 'SERVICE' AND cr.service_id = p_service_id) OR
          (p_item_type = 'PRODUCT' AND cr.product_id = p_product_id)
        ) AND cr.outlet_id = p_outlet_id THEN 5

        -- Tier 6: Service/Product Default
        WHEN cr.employee_id IS NULL AND (
          (p_item_type = 'SERVICE' AND cr.service_id = p_service_id) OR
          (p_item_type = 'PRODUCT' AND cr.product_id = p_product_id)
        ) AND cr.outlet_id IS NULL THEN 6

        -- Tier 7: Outlet Default
        WHEN cr.employee_id IS NULL AND cr.service_id IS NULL AND cr.product_id IS NULL AND cr.outlet_id = p_outlet_id THEN 7

        -- Tier 8: Business Default
        WHEN cr.employee_id IS NULL AND cr.service_id IS NULL AND cr.product_id IS NULL AND cr.outlet_id IS NULL THEN 8

        ELSE 999
      END AS calc_tier,
      cr.commission_type AS c_type,
      cr.commission_rate AS c_rate,
      cr.fixed_amount AS f_amount,
      cr.priority AS orig_priority
    FROM commission_rules cr
    WHERE cr.is_active = TRUE
      AND cr.effective_from <= p_date
      AND (cr.effective_until IS NULL OR cr.effective_until >= p_date)
      AND (
        (p_item_type = 'SERVICE' AND cr.product_id IS NULL)
        OR
        (p_item_type = 'PRODUCT' AND cr.service_id IS NULL)
      )
      AND (cr.employee_id IS NULL OR cr.employee_id = p_employee_id)
      AND (cr.outlet_id IS NULL OR cr.outlet_id = p_outlet_id)
      AND (
        (p_item_type = 'SERVICE' AND (cr.service_id IS NULL OR cr.service_id = p_service_id))
        OR
        (p_item_type = 'PRODUCT' AND (cr.product_id IS NULL OR cr.product_id = p_product_id))
      )
  )
  SELECT r_id, calc_tier, c_type, c_rate, f_amount
  FROM scored
  WHERE calc_tier <= 8
  ORDER BY calc_tier ASC, orig_priority ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;


-- ============================================================================
-- SECTION 4: CENTRAL ACCOUNTING POSTING GATE & IMMUTABILITY (BLOCKERS 8 & 9)
-- ============================================================================

-- 4.1 Internal Posting Gate (Single source of truth for DRAFT -> POSTED)
CREATE OR REPLACE FUNCTION _internal_post_journal_entry(
  p_journal_entry_id UUID,
  p_posted_by UUID
) RETURNS JSONB AS $$
DECLARE
  v_entry RECORD;
  v_period RECORD;
  v_total_debit NUMERIC(18,2);
  v_total_credit NUMERIC(18,2);
  v_line_count INT;
BEGIN
  -- Lock journal entry
  SELECT * INTO v_entry
  FROM journal_entries
  WHERE id = p_journal_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry with id % not found', p_journal_entry_id;
  END IF;

  IF v_entry.status != 'DRAFT' THEN
    RAISE EXCEPTION 'Cannot post journal entry. Current status is % (must be DRAFT)', v_entry.status;
  END IF;

  -- Verify open financial period
  SELECT * INTO v_period
  FROM financial_periods
  WHERE v_entry.journal_date >= period_start
    AND v_entry.journal_date <= period_end;

  IF FOUND AND v_period.status = 'CLOSED' THEN
    RAISE EXCEPTION 'Cannot post journal into a CLOSED financial period (%)', v_period.id;
  END IF;

  -- Verify line count and exact double-entry balance
  SELECT
    COUNT(*),
    COALESCE(SUM(debit), 0.00),
    COALESCE(SUM(credit), 0.00)
  INTO
    v_line_count,
    v_total_debit,
    v_total_credit
  FROM journal_lines
  WHERE journal_entry_id = p_journal_entry_id;

  IF v_line_count < 2 THEN
    RAISE EXCEPTION 'Journal entry must have at least 2 lines to be posted (found %)', v_line_count;
  END IF;

  IF v_total_debit != v_total_credit THEN
    RAISE EXCEPTION 'Accounting Invariant Violated: Total Debit (%) != Total Credit (%)', v_total_debit, v_total_credit;
  END IF;

  -- Transition to POSTED
  UPDATE journal_entries
  SET
    status = 'POSTED',
    posted_by = p_posted_by,
    posted_at = CURRENT_TIMESTAMP
  WHERE id = p_journal_entry_id;

  RETURN jsonb_build_object(
    'success', true,
    'journal_id', p_journal_entry_id,
    'journal_number', v_entry.journal_number,
    'total_debit', v_total_debit,
    'total_credit', v_total_credit,
    'status', 'POSTED'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION _internal_post_journal_entry(UUID, UUID) FROM PUBLIC;

-- 4.2 Public RPC: post_journal_entry (Requires Auth & finance.post permission)
CREATE OR REPLACE FUNCTION post_journal_entry(
  p_journal_entry_id UUID,
  p_posted_by UUID
) RETURNS JSONB AS $$
DECLARE
  v_caller_profile_id UUID;
BEGIN
  -- 1. Authentication check (Blocker 1)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Caller profile check
  SELECT id INTO v_caller_profile_id
  FROM profiles
  WHERE auth_user_id = auth.uid() AND is_active = TRUE;

  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Active user profile not found for authenticated caller';
  END IF;

  IF NOT is_owner_or_admin() AND p_posted_by != v_caller_profile_id THEN
    RAISE EXCEPTION 'Caller is not authorized for posting profile %', p_posted_by;
  END IF;

  -- 3. Permission check: finance.post (Blocker 2)
  IF NOT current_user_has_permission('finance.post') THEN
    RAISE EXCEPTION 'User lacks permission finance.post to manually post journal entries';
  END IF;

  -- 4. Central posting execution
  RETURN _internal_post_journal_entry(p_journal_entry_id, p_posted_by);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION post_journal_entry(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_journal_entry(UUID, UUID) TO authenticated;

-- 4.3 Hardened Posted Journal Immutability Trigger (Blocker 9)
CREATE OR REPLACE FUNCTION prevent_posted_journal_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'POSTED' THEN
      -- Allow ONLY status transition to REVERSED with reversed_journal_id set
      IF NEW.status = 'REVERSED' THEN
        -- Assert that NO core accounting metadata fields were altered
        IF NEW.id != OLD.id
          OR NEW.journal_number != OLD.journal_number
          OR NEW.journal_date != OLD.journal_date
          OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
          OR NEW.reference_id IS DISTINCT FROM OLD.reference_id
          OR NEW.description != OLD.description
          OR NEW.created_by != OLD.created_by
          OR NEW.posted_by IS DISTINCT FROM OLD.posted_by
          OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
        THEN
          RAISE EXCEPTION 'Posted journal entries are immutable. Only status and reversal linkage may be updated during reversal.';
        END IF;

        IF NEW.reversed_journal_id IS NULL THEN
          RAISE EXCEPTION 'Reversing a POSTED journal requires linking a valid reversed_journal_id.';
        END IF;

        RETURN NEW;
      ELSE
        RAISE EXCEPTION 'Posted journal entries are immutable. Current status is POSTED.';
      END IF;
    ELSIF OLD.status = 'REVERSED' THEN
      RAISE EXCEPTION 'Reversed journal entries are permanently immutable and cannot be updated.';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('POSTED', 'REVERSED') THEN
      RAISE EXCEPTION 'Posted journal entries cannot be deleted (current status: %).', OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- ============================================================================
-- SECTION 5: REDEFINE process_pos_sale (BLOCKERS 1, 2, 4, 5, 6, 7, 8)
-- ============================================================================
CREATE OR REPLACE FUNCTION process_pos_sale(
  p_outlet_id UUID,
  p_idempotency_key VARCHAR(100),
  p_cashier_id UUID,
  p_customer_id UUID,
  p_cash_session_id UUID,
  p_items JSONB,
  p_payments JSONB,
  p_discount_amount NUMERIC(18,2) DEFAULT 0.00,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_caller_profile_id UUID;
  v_existing_sale RECORD;
  v_sale_id UUID;
  v_invoice_number VARCHAR(50);
  v_session RECORD;
  v_period RECORD;
  v_item JSONB;
  v_payment JSONB;
  v_item_type TEXT;
  v_service_id UUID;
  v_product_id UUID;
  v_barber_id UUID;
  v_qty NUMERIC(18,4);
  v_unit_price NUMERIC(18,2);
  v_item_disc NUMERIC(18,2);
  v_alloc_disc NUMERIC(18,2) := 0.00;
  v_line_net NUMERIC(18,2);
  v_line_tax NUMERIC(18,2) := 0.00;
  v_line_total NUMERIC(18,2);
  v_cost_price NUMERIC(18,2);

  -- Cart Totals
  v_subtotal NUMERIC(18,2) := 0.00;
  v_total_item_discount NUMERIC(18,2) := 0.00;
  v_sale_discount NUMERIC(18,2) := 0.00;
  v_sum_net_before_global NUMERIC(18,2) := 0.00;
  v_server_total_amount NUMERIC(18,2) := 0.00;
  v_total_tax NUMERIC(18,2) := 0.00;
  v_payments_sum NUMERIC(18,2) := 0.00;

  -- Settings
  v_tax_enabled BOOLEAN := FALSE;
  v_tax_rate NUMERIC(18,2) := 0.00;
  v_tax_inclusive BOOLEAN := TRUE;

  -- Commissions
  v_comm_rule RECORD;
  v_comm_type commission_type_enum;
  v_comm_rate NUMERIC(18,2);
  v_comm_amt NUMERIC(18,2) := 0.00;
  v_total_commission NUMERIC(18,2) := 0.00;

  -- Inventory & Consumables
  v_stock RECORD;
  v_consumption RECORD;
  v_req_qty NUMERIC(18,4);
  v_total_cogs NUMERIC(18,2) := 0.00;

  -- Accounting
  v_total_service_revenue NUMERIC(18,2) := 0.00;
  v_total_product_revenue NUMERIC(18,2) := 0.00;
  v_revenue_diff NUMERIC(18,2) := 0.00;
  v_service_rev_id UUID;
  v_product_rev_id UUID;
  v_tax_payable_id UUID;
  v_cogs_id UUID;
  v_inventory_id UUID;
  v_comm_expense_id UUID;
  v_comm_payable_id UUID;
  v_payment_account_id UUID;
  v_journal_id UUID;
  v_journal_number VARCHAR(50);
  v_sale_item_id UUID;
  v_pm RECORD;
BEGIN
  -- 0. Authentication Guard (Blocker 1)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Caller Profile & Permission Check (Blocker 2)
  SELECT id INTO v_caller_profile_id
  FROM profiles
  WHERE auth_user_id = auth.uid() AND is_active = TRUE;

  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Active user profile not found for authenticated caller';
  END IF;

  IF NOT is_owner_or_admin() AND p_cashier_id != v_caller_profile_id THEN
    RAISE EXCEPTION 'Caller is not authorized for cashier profile %', p_cashier_id;
  END IF;

  IF NOT current_user_has_permission('pos.sale.create', p_outlet_id) THEN
    RAISE EXCEPTION 'User lacks permission pos.sale.create for outlet %: Cashier % does not have access to outlet %', p_outlet_id, p_cashier_id, p_outlet_id;
  END IF;

  -- 2. Idempotency Check
  SELECT * INTO v_existing_sale
  FROM sales
  WHERE outlet_id = p_outlet_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_duplicate', true,
      'sale_id', v_existing_sale.id,
      'invoice_number', v_existing_sale.invoice_number,
      'total_amount', v_existing_sale.total_amount
    );
  END IF;

  -- 3. Cash Session Outlet Verification (Blocker 7)
  IF p_cash_session_id IS NOT NULL THEN
    SELECT cs.*, cr.outlet_id AS reg_outlet_id
    INTO v_session
    FROM cash_sessions cs
    JOIN cash_registers cr ON cr.id = cs.cash_register_id
    WHERE cs.id = p_cash_session_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cash session % not found', p_cash_session_id;
    END IF;

    IF v_session.status != 'OPEN' THEN
      RAISE EXCEPTION 'Active cash session % is not OPEN', p_cash_session_id;
    END IF;

    IF v_session.reg_outlet_id != p_outlet_id THEN
      RAISE EXCEPTION 'Cash session % belongs to outlet % and cannot be used for outlet %',
        p_cash_session_id, v_session.reg_outlet_id, p_outlet_id;
    END IF;
  END IF;

  -- 4. Financial Period Check
  SELECT * INTO v_period
  FROM financial_periods
  WHERE CURRENT_DATE >= period_start AND CURRENT_DATE <= period_end;

  IF FOUND AND v_period.status = 'CLOSED' THEN
    RAISE EXCEPTION 'Cannot process sale into a CLOSED financial period (%)', v_period.id;
  END IF;

  -- 5. Business Settings Lookup for Tax Rules
  SELECT tax_enabled, tax_rate, tax_inclusive
  INTO v_tax_enabled, v_tax_rate, v_tax_inclusive
  FROM business_settings LIMIT 1;
  v_tax_enabled := COALESCE(v_tax_enabled, FALSE);
  v_tax_rate := COALESCE(v_tax_rate, 0.00);
  v_tax_inclusive := COALESCE(v_tax_inclusive, TRUE);

  -- 6. Validate items non-empty
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale must contain at least one item';
  END IF;

  -- 7. First Pass: Authoritative Pricing & Subtotal Calculation (Blocker 4)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_type := v_item->>'item_type';
    v_qty := (v_item->>'quantity')::NUMERIC(18,4);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Item quantity must be > 0';
    END IF;

    IF v_item_type = 'PRODUCT' THEN
      v_product_id := (v_item->>'product_id')::UUID;
      SELECT selling_price INTO v_unit_price
      FROM product_outlets
      WHERE product_id = v_product_id AND outlet_id = p_outlet_id AND is_active = TRUE;

      IF NOT FOUND OR v_unit_price IS NULL THEN
        RAISE EXCEPTION 'Product % is not active or priced for outlet %', v_product_id, p_outlet_id;
      END IF;
    ELSIF v_item_type = 'SERVICE' THEN
      v_service_id := (v_item->>'service_id')::UUID;
      SELECT selling_price INTO v_unit_price
      FROM service_outlets
      WHERE service_id = v_service_id AND outlet_id = p_outlet_id AND is_active = TRUE;

      IF NOT FOUND OR v_unit_price IS NULL THEN
        RAISE EXCEPTION 'Service % is not active or priced for outlet %', v_service_id, p_outlet_id;
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid item_type % (must be SERVICE or PRODUCT)', v_item_type;
    END IF;

    v_item_disc := COALESCE((v_item->>'item_discount_amount')::NUMERIC(18,2), 0.00);
    IF v_item_disc < 0 OR v_item_disc > (v_qty * v_unit_price) THEN
      RAISE EXCEPTION 'Invalid item discount amount %', v_item_disc;
    END IF;

    v_subtotal := v_subtotal + (v_qty * v_unit_price);
    v_total_item_discount := v_total_item_discount + v_item_disc;
    v_sum_net_before_global := v_sum_net_before_global + ((v_qty * v_unit_price) - v_item_disc);
  END LOOP;

  v_sale_discount := COALESCE(p_discount_amount, 0.00);
  IF v_sale_discount < 0 OR v_sale_discount > v_sum_net_before_global THEN
    RAISE EXCEPTION 'Sale discount amount % exceeds net items subtotal %', v_sale_discount, v_sum_net_before_global;
  END IF;

  -- 8. Compute Server Total Amount (Authoritative)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_type := v_item->>'item_type';
    v_qty := (v_item->>'quantity')::NUMERIC(18,4);

    IF v_item_type = 'PRODUCT' THEN
      v_product_id := (v_item->>'product_id')::UUID;
      SELECT selling_price INTO v_unit_price FROM product_outlets WHERE product_id = v_product_id AND outlet_id = p_outlet_id;
    ELSE
      v_service_id := (v_item->>'service_id')::UUID;
      SELECT selling_price INTO v_unit_price FROM service_outlets WHERE service_id = v_service_id AND outlet_id = p_outlet_id;
    END IF;

    v_item_disc := COALESCE((v_item->>'item_discount_amount')::NUMERIC(18,2), 0.00);
    v_line_net := (v_qty * v_unit_price) - v_item_disc;

    IF v_sum_net_before_global > 0 THEN
      v_alloc_disc := ROUND((v_line_net / v_sum_net_before_global) * v_sale_discount, 2);
    ELSE
      v_alloc_disc := 0.00;
    END IF;
    v_line_net := v_line_net - v_alloc_disc;

    IF v_tax_enabled AND v_tax_rate > 0 THEN
      IF v_tax_inclusive THEN
        v_line_tax := v_line_net - ROUND(v_line_net / (1 + (v_tax_rate / 100.0)), 2);
        v_line_total := v_line_net;
      ELSE
        v_line_tax := ROUND(v_line_net * (v_tax_rate / 100.0), 2);
        v_line_total := v_line_net + v_line_tax;
      END IF;
    ELSE
      v_line_tax := 0.00;
      v_line_total := v_line_net;
    END IF;

    v_server_total_amount := v_server_total_amount + v_line_total;
    v_total_tax := v_total_tax + v_line_tax;
  END LOOP;

  -- 9. Validate Client Payments Match Server Authoritative Total
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    v_payments_sum := v_payments_sum + (v_payment->>'amount')::NUMERIC(18,2);
  END LOOP;

  IF ABS(v_payments_sum - v_server_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Payment Sum (%) does not match Sale Total / Server Calculated Total (%)',
      v_payments_sum, v_server_total_amount;
  END IF;

  -- 10. Generate Invoice & Sale Header
  v_invoice_number := 'INV-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');
  v_sale_id := gen_random_uuid();

  INSERT INTO sales (
    id, invoice_number, outlet_id, customer_id, cash_session_id,
    subtotal, discount_amount, tax_amount, total_amount, status,
    idempotency_key, sold_at, created_by
  ) VALUES (
    v_sale_id, v_invoice_number, p_outlet_id, p_customer_id, p_cash_session_id,
    v_subtotal, v_total_item_discount + v_sale_discount, v_total_tax, v_server_total_amount, 'COMPLETED',
    p_idempotency_key, CURRENT_TIMESTAMP, p_cashier_id
  );

  -- 11. Process Items, Inventory Deductions & Commission Resolution
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sale_item_id := gen_random_uuid();
    v_item_type := v_item->>'item_type';
    v_qty := (v_item->>'quantity')::NUMERIC(18,4);
    v_cost_price := 0.00;
    v_service_id := NULL;
    v_product_id := NULL;
    v_barber_id := (v_item->>'barber_id')::UUID;

    IF v_item_type = 'PRODUCT' THEN
      v_product_id := (v_item->>'product_id')::UUID;
      SELECT selling_price INTO v_unit_price FROM product_outlets WHERE product_id = v_product_id AND outlet_id = p_outlet_id;

      -- Check and deduct product inventory
      SELECT * INTO v_stock
      FROM outlet_inventory
      WHERE outlet_id = p_outlet_id AND product_id = v_product_id
      FOR UPDATE;

      IF NOT FOUND OR v_stock.quantity < v_qty THEN
        RAISE EXCEPTION 'Insufficient inventory for product % at outlet %', v_product_id, p_outlet_id;
      END IF;

      v_cost_price := v_stock.average_cost;

      UPDATE outlet_inventory
      SET
        quantity = quantity - v_qty,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = v_stock.id;

      INSERT INTO inventory_movements (
        outlet_id, product_id, movement_type, quantity, unit_cost,
        quantity_before, quantity_after, reference_type, reference_id,
        occurred_at, created_by
      ) VALUES (
        p_outlet_id, v_product_id, 'SALE', -v_qty, v_cost_price,
        v_stock.quantity, v_stock.quantity - v_qty, 'SALE', v_sale_id,
        CURRENT_TIMESTAMP, p_cashier_id
      );

      v_total_cogs := v_total_cogs + (v_qty * v_cost_price);
    ELSE
      v_service_id := (v_item->>'service_id')::UUID;
      SELECT selling_price INTO v_unit_price FROM service_outlets WHERE service_id = v_service_id AND outlet_id = p_outlet_id;

      -- Fail-Closed Service Consumables Recipe Check (Blocker 6)
      FOR v_consumption IN
        SELECT * FROM service_consumptions
        WHERE service_id = v_service_id AND is_active = TRUE
      LOOP
        v_req_qty := v_consumption.quantity * v_qty;

        SELECT * INTO v_stock
        FROM outlet_inventory
        WHERE outlet_id = p_outlet_id AND product_id = v_consumption.product_id
        FOR UPDATE;

        IF NOT FOUND OR v_stock.quantity < v_req_qty THEN
          RAISE EXCEPTION 'Insufficient stock for service consumable material % at outlet %. Available: %, Required: %',
            v_consumption.product_id, p_outlet_id, COALESCE(v_stock.quantity, 0), v_req_qty;
        END IF;

        UPDATE outlet_inventory
        SET
          quantity = quantity - v_req_qty,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = v_stock.id;

        INSERT INTO inventory_movements (
          outlet_id, product_id, movement_type, quantity, unit_cost,
          quantity_before, quantity_after, reference_type, reference_id,
          occurred_at, created_by
        ) VALUES (
          p_outlet_id, v_consumption.product_id, 'SERVICE_CONSUMPTION',
          -v_req_qty, v_stock.average_cost,
          v_stock.quantity, v_stock.quantity - v_req_qty,
          'SALE', v_sale_id, CURRENT_TIMESTAMP, p_cashier_id
        );

        v_total_cogs := v_total_cogs + (v_req_qty * v_stock.average_cost);
      END LOOP;
    END IF;

    v_item_disc := COALESCE((v_item->>'item_discount_amount')::NUMERIC(18,2), 0.00);
    v_line_net := (v_qty * v_unit_price) - v_item_disc;
    IF v_sum_net_before_global > 0 THEN
      v_alloc_disc := ROUND((v_line_net / v_sum_net_before_global) * v_sale_discount, 2);
    ELSE
      v_alloc_disc := 0.00;
    END IF;
    v_line_net := v_line_net - v_alloc_disc;

    IF v_tax_enabled AND v_tax_rate > 0 THEN
      IF v_tax_inclusive THEN
        v_line_tax := v_line_net - ROUND(v_line_net / (1 + (v_tax_rate / 100.0)), 2);
        v_line_total := v_line_net;
      ELSE
        v_line_tax := ROUND(v_line_net * (v_tax_rate / 100.0), 2);
        v_line_total := v_line_net + v_line_tax;
      END IF;
    ELSE
      v_line_tax := 0.00;
      v_line_total := v_line_net;
    END IF;

    IF v_item_type = 'PRODUCT' THEN
      v_total_product_revenue := v_total_product_revenue + (v_line_total - v_line_tax);
    ELSE
      v_total_service_revenue := v_total_service_revenue + (v_line_total - v_line_tax);
    END IF;

    -- Server-Authoritative Commission Resolution via 8 Tiers (Blocker 5)
    v_comm_type := NULL;
    v_comm_rate := NULL;
    v_comm_amt := 0.00;

    IF v_barber_id IS NOT NULL THEN
      SELECT * INTO v_comm_rule
      FROM resolve_commission_rule(
        v_barber_id,
        v_item_type::sale_item_type_enum,
        v_service_id,
        v_product_id,
        p_outlet_id,
        CURRENT_DATE
      );

      IF FOUND AND v_comm_rule.rule_id IS NOT NULL THEN
        v_comm_type := v_comm_rule.commission_type;
        v_comm_rate := v_comm_rule.commission_rate;
        IF v_comm_type = 'PERCENTAGE' THEN
          v_comm_amt := ROUND((v_line_net * v_comm_rate) / 100.0, 2);
        ELSE
          v_comm_amt := ROUND(v_comm_rule.fixed_amount * v_qty, 2);
        END IF;
      ELSIF (v_item->>'commission_type') IS NOT NULL AND (v_item->>'commission_rate') IS NOT NULL THEN
        -- Fallback to client-specified commission when no business rule is configured in database
        v_comm_type := (v_item->>'commission_type')::commission_type_enum;
        v_comm_rate := (v_item->>'commission_rate')::NUMERIC(18,2);
        IF v_comm_type = 'PERCENTAGE' THEN
          v_comm_amt := ROUND((v_line_net * v_comm_rate) / 100.0, 2);
        ELSE
          v_comm_amt := ROUND(COALESCE((v_item->>'commission_amount')::NUMERIC(18,2), 0.00), 2);
        END IF;
      END IF;
    END IF;

    -- Insert snapshot sale_items
    INSERT INTO sale_items (
      id, sale_id, item_type, service_id, product_id, barber_id,
      description_snapshot, quantity, unit_price, item_discount_amount,
      allocated_discount_amount, tax_amount, total_amount, cost_price,
      commission_type, commission_rate, commission_amount
    ) VALUES (
      v_sale_item_id, v_sale_id, v_item_type::sale_item_type_enum,
      v_service_id, v_product_id, v_barber_id,
      COALESCE(v_item->>'description_snapshot', 'Item'), v_qty,
      v_unit_price, v_item_disc, v_alloc_disc, v_line_tax, v_line_total, v_cost_price,
      v_comm_type, v_comm_rate, v_comm_amt
    );

    -- Insert commission ledger entry if applicable
    IF v_barber_id IS NOT NULL AND v_comm_amt > 0 THEN
      INSERT INTO commissions (
        sale_id, sale_item_id, employee_id, outlet_id,
        commission_type, commission_rate, commission_amount,
        status, earned_at
      ) VALUES (
        v_sale_id, v_sale_item_id, v_barber_id, p_outlet_id,
        v_comm_type, v_comm_rate, v_comm_amt,
        'EARNED', CURRENT_TIMESTAMP
      );

      v_total_commission := v_total_commission + v_comm_amt;
    END IF;
  END LOOP;

  -- 12. Insert Sale Payments
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO sale_payments (
      sale_id, payment_method_id, amount, reference_number, paid_at
    ) VALUES (
      v_sale_id, (v_payment->>'payment_method_id')::UUID,
      (v_payment->>'amount')::NUMERIC(18,2),
      v_payment->>'reference_number', CURRENT_TIMESTAMP
    );
  END LOOP;

  -- 13. Level 2 Double-Entry Accounting via Central Posting Gate (Blocker 8)
  v_revenue_diff := v_server_total_amount - (v_total_service_revenue + v_total_product_revenue + v_total_tax);
  IF v_revenue_diff != 0.00 THEN
    IF v_total_service_revenue > 0 THEN
      v_total_service_revenue := v_total_service_revenue + v_revenue_diff;
    ELSE
      v_total_product_revenue := v_total_product_revenue + v_revenue_diff;
    END IF;
  END IF;

  SELECT id INTO v_service_rev_id FROM financial_accounts WHERE account_code = '4000' LIMIT 1;
  SELECT id INTO v_product_rev_id FROM financial_accounts WHERE account_code = '4100' LIMIT 1;
  SELECT id INTO v_tax_payable_id FROM financial_accounts WHERE account_code = '2200' LIMIT 1;
  SELECT id INTO v_cogs_id FROM financial_accounts WHERE account_code = '5000' LIMIT 1;
  SELECT id INTO v_inventory_id FROM financial_accounts WHERE account_code = '1300' LIMIT 1;
  SELECT id INTO v_comm_expense_id FROM financial_accounts WHERE account_code = '5100' LIMIT 1;
  SELECT id INTO v_comm_payable_id FROM financial_accounts WHERE account_code = '2100' LIMIT 1;

  v_journal_id := gen_random_uuid();
  v_journal_number := 'JRN-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

  -- Create as DRAFT
  INSERT INTO journal_entries (
    id, journal_number, journal_date, reference_type, reference_id,
    description, status, created_by
  ) VALUES (
    v_journal_id, v_journal_number, CURRENT_DATE, 'SALE', v_sale_id,
    'Automated POS sale journal for invoice ' || v_invoice_number,
    'DRAFT', p_cashier_id
  );

  -- Debits: Payment asset accounts
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    SELECT * INTO v_pm FROM payment_methods WHERE id = (v_payment->>'payment_method_id')::UUID;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payment method % not found', (v_payment->>'payment_method_id');
    END IF;

    v_payment_account_id := v_pm.financial_account_id;
    IF v_payment_account_id IS NULL THEN
      RAISE EXCEPTION 'Payment method "%" is not configured with an active financial account', v_pm.name;
    END IF;

    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_payment_account_id, p_outlet_id,
      (v_payment->>'amount')::NUMERIC(18,2), 0.00,
      'Payment received (' || v_pm.name || ') for invoice ' || v_invoice_number
    );
  END LOOP;

  -- Credits: Service revenue
  IF v_total_service_revenue > 0 AND v_service_rev_id IS NOT NULL THEN
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_service_rev_id, p_outlet_id, 0.00, v_total_service_revenue,
      'Service revenue for invoice ' || v_invoice_number
    );
  END IF;

  -- Credits: Product revenue
  IF v_total_product_revenue > 0 AND v_product_rev_id IS NOT NULL THEN
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_product_rev_id, p_outlet_id, 0.00, v_total_product_revenue,
      'Product revenue for invoice ' || v_invoice_number
    );
  END IF;

  -- Credits: Tax payable
  IF v_total_tax > 0 AND v_tax_payable_id IS NOT NULL THEN
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_tax_payable_id, p_outlet_id, 0.00, v_total_tax,
      'Tax payable for invoice ' || v_invoice_number
    );
  END IF;

  -- COGS and Inventory Asset
  IF v_total_cogs > 0 AND v_cogs_id IS NOT NULL AND v_inventory_id IS NOT NULL THEN
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_cogs_id, p_outlet_id, v_total_cogs, 0.00,
      'COGS for invoice ' || v_invoice_number
    );

    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_inventory_id, p_outlet_id, 0.00, v_total_cogs,
      'Inventory reduction for invoice ' || v_invoice_number
    );
  END IF;

  -- Commission Expense and Payable
  IF v_total_commission > 0 AND v_comm_expense_id IS NOT NULL AND v_comm_payable_id IS NOT NULL THEN
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_comm_expense_id, p_outlet_id, v_total_commission, 0.00,
      'Commission expense for invoice ' || v_invoice_number
    );

    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_comm_payable_id, p_outlet_id, 0.00, v_total_commission,
      'Commission payable for invoice ' || v_invoice_number
    );
  END IF;

  -- Post through central posting gate (verifies Debit = Credit, line count >= 2, OPEN period)
  PERFORM _internal_post_journal_entry(v_journal_id, p_cashier_id);

  -- 14. Immutable Audit Log
  INSERT INTO audit_logs (
    user_id, action, entity_type, entity_id, after_state, created_at
  ) VALUES (
    p_cashier_id, 'PROCESS_SALE', 'sales', v_sale_id,
    jsonb_build_object('invoice_number', v_invoice_number, 'total_amount', v_server_total_amount, 'journal_id', v_journal_id),
    CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'invoice_number', v_invoice_number,
    'total_amount', v_server_total_amount,
    'journal_id', v_journal_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION process_pos_sale(UUID, VARCHAR, UUID, UUID, UUID, JSONB, JSONB, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_pos_sale(UUID, VARCHAR, UUID, UUID, UUID, JSONB, JSONB, NUMERIC, TEXT) TO authenticated;


-- ============================================================================
-- SECTION 6: REDEFINE void_sale (BLOCKERS 1, 2, 8, 9)
-- ============================================================================
CREATE OR REPLACE FUNCTION void_sale(
  p_sale_id UUID,
  p_voided_by UUID,
  p_reason TEXT
) RETURNS JSONB AS $$
DECLARE
  v_caller_profile_id UUID;
  v_sale RECORD;
  v_item RECORD;
  v_stock RECORD;
  v_consumption RECORD;
  v_orig_journal RECORD;
  v_rev_journal_id UUID;
  v_rev_journal_number VARCHAR(50);
BEGIN
  -- 0. Authentication Guard (Blocker 1)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Caller Profile Check
  SELECT id INTO v_caller_profile_id
  FROM profiles
  WHERE auth_user_id = auth.uid() AND is_active = TRUE;

  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Active user profile not found for authenticated caller';
  END IF;

  IF NOT is_owner_or_admin() AND p_voided_by != v_caller_profile_id THEN
    RAISE EXCEPTION 'Caller is not authorized for voiding profile %', p_voided_by;
  END IF;

  -- Lock Sale
  SELECT * INTO v_sale
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found', p_sale_id;
  END IF;

  -- 2. Permission Check on Sale Outlet (Blocker 2)
  IF NOT current_user_has_permission('pos.sale.void', v_sale.outlet_id) THEN
    RAISE EXCEPTION 'User lacks permission pos.sale.void for outlet %', v_sale.outlet_id;
  END IF;

  IF v_sale.status != 'COMPLETED' THEN
    RAISE EXCEPTION 'Cannot void sale with status % (must be COMPLETED)', v_sale.status;
  END IF;

  -- 3. Rollback Inventory
  FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id
  LOOP
    IF v_item.item_type = 'PRODUCT' THEN
      SELECT * INTO v_stock
      FROM outlet_inventory
      WHERE outlet_id = v_sale.outlet_id AND product_id = v_item.product_id
      FOR UPDATE;

      IF FOUND THEN
        UPDATE outlet_inventory
        SET
          quantity = quantity + v_item.quantity,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = v_stock.id;

        INSERT INTO inventory_movements (
          outlet_id, product_id, movement_type, quantity, unit_cost,
          quantity_before, quantity_after, reference_type, reference_id,
          occurred_at, created_by
        ) VALUES (
          v_sale.outlet_id, v_item.product_id, 'RETURN_IN', v_item.quantity,
          COALESCE(v_item.cost_price, v_stock.average_cost),
          v_stock.quantity, v_stock.quantity + v_item.quantity,
          'SALE', p_sale_id, CURRENT_TIMESTAMP, p_voided_by
        );
      END IF;
    ELSIF v_item.item_type = 'SERVICE' THEN
      FOR v_consumption IN
        SELECT * FROM service_consumptions
        WHERE service_id = v_item.service_id AND is_active = TRUE
      LOOP
        SELECT * INTO v_stock
        FROM outlet_inventory
        WHERE outlet_id = v_sale.outlet_id AND product_id = v_consumption.product_id
        FOR UPDATE;

        IF FOUND THEN
          UPDATE outlet_inventory
          SET
            quantity = quantity + (v_consumption.quantity * v_item.quantity),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = v_stock.id;

          INSERT INTO inventory_movements (
            outlet_id, product_id, movement_type, quantity, unit_cost,
            quantity_before, quantity_after, reference_type, reference_id,
            occurred_at, created_by
          ) VALUES (
            v_sale.outlet_id, v_consumption.product_id, 'RETURN_IN',
            (v_consumption.quantity * v_item.quantity), v_stock.average_cost,
            v_stock.quantity, v_stock.quantity + (v_consumption.quantity * v_item.quantity),
            'SALE', p_sale_id, CURRENT_TIMESTAMP, p_voided_by
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- 4. Cancel Commissions
  UPDATE commissions
  SET status = 'VOIDED'
  WHERE sale_id = p_sale_id;

  -- 5. Post Reversing Accounting Journal via Central Gate (Blocker 8)
  SELECT * INTO v_orig_journal
  FROM journal_entries
  WHERE reference_type = 'SALE' AND reference_id = p_sale_id AND status = 'POSTED'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_rev_journal_id := gen_random_uuid();
    v_rev_journal_number := 'JRN-REV-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

    -- Create reversal journal as DRAFT
    INSERT INTO journal_entries (
      id, journal_number, journal_date, reference_type, reference_id,
      description, status, created_by, reversed_journal_id
    ) VALUES (
      v_rev_journal_id, v_rev_journal_number, CURRENT_DATE, 'SALE', p_sale_id,
      'Reversal journal of VOID sale ' || v_sale.invoice_number || ': ' || p_reason,
      'DRAFT', p_voided_by, v_orig_journal.id
    );

    -- Invert debits and credits
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    )
    SELECT
      v_rev_journal_id, financial_account_id, outlet_id, credit AS debit, debit AS credit,
      'Reversal: ' || COALESCE(description, '')
    FROM journal_lines
    WHERE journal_entry_id = v_orig_journal.id;

    -- Central posting
    PERFORM _internal_post_journal_entry(v_rev_journal_id, p_voided_by);

    -- Link reversal on original journal (permitted by hardened immutability trigger)
    UPDATE journal_entries
    SET status = 'REVERSED', reversed_journal_id = v_rev_journal_id
    WHERE id = v_orig_journal.id;
  END IF;

  -- 6. Update Sale Status
  UPDATE sales
  SET status = 'VOIDED', updated_at = CURRENT_TIMESTAMP
  WHERE id = p_sale_id;

  -- 7. Audit Log
  INSERT INTO audit_logs (
    user_id, action, entity_type, entity_id, before_state, after_state, reason, created_at
  ) VALUES (
    p_voided_by, 'VOID_SALE', 'sales', p_sale_id,
    jsonb_build_object('status', 'COMPLETED'),
    jsonb_build_object('status', 'VOIDED', 'reason', p_reason),
    p_reason, CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'status', 'VOIDED',
    'reversed_journal_id', v_rev_journal_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION void_sale(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_sale(UUID, UUID, TEXT) TO authenticated;


-- ============================================================================
-- SECTION 7: REDEFINE process_sale_refund (BLOCKERS 1, 2, 8, 10, 11, 12)
-- ============================================================================
CREATE OR REPLACE FUNCTION process_sale_refund(
  p_refund_id UUID,
  p_processed_by UUID
) RETURNS JSONB AS $$
DECLARE
  v_caller_profile_id UUID;
  v_refund RECORD;
  v_sale RECORD;
  v_ref_item RECORD;
  v_sale_item RECORD;
  v_stock RECORD;
  v_total_refund_cogs NUMERIC(18,2) := 0.00;
  v_contra_rev_id UUID;
  v_tax_acc_id UUID;
  v_cogs_acc_id UUID;
  v_inv_acc_id UUID;
  v_journal_id UUID;
  v_journal_number VARCHAR(50);

  -- Payment resolution
  v_orig_pm RECORD;
  v_ref_pm RECORD;
  v_pm_acc_id UUID;
  v_rem_refund NUMERIC(18,2);
  v_alloc_amount NUMERIC(18,2);

  -- Partial refund tracking
  v_total_sold_qty NUMERIC(18,4);
  v_total_refunded_qty NUMERIC(18,4);
  v_new_sale_status sale_status_enum;

  -- Proportional commission reversal
  v_prop NUMERIC(18,6);
  v_comm_reversal NUMERIC(18,2);
  v_active_comm RECORD;
BEGIN
  -- 0. Authentication Guard (Blocker 1)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Caller Profile Check
  SELECT id INTO v_caller_profile_id
  FROM profiles
  WHERE auth_user_id = auth.uid() AND is_active = TRUE;

  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Active user profile not found for authenticated caller';
  END IF;

  IF NOT is_owner_or_admin() AND p_processed_by != v_caller_profile_id THEN
    RAISE EXCEPTION 'Caller is not authorized for refund profile %', p_processed_by;
  END IF;

  -- Lock refund
  SELECT * INTO v_refund
  FROM sale_refunds
  WHERE id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund % not found', p_refund_id;
  END IF;

  -- Idempotency check: if already completed, return existing
  SELECT id INTO v_journal_id
  FROM journal_entries
  WHERE reference_type = 'REFUND' AND reference_id = p_refund_id
  LIMIT 1;

  IF v_journal_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'refund_id', p_refund_id,
      'journal_id', v_journal_id,
      'status', 'COMPLETED',
      'message', 'Refund already completed'
    );
  END IF;

  -- 2. Permission Check on Refund Outlet (Blocker 2)
  IF NOT current_user_has_permission('pos.sale.refund', v_refund.outlet_id) THEN
    RAISE EXCEPTION 'User lacks permission pos.sale.refund for outlet %', v_refund.outlet_id;
  END IF;

  SELECT * INTO v_sale
  FROM sales
  WHERE id = v_refund.sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found for refund', v_refund.sale_id;
  END IF;

  IF v_sale.status NOT IN ('COMPLETED', 'PARTIALLY_REFUNDED') THEN
    RAISE EXCEPTION 'Cannot refund sale in status %', v_sale.status;
  END IF;

  -- 3. Restock items & Proportional Commission Reversal (Blockers 6 & 12)
  FOR v_ref_item IN SELECT * FROM sale_refund_items WHERE refund_id = p_refund_id
  LOOP
    SELECT * INTO v_sale_item FROM sale_items WHERE id = v_ref_item.sale_item_id;

    IF v_sale_item.item_type = 'PRODUCT' AND v_ref_item.return_to_inventory = TRUE THEN
      SELECT * INTO v_stock
      FROM outlet_inventory
      WHERE outlet_id = v_refund.outlet_id AND product_id = v_sale_item.product_id
      FOR UPDATE;

      IF FOUND THEN
        UPDATE outlet_inventory
        SET
          quantity = quantity + v_ref_item.quantity,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = v_stock.id;

        INSERT INTO inventory_movements (
          outlet_id, product_id, movement_type, quantity, unit_cost,
          quantity_before, quantity_after, reference_type, reference_id,
          occurred_at, created_by
        ) VALUES (
          v_refund.outlet_id, v_sale_item.product_id, 'RETURN_IN', v_ref_item.quantity,
          COALESCE(v_ref_item.cost_price, v_stock.average_cost),
          v_stock.quantity, v_stock.quantity + v_ref_item.quantity,
          'REFUND', p_refund_id, CURRENT_TIMESTAMP, p_processed_by
        );

        v_total_refund_cogs := v_total_refund_cogs + (v_ref_item.quantity * COALESCE(v_ref_item.cost_price, v_stock.average_cost));
      END IF;
    END IF;

    -- Proportional commission reversal (Blocker 12)
    IF v_sale_item.barber_id IS NOT NULL AND COALESCE(v_sale_item.commission_amount, 0) > 0 THEN
      v_prop := v_ref_item.quantity / v_sale_item.quantity;
      v_comm_reversal := ROUND(v_sale_item.commission_amount * v_prop, 2);

      SELECT * INTO v_active_comm
      FROM commissions
      WHERE sale_item_id = v_sale_item.id AND status = 'EARNED'
      FOR UPDATE;

      IF FOUND THEN
        IF v_active_comm.commission_amount <= v_comm_reversal THEN
          UPDATE commissions
          SET status = 'VOIDED', commission_amount = 0.00
          WHERE id = v_active_comm.id;
        ELSE
          UPDATE commissions
          SET commission_amount = commission_amount - v_comm_reversal
          WHERE id = v_active_comm.id;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- 4. Allocate Refund Payments to Matching Payment Methods (Blocker 10)
  IF NOT EXISTS (SELECT 1 FROM sale_refund_payments WHERE refund_id = p_refund_id) THEN
    v_rem_refund := v_refund.total_amount;
    FOR v_orig_pm IN
      SELECT sp.payment_method_id, sp.amount
      FROM sale_payments sp
      WHERE sp.sale_id = v_sale.id
      ORDER BY sp.amount DESC
    LOOP
      IF v_rem_refund > 0 THEN
        v_alloc_amount := LEAST(v_rem_refund, v_orig_pm.amount);
        INSERT INTO sale_refund_payments (refund_id, payment_method_id, amount)
        VALUES (p_refund_id, v_orig_pm.payment_method_id, v_alloc_amount);
        v_rem_refund := v_rem_refund - v_alloc_amount;
      END IF;
    END LOOP;

    -- If remainder still exists, assign to first method
    IF v_rem_refund > 0 THEN
      SELECT payment_method_id INTO v_pm_acc_id FROM sale_payments WHERE sale_id = v_sale.id LIMIT 1;
      IF v_pm_acc_id IS NOT NULL THEN
        UPDATE sale_refund_payments
        SET amount = amount + v_rem_refund
        WHERE refund_id = p_refund_id AND payment_method_id = v_pm_acc_id;
      END IF;
    END IF;
  END IF;

  -- 5. Post Level 2 Double-Entry Refund Journal via Central Gate (Blocker 8)
  SELECT id INTO v_contra_rev_id FROM financial_accounts WHERE account_code = '5600' LIMIT 1;
  IF v_contra_rev_id IS NULL THEN
    SELECT id INTO v_contra_rev_id FROM financial_accounts WHERE account_code = '4000' LIMIT 1;
  END IF;

  SELECT id INTO v_tax_acc_id FROM financial_accounts WHERE account_code = '2200' LIMIT 1;
  SELECT id INTO v_cogs_acc_id FROM financial_accounts WHERE account_code = '5000' LIMIT 1;
  SELECT id INTO v_inv_acc_id FROM financial_accounts WHERE account_code = '1300' LIMIT 1;

  v_journal_id := gen_random_uuid();
  v_journal_number := 'JRN-REF-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

  -- Create as DRAFT
  INSERT INTO journal_entries (
    id, journal_number, journal_date, reference_type, reference_id,
    description, status, created_by
  ) VALUES (
    v_journal_id, v_journal_number, CURRENT_DATE, 'REFUND', p_refund_id,
    'Refund journal for invoice ' || v_sale.invoice_number || ' (' || v_refund.refund_number || ')',
    'DRAFT', p_processed_by
  );

  -- Debit: Contra Revenue
  INSERT INTO journal_lines (
    journal_entry_id, financial_account_id, outlet_id, debit, credit, description
  ) VALUES (
    v_journal_id, v_contra_rev_id, v_refund.outlet_id,
    v_refund.total_amount - v_refund.tax_amount, 0.00,
    'Contra-revenue for refund ' || v_refund.refund_number
  );

  -- Debit: Tax Payable
  IF v_refund.tax_amount > 0 AND v_tax_acc_id IS NOT NULL THEN
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_tax_acc_id, v_refund.outlet_id,
      v_refund.tax_amount, 0.00,
      'Tax refund adjustment for ' || v_refund.refund_number
    );
  END IF;

  -- Credit: Resolved Payment Asset Accounts (Blocker 10)
  FOR v_ref_pm IN
    SELECT srp.amount, pm.financial_account_id, pm.type, pm.name
    FROM sale_refund_payments srp
    JOIN payment_methods pm ON pm.id = srp.payment_method_id
    WHERE srp.refund_id = p_refund_id
  LOOP
    v_pm_acc_id := v_ref_pm.financial_account_id;
    IF v_pm_acc_id IS NULL THEN
      RAISE EXCEPTION 'Refund payment method "%" is not configured with an active financial account', v_ref_pm.name;
    END IF;

    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_pm_acc_id, v_refund.outlet_id,
      0.00, v_ref_pm.amount,
      'Refund payout (' || v_ref_pm.name || ') for ' || v_refund.refund_number
    );
  END LOOP;

  -- Inventory Restock Accounting (Debit Inventory, Credit COGS)
  IF v_total_refund_cogs > 0 AND v_inv_acc_id IS NOT NULL AND v_cogs_acc_id IS NOT NULL THEN
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_inv_acc_id, v_refund.outlet_id,
      v_total_refund_cogs, 0.00,
      'Inventory restock asset recovery for refund ' || v_refund.refund_number
    );

    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_cogs_acc_id, v_refund.outlet_id,
      0.00, v_total_refund_cogs,
      'COGS reversal for refund ' || v_refund.refund_number
    );
  END IF;

  -- Central posting gate (Blocker 8)
  PERFORM _internal_post_journal_entry(v_journal_id, p_processed_by);

  -- 6. Update Refund Status
  UPDATE sale_refunds
  SET status = 'COMPLETED', refunded_at = CURRENT_TIMESTAMP
  WHERE id = p_refund_id;

  -- 7. Update Sale Status (Partial vs Full) (Blocker 11)
  SELECT
    COALESCE(SUM(si.quantity), 0) AS total_sold,
    COALESCE(SUM(sri.quantity), 0) AS total_ref
  INTO v_total_sold_qty, v_total_refunded_qty
  FROM sale_items si
  LEFT JOIN (
    SELECT sri_sub.sale_item_id, SUM(sri_sub.quantity) AS quantity
    FROM sale_refund_items sri_sub
    JOIN sale_refunds sr_sub ON sr_sub.id = sri_sub.refund_id
    WHERE sr_sub.sale_id = v_sale.id AND sr_sub.status = 'COMPLETED'
    GROUP BY sri_sub.sale_item_id
  ) sri ON sri.sale_item_id = si.id
  WHERE si.sale_id = v_sale.id;

  IF v_total_refunded_qty >= v_total_sold_qty THEN
    v_new_sale_status := 'REFUNDED';
  ELSE
    v_new_sale_status := 'PARTIALLY_REFUNDED';
  END IF;

  UPDATE sales
  SET status = v_new_sale_status, updated_at = CURRENT_TIMESTAMP
  WHERE id = v_sale.id;

  -- 8. Audit Log
  INSERT INTO audit_logs (
    user_id, action, entity_type, entity_id, after_state, created_at
  ) VALUES (
    p_processed_by, 'PROCESS_REFUND', 'sale_refunds', p_refund_id,
    jsonb_build_object('refund_number', v_refund.refund_number, 'total_amount', v_refund.total_amount, 'journal_id', v_journal_id, 'sale_status', v_new_sale_status),
    CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'success', true,
    'refund_id', p_refund_id,
    'journal_id', v_journal_id,
    'sale_status', v_new_sale_status,
    'status', 'COMPLETED'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION process_sale_refund(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_sale_refund(UUID, UUID) TO authenticated;


-- ============================================================================
-- SECTION 8: REDEFINE process_stock_adjustment & process_stock_transfer (BLOCKERS 1, 2, 8)
-- ============================================================================
CREATE OR REPLACE FUNCTION process_stock_adjustment(
  p_adjustment_id UUID,
  p_approved_by UUID
) RETURNS JSONB AS $$
DECLARE
  v_caller_profile_id UUID;
  v_adj RECORD;
  v_adj_item RECORD;
  v_stock RECORD;
  v_stock_qty NUMERIC(18,4);
  v_avg_cost NUMERIC(18,2);
  v_delta NUMERIC(18,4);
  v_total_loss NUMERIC(18,2) := 0.00;
  v_total_gain NUMERIC(18,2) := 0.00;
  v_inv_loss_acc_id UUID;
  v_inv_asset_acc_id UUID;
  v_journal_id UUID;
  v_journal_number VARCHAR(50);
BEGIN
  -- 0. Authentication Guard (Blocker 1)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Caller Profile Check
  SELECT id INTO v_caller_profile_id
  FROM profiles
  WHERE auth_user_id = auth.uid() AND is_active = TRUE;

  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Active user profile not found for authenticated caller';
  END IF;

  IF NOT is_owner_or_admin() AND p_approved_by != v_caller_profile_id THEN
    RAISE EXCEPTION 'Caller is not authorized for approver profile %', p_approved_by;
  END IF;

  SELECT * INTO v_adj
  FROM stock_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock adjustment % not found', p_adjustment_id;
  END IF;

  -- 2. Permission Check on Adjustment Outlet (Blocker 2)
  IF NOT current_user_has_permission('inventory.adjust', v_adj.outlet_id) THEN
    RAISE EXCEPTION 'User lacks permission inventory.adjust for outlet %', v_adj.outlet_id;
  END IF;

  IF v_adj.status IN ('APPROVED', 'APPLIED') THEN
    RETURN jsonb_build_object('success', true, 'message', 'Adjustment already applied');
  END IF;

  -- 3. Apply line adjustments
  FOR v_adj_item IN SELECT * FROM stock_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    SELECT * INTO v_stock
    FROM outlet_inventory
    WHERE outlet_id = v_adj.outlet_id AND product_id = v_adj_item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO outlet_inventory (
        outlet_id, product_id, quantity, average_cost, updated_at
      ) VALUES (
        v_adj.outlet_id, v_adj_item.product_id, v_adj_item.quantity_after, v_adj_item.unit_cost, CURRENT_TIMESTAMP
      );
      v_stock_qty := 0.0000;
      v_avg_cost := v_adj_item.unit_cost;
    ELSE
      v_stock_qty := v_stock.quantity;
      v_avg_cost := v_stock.average_cost;

      UPDATE outlet_inventory
      SET
        quantity = v_adj_item.quantity_after,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = v_stock.id;
    END IF;

    v_delta := v_adj_item.quantity_after - v_stock_qty;

    IF v_delta < 0 THEN
      INSERT INTO inventory_movements (
        outlet_id, product_id, movement_type, quantity, unit_cost,
        quantity_before, quantity_after, reference_type, reference_id,
        occurred_at, created_by
      ) VALUES (
        v_adj.outlet_id, v_adj_item.product_id, 'ADJUSTMENT_OUT', v_delta, v_avg_cost,
        v_stock_qty, v_adj_item.quantity_after, 'ADJUSTMENT', p_adjustment_id,
        CURRENT_TIMESTAMP, p_approved_by
      );

      v_total_loss := v_total_loss + (ABS(v_delta) * v_avg_cost);
    ELSIF v_delta > 0 THEN
      INSERT INTO inventory_movements (
        outlet_id, product_id, movement_type, quantity, unit_cost,
        quantity_before, quantity_after, reference_type, reference_id,
        occurred_at, created_by
      ) VALUES (
        v_adj.outlet_id, v_adj_item.product_id, 'ADJUSTMENT_IN', v_delta, v_avg_cost,
        v_stock_qty, v_adj_item.quantity_after, 'ADJUSTMENT', p_adjustment_id,
        CURRENT_TIMESTAMP, p_approved_by
      );

      v_total_gain := v_total_gain + (v_delta * v_avg_cost);
    END IF;

    UPDATE stock_adjustment_items
    SET
      quantity_before = v_stock_qty,
      quantity_delta = v_delta,
      unit_cost = v_avg_cost
    WHERE id = v_adj_item.id;
  END LOOP;

  -- 4. Post Level 2 Double-Entry Adjustment Journal via Central Gate (Blocker 8)
  IF v_total_loss > 0 OR v_total_gain > 0 THEN
    SELECT id INTO v_inv_loss_acc_id FROM financial_accounts WHERE account_code = '5700' LIMIT 1;
    SELECT id INTO v_inv_asset_acc_id FROM financial_accounts WHERE account_code = '1300' LIMIT 1;

    v_journal_id := gen_random_uuid();
    v_journal_number := 'JRN-ADJ-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

    INSERT INTO journal_entries (
      id, journal_number, journal_date, reference_type, reference_id,
      description, status, created_by
    ) VALUES (
      v_journal_id, v_journal_number, CURRENT_DATE, 'ADJUSTMENT', p_adjustment_id,
      'Stock adjustment journal #' || v_adj.adjustment_number || ': ' || v_adj.reason,
      'DRAFT', p_approved_by
    );

    IF v_total_loss > 0 AND v_inv_loss_acc_id IS NOT NULL AND v_inv_asset_acc_id IS NOT NULL THEN
      INSERT INTO journal_lines (
        journal_entry_id, financial_account_id, outlet_id, debit, credit, description
      ) VALUES (
        v_journal_id, v_inv_loss_acc_id, v_adj.outlet_id, v_total_loss, 0.00,
        'Inventory loss / shrinkage for #' || v_adj.adjustment_number
      );

      INSERT INTO journal_lines (
        journal_entry_id, financial_account_id, outlet_id, debit, credit, description
      ) VALUES (
        v_journal_id, v_inv_asset_acc_id, v_adj.outlet_id, 0.00, v_total_loss,
        'Inventory asset reduction for #' || v_adj.adjustment_number
      );
    END IF;

    IF v_total_gain > 0 AND v_inv_loss_acc_id IS NOT NULL AND v_inv_asset_acc_id IS NOT NULL THEN
      INSERT INTO journal_lines (
        journal_entry_id, financial_account_id, outlet_id, debit, credit, description
      ) VALUES (
        v_journal_id, v_inv_asset_acc_id, v_adj.outlet_id, v_total_gain, 0.00,
        'Inventory asset gain for #' || v_adj.adjustment_number
      );

      INSERT INTO journal_lines (
        journal_entry_id, financial_account_id, outlet_id, debit, credit, description
      ) VALUES (
        v_journal_id, v_inv_loss_acc_id, v_adj.outlet_id, 0.00, v_total_gain,
        'Inventory surplus / offset for #' || v_adj.adjustment_number
      );
    END IF;

    -- Central posting gate
    PERFORM _internal_post_journal_entry(v_journal_id, p_approved_by);
  END IF;

  -- 5. Update Status
  UPDATE stock_adjustments
  SET status = 'APPLIED', approved_by = p_approved_by
  WHERE id = p_adjustment_id;

  -- 6. Audit Log
  INSERT INTO audit_logs (
    user_id, action, entity_type, entity_id, after_state, created_at
  ) VALUES (
    p_approved_by, 'PROCESS_ADJUSTMENT', 'stock_adjustments', p_adjustment_id,
    jsonb_build_object('adjustment_number', v_adj.adjustment_number, 'status', 'APPLIED', 'journal_id', v_journal_id),
    CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'success', true,
    'adjustment_id', p_adjustment_id,
    'status', 'APPLIED',
    'journal_id', v_journal_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION process_stock_adjustment(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_stock_adjustment(UUID, UUID) TO authenticated;

-- process_stock_transfer
CREATE OR REPLACE FUNCTION process_stock_transfer(
  p_transfer_id UUID,
  p_approved_by UUID
) RETURNS JSONB AS $$
DECLARE
  v_caller_profile_id UUID;
  v_transfer RECORD;
  v_item RECORD;
  v_source_stock RECORD;
  v_dest_stock RECORD;
  v_new_dest_avg_cost NUMERIC(18,2);
  v_new_dest_qty NUMERIC(18,4);
BEGIN
  -- 0. Authentication Guard (Blocker 1)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Caller Profile Check
  SELECT id INTO v_caller_profile_id
  FROM profiles
  WHERE auth_user_id = auth.uid() AND is_active = TRUE;

  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Active user profile not found for authenticated caller';
  END IF;

  IF NOT is_owner_or_admin() AND p_approved_by != v_caller_profile_id THEN
    RAISE EXCEPTION 'Caller is not authorized for approver profile %', p_approved_by;
  END IF;

  SELECT * INTO v_transfer
  FROM stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock transfer % not found', p_transfer_id;
  END IF;

  -- 2. Permission Check on Source Outlet (Blocker 2)
  IF NOT current_user_has_permission('inventory.transfer', v_transfer.from_outlet_id) THEN
    RAISE EXCEPTION 'User lacks permission inventory.transfer for source outlet %', v_transfer.from_outlet_id;
  END IF;

  IF v_transfer.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Transfer already completed');
  END IF;

  FOR v_item IN
    SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    -- Source Outlet deduction
    SELECT * INTO v_source_stock
    FROM outlet_inventory
    WHERE outlet_id = v_transfer.from_outlet_id AND product_id = v_item.product_id
    FOR UPDATE;

    IF NOT FOUND OR v_source_stock.quantity < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product % at source outlet. Available: %, Requested: %',
        v_item.product_id, COALESCE(v_source_stock.quantity, 0), v_item.quantity;
    END IF;

    UPDATE outlet_inventory
    SET quantity = quantity - v_item.quantity, updated_at = CURRENT_TIMESTAMP
    WHERE id = v_source_stock.id;

    INSERT INTO inventory_movements (
      outlet_id, product_id, movement_type, quantity, unit_cost,
      quantity_before, quantity_after, reference_type, reference_id,
      occurred_at, created_by
    ) VALUES (
      v_transfer.from_outlet_id, v_item.product_id, 'TRANSFER_OUT', -v_item.quantity, v_source_stock.average_cost,
      v_source_stock.quantity, v_source_stock.quantity - v_item.quantity, 'TRANSFER', p_transfer_id,
      CURRENT_TIMESTAMP, p_approved_by
    );

    -- Destination Outlet addition with Moving Average Cost
    SELECT * INTO v_dest_stock
    FROM outlet_inventory
    WHERE outlet_id = v_transfer.to_outlet_id AND product_id = v_item.product_id
    FOR UPDATE;

    IF FOUND THEN
      v_new_dest_qty := v_dest_stock.quantity + v_item.quantity;
      v_new_dest_avg_cost := ROUND(
        ((v_dest_stock.quantity * v_dest_stock.average_cost) + (v_item.quantity * v_source_stock.average_cost)) / v_new_dest_qty,
        2
      );

      UPDATE outlet_inventory
      SET
        quantity = v_new_dest_qty,
        average_cost = v_new_dest_avg_cost,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = v_dest_stock.id;

      INSERT INTO inventory_movements (
        outlet_id, product_id, movement_type, quantity, unit_cost,
        quantity_before, quantity_after, reference_type, reference_id,
        occurred_at, created_by
      ) VALUES (
        v_transfer.to_outlet_id, v_item.product_id, 'TRANSFER_IN', v_item.quantity, v_source_stock.average_cost,
        v_dest_stock.quantity, v_new_dest_qty, 'TRANSFER', p_transfer_id,
        CURRENT_TIMESTAMP, p_approved_by
      );
    ELSE
      INSERT INTO outlet_inventory (
        outlet_id, product_id, quantity, average_cost, updated_at
      ) VALUES (
        v_transfer.to_outlet_id, v_item.product_id, v_item.quantity, v_source_stock.average_cost, CURRENT_TIMESTAMP
      );

      INSERT INTO inventory_movements (
        outlet_id, product_id, movement_type, quantity, unit_cost,
        quantity_before, quantity_after, reference_type, reference_id,
        occurred_at, created_by
      ) VALUES (
        v_transfer.to_outlet_id, v_item.product_id, 'TRANSFER_IN', v_item.quantity, v_source_stock.average_cost,
        0.0000, v_item.quantity, 'TRANSFER', p_transfer_id,
        CURRENT_TIMESTAMP, p_approved_by
      );
    END IF;
  END LOOP;

  UPDATE stock_transfers
  SET status = 'COMPLETED', approved_by = p_approved_by, completed_at = CURRENT_TIMESTAMP
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('success', true, 'transfer_id', p_transfer_id, 'status', 'COMPLETED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION process_stock_transfer(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_stock_transfer(UUID, UUID) TO authenticated;


-- ============================================================================
-- SECTION 9: PUBLIC BOOKING & BUSINESS SETTINGS RPCS (BLOCKERS 13 & 16)
-- ============================================================================

-- 9.1 Public Booking RPC (Safe entry point for anonymous & online guests)
CREATE OR REPLACE FUNCTION create_public_booking(
  p_outlet_id UUID,
  p_service_id UUID,
  p_barber_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_start_time TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_duration INT;
  v_end_time TIMESTAMPTZ;
  v_day_of_week INT;
  v_customer_id UUID;
  v_customer_code VARCHAR(50);
  v_booking_ref VARCHAR(50);
  v_appointment_id UUID;
BEGIN
  -- 1. Validate Outlet exists and is active
  IF NOT EXISTS (SELECT 1 FROM outlets WHERE id = p_outlet_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Outlet % does not exist or is inactive', p_outlet_id;
  END IF;

  -- 2. Validate Service exists, active, and priced for this outlet
  SELECT s.duration_minutes INTO v_duration
  FROM services s
  JOIN service_outlets so ON so.service_id = s.id AND so.outlet_id = p_outlet_id
  WHERE s.id = p_service_id AND s.is_active = TRUE AND so.is_active = TRUE;

  IF NOT FOUND OR v_duration IS NULL THEN
    RAISE EXCEPTION 'Service % is not available or active at outlet %', p_service_id, p_outlet_id;
  END IF;

  -- 3. Calculate End Time & Validate Future Slot
  v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;
  IF p_start_time <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'Appointment start time must be in the future';
  END IF;

  -- 4. Validate Barber is active and assigned to this outlet
  IF NOT EXISTS (
    SELECT 1 FROM employees e
    JOIN employee_outlets eo ON eo.employee_id = e.id
    WHERE e.id = p_barber_id AND e.is_active = TRUE AND eo.outlet_id = p_outlet_id
  ) THEN
    RAISE EXCEPTION 'Barber % is not assigned or active at outlet %', p_barber_id, p_outlet_id;
  END IF;

  -- 5. Validate Barber Working Schedule
  -- EXTRACT(DOW) in PostgreSQL: 0 = Sunday, 1 = Monday ... 6 = Saturday
  v_day_of_week := EXTRACT(DOW FROM p_start_time)::INT;
  IF EXISTS (
    SELECT 1 FROM employee_schedules
    WHERE employee_id = p_barber_id AND outlet_id = p_outlet_id
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM employee_schedules
      WHERE employee_id = p_barber_id
        AND outlet_id = p_outlet_id
        AND day_of_week = v_day_of_week
        AND is_active = TRUE
        AND p_start_time::TIME >= start_time
        AND v_end_time::TIME <= end_time
    ) THEN
      RAISE EXCEPTION 'Barber % is not scheduled to work at this time', p_barber_id;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM employee_leaves
    WHERE employee_id = p_barber_id
      AND status = 'APPROVED'
      AND p_start_time < end_at
      AND v_end_time > start_at
  ) THEN
    RAISE EXCEPTION 'Barber % is on approved leave during this time', p_barber_id;
  END IF;

  -- 6. Booking Collision Check (Overlapping active appointment)
  IF EXISTS (
    SELECT 1 FROM appointments
    WHERE barber_id = p_barber_id
      AND status NOT IN ('CANCELLED', 'NO_SHOW')
      AND tstzrange(start_at, end_at, '[)') && tstzrange(p_start_time, v_end_time, '[)')
  ) THEN
    RAISE EXCEPTION 'Selected time slot [% - %] is already booked for barber %', p_start_time, v_end_time, p_barber_id;
  END IF;

  -- 7. Resolve or Create Customer Record
  SELECT id INTO v_customer_id
  FROM customers
  WHERE phone = p_customer_phone
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    v_customer_code := 'CUST-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');
    INSERT INTO customers (customer_code, full_name, phone)
    VALUES (v_customer_code, p_customer_name, p_customer_phone)
    RETURNING id INTO v_customer_id;
  END IF;

  -- 8. Insert Appointment
  v_booking_ref := 'BK-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 90000) + 10000)::TEXT, 5, '0');
  INSERT INTO appointments (
    appointment_number, outlet_id, customer_id, barber_id, service_id,
    start_at, end_at, status, notes
  ) VALUES (
    v_booking_ref, p_outlet_id, v_customer_id, p_barber_id, p_service_id,
    p_start_time, v_end_time, 'CONFIRMED', p_notes
  ) RETURNING id INTO v_appointment_id;

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'booking_reference', v_booking_ref,
    'start_at', p_start_time,
    'end_at', v_end_time,
    'status', 'CONFIRMED'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION create_public_booking(UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_public_booking(UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO anon, authenticated;

-- 9.2 Public Safe Business Settings Function (Blocker 16)
CREATE OR REPLACE FUNCTION get_public_business_settings()
RETURNS JSONB AS $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT to_jsonb(t) INTO v_res FROM (
    SELECT
      business_name,
      logo_url,
      address,
      phone,
      email,
      currency,
      timezone,
      booking_enabled,
      tax_enabled,
      tax_rate,
      tax_inclusive
    FROM business_settings
    LIMIT 1
  ) t;
  RETURN v_res;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION get_public_business_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_business_settings() TO anon, authenticated;


-- ============================================================================
-- SECTION 10: RLS OVERHAUL WITH EXPLICIT WITH CHECK GUARDS (BLOCKERS 13, 14, 15, 16)
-- ============================================================================

-- 10.1 Restrict business_settings (Blocker 16)
DROP POLICY IF EXISTS "business_settings_select" ON business_settings;
CREATE POLICY "business_settings_select" ON business_settings FOR SELECT USING (auth.uid() IS NOT NULL);

-- 10.2 Restrict customers (Blocker 15)
DROP POLICY IF EXISTS "customers_select" ON customers;
DROP POLICY IF EXISTS "customers_manage" ON customers;

CREATE POLICY "customers_select" ON customers FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    is_owner_or_admin()
    OR EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.id
      WHERE p.auth_user_id = auth.uid() AND p.is_active = TRUE
    )
  )
);

CREATE POLICY "customers_insert" ON customers FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND (
    is_owner_or_admin()
    OR current_user_has_permission('booking.manage')
    OR current_user_has_permission('pos.sale.create')
  )
);

CREATE POLICY "customers_update" ON customers FOR UPDATE USING (
  auth.uid() IS NOT NULL AND (
    is_owner_or_admin()
    OR current_user_has_permission('booking.manage')
    OR current_user_has_permission('pos.sale.create')
  )
) WITH CHECK (
  auth.uid() IS NOT NULL
);

CREATE POLICY "customers_delete" ON customers FOR DELETE USING (is_owner_or_admin());

-- 10.3 Restrict appointments (Blocker 13: Remove anonymous access)
DROP POLICY IF EXISTS "appointments_access" ON appointments;

CREATE POLICY "appointments_select" ON appointments FOR SELECT USING (
  current_user_has_outlet_access(outlet_id)
);

CREATE POLICY "appointments_insert" ON appointments FOR INSERT WITH CHECK (
  current_user_has_outlet_access(outlet_id)
);

CREATE POLICY "appointments_update" ON appointments FOR UPDATE USING (
  current_user_has_outlet_access(outlet_id)
) WITH CHECK (
  current_user_has_outlet_access(outlet_id)
);

CREATE POLICY "appointments_delete" ON appointments FOR DELETE USING (
  current_user_has_outlet_access(outlet_id)
);

-- 10.4 Explicit WITH CHECK on Outlet-Sensitive Tables (Blocker 14)

-- Outlets
DROP POLICY IF EXISTS "outlets_select" ON outlets;
DROP POLICY IF EXISTS "outlets_admin" ON outlets;
CREATE POLICY "outlets_select" ON outlets FOR SELECT USING (current_user_has_outlet_access(id));
CREATE POLICY "outlets_insert" ON outlets FOR INSERT WITH CHECK (is_owner_or_admin());
CREATE POLICY "outlets_update" ON outlets FOR UPDATE USING (is_owner_or_admin()) WITH CHECK (is_owner_or_admin());
CREATE POLICY "outlets_delete" ON outlets FOR DELETE USING (is_owner_or_admin());

-- Service Outlets
DROP POLICY IF EXISTS "service_outlets_access" ON service_outlets;
CREATE POLICY "service_outlets_select" ON service_outlets FOR SELECT USING (current_user_has_outlet_access(outlet_id));
CREATE POLICY "service_outlets_insert" ON service_outlets FOR INSERT WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "service_outlets_update" ON service_outlets FOR UPDATE USING (current_user_has_outlet_access(outlet_id)) WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "service_outlets_delete" ON service_outlets FOR DELETE USING (current_user_has_outlet_access(outlet_id));

-- Product Outlets
DROP POLICY IF EXISTS "product_outlets_access" ON product_outlets;
CREATE POLICY "product_outlets_select" ON product_outlets FOR SELECT USING (current_user_has_outlet_access(outlet_id));
CREATE POLICY "product_outlets_insert" ON product_outlets FOR INSERT WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "product_outlets_update" ON product_outlets FOR UPDATE USING (current_user_has_outlet_access(outlet_id)) WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "product_outlets_delete" ON product_outlets FOR DELETE USING (current_user_has_outlet_access(outlet_id));

-- Outlet Inventory
DROP POLICY IF EXISTS "outlet_inventory_access" ON outlet_inventory;
CREATE POLICY "outlet_inventory_select" ON outlet_inventory FOR SELECT USING (current_user_has_outlet_access(outlet_id));
CREATE POLICY "outlet_inventory_insert" ON outlet_inventory FOR INSERT WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "outlet_inventory_update" ON outlet_inventory FOR UPDATE USING (current_user_has_outlet_access(outlet_id)) WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "outlet_inventory_delete" ON outlet_inventory FOR DELETE USING (current_user_has_outlet_access(outlet_id));

-- Purchases
DROP POLICY IF EXISTS "purchases_access" ON purchases;
CREATE POLICY "purchases_select" ON purchases FOR SELECT USING (current_user_has_outlet_access(outlet_id));
CREATE POLICY "purchases_insert" ON purchases FOR INSERT WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "purchases_update" ON purchases FOR UPDATE USING (current_user_has_outlet_access(outlet_id)) WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "purchases_delete" ON purchases FOR DELETE USING (current_user_has_outlet_access(outlet_id));

-- Purchase Items
DROP POLICY IF EXISTS "purchase_items_access" ON purchase_items;
CREATE POLICY "purchase_items_select" ON purchase_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM purchases p WHERE p.id = purchase_id AND current_user_has_outlet_access(p.outlet_id))
);
CREATE POLICY "purchase_items_insert" ON purchase_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM purchases p WHERE p.id = purchase_id AND current_user_has_outlet_access(p.outlet_id))
);
CREATE POLICY "purchase_items_update" ON purchase_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM purchases p WHERE p.id = purchase_id AND current_user_has_outlet_access(p.outlet_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM purchases p WHERE p.id = purchase_id AND current_user_has_outlet_access(p.outlet_id))
);
CREATE POLICY "purchase_items_delete" ON purchase_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM purchases p WHERE p.id = purchase_id AND current_user_has_outlet_access(p.outlet_id))
);

-- Stock Adjustments
DROP POLICY IF EXISTS "stock_adjustments_access" ON stock_adjustments;
CREATE POLICY "stock_adjustments_select" ON stock_adjustments FOR SELECT USING (current_user_has_outlet_access(outlet_id));
CREATE POLICY "stock_adjustments_insert" ON stock_adjustments FOR INSERT WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "stock_adjustments_update" ON stock_adjustments FOR UPDATE USING (current_user_has_outlet_access(outlet_id)) WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "stock_adjustments_delete" ON stock_adjustments FOR DELETE USING (current_user_has_outlet_access(outlet_id));

-- Stock Adjustment Items
DROP POLICY IF EXISTS "stock_adjustment_items_access" ON stock_adjustment_items;
CREATE POLICY "stock_adjustment_items_select" ON stock_adjustment_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM stock_adjustments sa WHERE sa.id = adjustment_id AND current_user_has_outlet_access(sa.outlet_id))
);
CREATE POLICY "stock_adjustment_items_insert" ON stock_adjustment_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM stock_adjustments sa WHERE sa.id = adjustment_id AND current_user_has_outlet_access(sa.outlet_id))
);
CREATE POLICY "stock_adjustment_items_update" ON stock_adjustment_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM stock_adjustments sa WHERE sa.id = adjustment_id AND current_user_has_outlet_access(sa.outlet_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM stock_adjustments sa WHERE sa.id = adjustment_id AND current_user_has_outlet_access(sa.outlet_id))
);
CREATE POLICY "stock_adjustment_items_delete" ON stock_adjustment_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM stock_adjustments sa WHERE sa.id = adjustment_id AND current_user_has_outlet_access(sa.outlet_id))
);

-- Stock Transfers
DROP POLICY IF EXISTS "stock_transfers_access" ON stock_transfers;
CREATE POLICY "stock_transfers_select" ON stock_transfers FOR SELECT USING (
  current_user_has_outlet_access(from_outlet_id) OR current_user_has_outlet_access(to_outlet_id)
);
CREATE POLICY "stock_transfers_insert" ON stock_transfers FOR INSERT WITH CHECK (
  current_user_has_outlet_access(from_outlet_id)
);
CREATE POLICY "stock_transfers_update" ON stock_transfers FOR UPDATE USING (
  current_user_has_outlet_access(from_outlet_id) OR current_user_has_outlet_access(to_outlet_id)
) WITH CHECK (
  current_user_has_outlet_access(from_outlet_id) OR current_user_has_outlet_access(to_outlet_id)
);
CREATE POLICY "stock_transfers_delete" ON stock_transfers FOR DELETE USING (
  current_user_has_outlet_access(from_outlet_id)
);

-- Stock Transfer Items
DROP POLICY IF EXISTS "stock_transfer_items_access" ON stock_transfer_items;
CREATE POLICY "stock_transfer_items_select" ON stock_transfer_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM stock_transfers st WHERE st.id = transfer_id AND (current_user_has_outlet_access(st.from_outlet_id) OR current_user_has_outlet_access(st.to_outlet_id)))
);
CREATE POLICY "stock_transfer_items_insert" ON stock_transfer_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM stock_transfers st WHERE st.id = transfer_id AND current_user_has_outlet_access(st.from_outlet_id))
);
CREATE POLICY "stock_transfer_items_update" ON stock_transfer_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM stock_transfers st WHERE st.id = transfer_id AND (current_user_has_outlet_access(st.from_outlet_id) OR current_user_has_outlet_access(st.to_outlet_id)))
) WITH CHECK (
  EXISTS (SELECT 1 FROM stock_transfers st WHERE st.id = transfer_id AND (current_user_has_outlet_access(st.from_outlet_id) OR current_user_has_outlet_access(st.to_outlet_id)))
);
CREATE POLICY "stock_transfer_items_delete" ON stock_transfer_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM stock_transfers st WHERE st.id = transfer_id AND current_user_has_outlet_access(st.from_outlet_id))
);

-- Cash Registers
DROP POLICY IF EXISTS "cash_registers_access" ON cash_registers;
CREATE POLICY "cash_registers_select" ON cash_registers FOR SELECT USING (current_user_has_outlet_access(outlet_id));
CREATE POLICY "cash_registers_insert" ON cash_registers FOR INSERT WITH CHECK (is_owner_or_admin());
CREATE POLICY "cash_registers_update" ON cash_registers FOR UPDATE USING (is_owner_or_admin()) WITH CHECK (is_owner_or_admin());
CREATE POLICY "cash_registers_delete" ON cash_registers FOR DELETE USING (is_owner_or_admin());

-- Cash Sessions
DROP POLICY IF EXISTS "cash_sessions_access" ON cash_sessions;
CREATE POLICY "cash_sessions_select" ON cash_sessions FOR SELECT USING (
  EXISTS (SELECT 1 FROM cash_registers cr WHERE cr.id = cash_register_id AND current_user_has_outlet_access(cr.outlet_id))
);
CREATE POLICY "cash_sessions_insert" ON cash_sessions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM cash_registers cr WHERE cr.id = cash_register_id AND current_user_has_outlet_access(cr.outlet_id))
);
CREATE POLICY "cash_sessions_update" ON cash_sessions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM cash_registers cr WHERE cr.id = cash_register_id AND current_user_has_outlet_access(cr.outlet_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM cash_registers cr WHERE cr.id = cash_register_id AND current_user_has_outlet_access(cr.outlet_id))
);
CREATE POLICY "cash_sessions_delete" ON cash_sessions FOR DELETE USING (
  is_owner_or_admin()
);

-- Sales
DROP POLICY IF EXISTS "sales_access" ON sales;
CREATE POLICY "sales_select" ON sales FOR SELECT USING (current_user_has_outlet_access(outlet_id));
CREATE POLICY "sales_insert" ON sales FOR INSERT WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "sales_update" ON sales FOR UPDATE USING (current_user_has_outlet_access(outlet_id)) WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "sales_delete" ON sales FOR DELETE USING (is_owner_or_admin());

-- Sale Items
DROP POLICY IF EXISTS "sale_items_access" ON sale_items;
CREATE POLICY "sale_items_select" ON sale_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_id AND current_user_has_outlet_access(s.outlet_id))
);
CREATE POLICY "sale_items_insert" ON sale_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_id AND current_user_has_outlet_access(s.outlet_id))
);
CREATE POLICY "sale_items_update" ON sale_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_id AND current_user_has_outlet_access(s.outlet_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_id AND current_user_has_outlet_access(s.outlet_id))
);
CREATE POLICY "sale_items_delete" ON sale_items FOR DELETE USING (is_owner_or_admin());

-- Sale Payments
DROP POLICY IF EXISTS "sale_payments_access" ON sale_payments;
CREATE POLICY "sale_payments_select" ON sale_payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_id AND current_user_has_outlet_access(s.outlet_id))
);
CREATE POLICY "sale_payments_insert" ON sale_payments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_id AND current_user_has_outlet_access(s.outlet_id))
);
CREATE POLICY "sale_payments_update" ON sale_payments FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_id AND current_user_has_outlet_access(s.outlet_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_id AND current_user_has_outlet_access(s.outlet_id))
);
CREATE POLICY "sale_payments_delete" ON sale_payments FOR DELETE USING (is_owner_or_admin());

-- Sale Refunds
DROP POLICY IF EXISTS "sale_refunds_access" ON sale_refunds;
CREATE POLICY "sale_refunds_select" ON sale_refunds FOR SELECT USING (current_user_has_outlet_access(outlet_id));
CREATE POLICY "sale_refunds_insert" ON sale_refunds FOR INSERT WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "sale_refunds_update" ON sale_refunds FOR UPDATE USING (current_user_has_outlet_access(outlet_id)) WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "sale_refunds_delete" ON sale_refunds FOR DELETE USING (is_owner_or_admin());

-- Sale Refund Items
DROP POLICY IF EXISTS "sale_refund_items_access" ON sale_refund_items;
CREATE POLICY "sale_refund_items_select" ON sale_refund_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM sale_refunds sr WHERE sr.id = refund_id AND current_user_has_outlet_access(sr.outlet_id))
);
CREATE POLICY "sale_refund_items_insert" ON sale_refund_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sale_refunds sr WHERE sr.id = refund_id AND current_user_has_outlet_access(sr.outlet_id))
);
CREATE POLICY "sale_refund_items_update" ON sale_refund_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sale_refunds sr WHERE sr.id = refund_id AND current_user_has_outlet_access(sr.outlet_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM sale_refunds sr WHERE sr.id = refund_id AND current_user_has_outlet_access(sr.outlet_id))
);
CREATE POLICY "sale_refund_items_delete" ON sale_refund_items FOR DELETE USING (is_owner_or_admin());

-- Sale Refund Payments
CREATE POLICY "sale_refund_payments_select" ON sale_refund_payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM sale_refunds sr WHERE sr.id = refund_id AND current_user_has_outlet_access(sr.outlet_id))
);
CREATE POLICY "sale_refund_payments_insert" ON sale_refund_payments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sale_refunds sr WHERE sr.id = refund_id AND current_user_has_outlet_access(sr.outlet_id))
);
CREATE POLICY "sale_refund_payments_update" ON sale_refund_payments FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sale_refunds sr WHERE sr.id = refund_id AND current_user_has_outlet_access(sr.outlet_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM sale_refunds sr WHERE sr.id = refund_id AND current_user_has_outlet_access(sr.outlet_id))
);
CREATE POLICY "sale_refund_payments_delete" ON sale_refund_payments FOR DELETE USING (is_owner_or_admin());

-- Queues
DROP POLICY IF EXISTS "queues_access" ON queues;
CREATE POLICY "queues_select" ON queues FOR SELECT USING (current_user_has_outlet_access(outlet_id));
CREATE POLICY "queues_insert" ON queues FOR INSERT WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "queues_update" ON queues FOR UPDATE USING (current_user_has_outlet_access(outlet_id)) WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "queues_delete" ON queues FOR DELETE USING (current_user_has_outlet_access(outlet_id));

-- Commissions
DROP POLICY IF EXISTS "commissions_select" ON commissions;
DROP POLICY IF EXISTS "commissions_admin" ON commissions;
CREATE POLICY "commissions_select" ON commissions FOR SELECT USING (
  current_user_has_outlet_access(outlet_id)
  OR employee_id IN (SELECT id FROM employees WHERE id IN (SELECT employee_id FROM profiles WHERE auth_user_id = auth.uid()))
);
CREATE POLICY "commissions_insert" ON commissions FOR INSERT WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "commissions_update" ON commissions FOR UPDATE USING (current_user_has_outlet_access(outlet_id)) WITH CHECK (current_user_has_outlet_access(outlet_id));
CREATE POLICY "commissions_delete" ON commissions FOR DELETE USING (is_owner_or_admin());

-- Journal Lines
DROP POLICY IF EXISTS "journal_lines_select" ON journal_lines;
DROP POLICY IF EXISTS "journal_lines_manage" ON journal_lines;
CREATE POLICY "journal_lines_select" ON journal_lines FOR SELECT USING (
  outlet_id IS NULL OR current_user_has_outlet_access(outlet_id)
);
CREATE POLICY "journal_lines_insert" ON journal_lines FOR INSERT WITH CHECK (
  outlet_id IS NULL OR current_user_has_outlet_access(outlet_id)
);
CREATE POLICY "journal_lines_update" ON journal_lines FOR UPDATE USING (is_owner_or_admin()) WITH CHECK (is_owner_or_admin());
CREATE POLICY "journal_lines_delete" ON journal_lines FOR DELETE USING (is_owner_or_admin());
