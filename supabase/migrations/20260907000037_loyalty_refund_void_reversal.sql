-- ============================================================================
-- BARBERSHOP OS - MIGRATION 37: ATOMIC LOYALTY REFUND & VOID REVERSAL
-- ============================================================================
-- Goals:
--   1. Schema Extension:
--      - Add refund_id column to public.customer_loyalty_ledger referencing sale_refunds(id).
--      - Update check constraint on transaction_type to include:
--        'REFUND_CLAWBACK', 'REFUND_RESTORE', 'VOID_CLAWBACK', 'VOID_RESTORE'.
--      - Create partial unique indexes for refund and void idempotency.
--   2. Atomic Loyalty Reversal in void_sale:
--      - 100% clawback of points earned on the voided sale.
--      - 100% restore of points redeemed on the voided sale.
--      - Update customers.current_loyalty_points (allows negative balance on clawback).
--      - DO NOT modify customers.lifetime_loyalty_points (preserves cumulative history).
--      - Call recalculate_customer_tier(customer_id).
--   3. Atomic Loyalty Reversal in process_sale_refund:
--      - Proportional clawback of points earned based on remaining valid net spending.
--      - Proportional restore of points redeemed based on net item base ratio.
--      - Final step / 100% refund guard guarantees all remaining entitlement is restored.
--      - Update customers.current_loyalty_points (allows negative balance on clawback).
--      - DO NOT modify customers.lifetime_loyalty_points.
--      - Call recalculate_customer_tier(customer_id).
--   4. Preserve all existing transaction boundaries, inventory rollbacks,
--      commission cancellations/reversals, and double-entry accounting journals.
--   5. Maintain strict actor boundary checks and post-migration security assertions.
-- ============================================================================

-- ============================================================================
-- 1. SCHEMA EXTENSION & CONSTRAINTS ON customer_loyalty_ledger
-- ============================================================================

-- 1a. Add refund_id column
ALTER TABLE public.customer_loyalty_ledger
  ADD COLUMN IF NOT EXISTS refund_id UUID REFERENCES public.sale_refunds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_refund_id
  ON public.customer_loyalty_ledger(refund_id);

-- 1b. Update transaction_type constraint safely
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.customer_loyalty_ledger'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%transaction_type%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.customer_loyalty_ledger DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.customer_loyalty_ledger
  ADD CONSTRAINT customer_loyalty_ledger_transaction_type_check
  CHECK (transaction_type IN (
    'EARN',
    'REDEEM',
    'MANUAL_ADJUSTMENT',
    'BONUS',
    'REFUND_CLAWBACK',
    'REFUND_RESTORE',
    'VOID_CLAWBACK',
    'VOID_RESTORE'
  ));

-- 1c. Partial unique indexes for hard idempotency guarantees
CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_ledger_refund_event
  ON public.customer_loyalty_ledger (refund_id, transaction_type)
  WHERE refund_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_ledger_void_event
  ON public.customer_loyalty_ledger (sale_id, transaction_type)
  WHERE transaction_type IN ('VOID_CLAWBACK', 'VOID_RESTORE');


-- ============================================================================
-- 2. REDEFINE _legacy_void_sale WITH ATOMIC LOYALTY REVERSAL
-- ============================================================================
CREATE OR REPLACE FUNCTION public._legacy_void_sale(
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

  -- Loyalty reversal state
  v_customer RECORD;
  v_earned_points INT := 0;
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

  -- 6. Atomic Loyalty Reversal
  IF v_sale.customer_id IS NOT NULL THEN
    SELECT * INTO v_customer
    FROM customers
    WHERE id = v_sale.customer_id
    FOR UPDATE;

    IF FOUND AND v_customer.is_active THEN
      -- 6a. Claw back 100% of points earned on this sale
      SELECT COALESCE(SUM(points_change), 0)
      INTO v_earned_points
      FROM customer_loyalty_ledger
      WHERE sale_id = p_sale_id
        AND transaction_type = 'EARN';

      IF v_earned_points > 0 THEN
        IF NOT EXISTS (
          SELECT 1 FROM customer_loyalty_ledger
          WHERE sale_id = p_sale_id
            AND transaction_type = 'VOID_CLAWBACK'
        ) THEN
          v_customer.current_loyalty_points := v_customer.current_loyalty_points - v_earned_points;

          -- Negative balance allowed for clawback.
          -- DO NOT modify lifetime_loyalty_points (cumulative history preserved).
          UPDATE customers
          SET current_loyalty_points = v_customer.current_loyalty_points,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = v_sale.customer_id;

          INSERT INTO customer_loyalty_ledger (
            customer_id, outlet_id, transaction_type,
            points_change, points_balance_after,
            sale_id, refund_id, notes, created_by
          ) VALUES (
            v_sale.customer_id, v_sale.outlet_id, 'VOID_CLAWBACK',
            -v_earned_points, v_customer.current_loyalty_points,
            p_sale_id, NULL,
            'Pembatalan poin belanja (Void nota ' || v_sale.invoice_number || '): ' || p_reason,
            p_voided_by
          );
        END IF;
      END IF;

      -- 6b. Restore 100% of points redeemed on this sale
      IF COALESCE(v_sale.loyalty_points_redeemed, 0) > 0 THEN
        IF NOT EXISTS (
          SELECT 1 FROM customer_loyalty_ledger
          WHERE sale_id = p_sale_id
            AND transaction_type = 'VOID_RESTORE'
        ) THEN
          v_customer.current_loyalty_points := v_customer.current_loyalty_points + v_sale.loyalty_points_redeemed;

          UPDATE customers
          SET current_loyalty_points = v_customer.current_loyalty_points,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = v_sale.customer_id;

          INSERT INTO customer_loyalty_ledger (
            customer_id, outlet_id, transaction_type,
            points_change, points_balance_after,
            sale_id, refund_id, notes, created_by
          ) VALUES (
            v_sale.customer_id, v_sale.outlet_id, 'VOID_RESTORE',
            v_sale.loyalty_points_redeemed, v_customer.current_loyalty_points,
            p_sale_id, NULL,
            'Pengembalian poin yang ditukarkan (Void nota ' || v_sale.invoice_number || '): ' || p_reason,
            p_voided_by
          );
        END IF;
      END IF;

      -- 6c. Recalculate customer tier after points reversal
      PERFORM recalculate_customer_tier(v_sale.customer_id);
    END IF;
  END IF;

  -- 7. Update Sale Status
  UPDATE sales
  SET status = 'VOIDED', updated_at = CURRENT_TIMESTAMP
  WHERE id = p_sale_id;

  -- 8. Audit Log
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

REVOKE ALL ON FUNCTION public._legacy_void_sale(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;


-- ============================================================================
-- 3. REDEFINE _legacy_process_sale_refund WITH ATOMIC LOYALTY REVERSAL
-- ============================================================================
CREATE OR REPLACE FUNCTION public._legacy_process_sale_refund(
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

  -- Loyalty reversal state
  v_customer RECORD;
  v_orig_earned_points INT := 0;
  v_accum_refunded_amount NUMERIC(18,2) := 0.00;
  v_valid_spending NUMERIC(18,2) := 0.00;
  v_multiplier NUMERIC(18,4) := 1.0;
  v_legitimate_earned INT := 0;
  v_already_clawed INT := 0;
  v_clawback_points INT := 0;

  v_already_restored INT := 0;
  v_max_restorable INT := 0;
  v_b_sale NUMERIC(18,2) := 0.00;
  v_b_refund NUMERIC(18,2) := 0.00;
  v_restore_points INT := 0;
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

  -- 8. Atomic Loyalty Reversal (Clawback & Restore)
  IF v_sale.customer_id IS NOT NULL THEN
    SELECT * INTO v_customer
    FROM customers
    WHERE id = v_sale.customer_id
    FOR UPDATE;

    IF FOUND AND v_customer.is_active THEN
      -- 8a. Earned Points Clawback
      SELECT COALESCE(SUM(points_change), 0)
      INTO v_orig_earned_points
      FROM customer_loyalty_ledger
      WHERE sale_id = v_sale.id
        AND transaction_type = 'EARN';

      IF v_orig_earned_points > 0 THEN
        -- Accumulate all COMPLETED refunds for this sale
        SELECT COALESCE(SUM(total_amount), 0)
        INTO v_accum_refunded_amount
        FROM sale_refunds
        WHERE sale_id = v_sale.id
          AND status = 'COMPLETED';

        v_valid_spending := GREATEST(0, v_sale.total_amount - v_accum_refunded_amount);

        IF v_new_sale_status = 'REFUNDED' OR v_valid_spending <= 0 THEN
          v_legitimate_earned := 0;
        ELSE
          SELECT COALESCE(ct.points_multiplier, 1.0)
          INTO v_multiplier
          FROM customer_tiers ct
          WHERE ct.id = v_customer.tier_id;

          v_multiplier := COALESCE(v_multiplier, 1.0);
          v_legitimate_earned := FLOOR((v_valid_spending / 10000.0) * v_multiplier);
        END IF;

        SELECT COALESCE(ABS(SUM(points_change)), 0)
        INTO v_already_clawed
        FROM customer_loyalty_ledger
        WHERE sale_id = v_sale.id
          AND transaction_type = 'REFUND_CLAWBACK';

        v_clawback_points := GREATEST(0, v_orig_earned_points - v_legitimate_earned - v_already_clawed);

        IF v_clawback_points > 0 THEN
          IF NOT EXISTS (
            SELECT 1 FROM customer_loyalty_ledger
            WHERE refund_id = p_refund_id
              AND transaction_type = 'REFUND_CLAWBACK'
          ) THEN
            v_customer.current_loyalty_points := v_customer.current_loyalty_points - v_clawback_points;

            -- Negative balance allowed for clawback.
            -- DO NOT modify lifetime_loyalty_points (cumulative history preserved).
            UPDATE customers
            SET current_loyalty_points = v_customer.current_loyalty_points,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = v_sale.customer_id;

            INSERT INTO customer_loyalty_ledger (
              customer_id, outlet_id, transaction_type,
              points_change, points_balance_after,
              sale_id, refund_id, notes, created_by
            ) VALUES (
              v_sale.customer_id, v_sale.outlet_id, 'REFUND_CLAWBACK',
              -v_clawback_points, v_customer.current_loyalty_points,
              v_sale.id, p_refund_id,
              'Penarikan poin belanja (Refund ' || v_refund.refund_number || ' nota ' || v_sale.invoice_number || ')',
              p_processed_by
            );
          END IF;
        END IF;
      END IF;

      -- 8b. Redeemed Points Restore
      IF COALESCE(v_sale.loyalty_points_redeemed, 0) > 0 THEN
        SELECT COALESCE(SUM(points_change), 0)
        INTO v_already_restored
        FROM customer_loyalty_ledger
        WHERE sale_id = v_sale.id
          AND transaction_type = 'REFUND_RESTORE';

        v_max_restorable := GREATEST(0, v_sale.loyalty_points_redeemed - v_already_restored);

        IF v_max_restorable > 0 THEN
          IF v_new_sale_status = 'REFUNDED' THEN
            -- Final/Full refund guard: restore all remaining points
            v_restore_points := v_max_restorable;
          ELSE
            -- B_sale: total net item base before global discounts
            SELECT COALESCE(SUM((quantity * unit_price) - item_discount_amount), 0)
            INTO v_b_sale
            FROM sale_items
            WHERE sale_id = v_sale.id;

            -- B_refund: net item base of items refunded in THIS refund document
            SELECT COALESCE(SUM((sri.quantity * si.unit_price) - (sri.quantity * (si.item_discount_amount / si.quantity))), 0)
            INTO v_b_refund
            FROM sale_refund_items sri
            JOIN sale_items si ON si.id = sri.sale_item_id
            WHERE sri.refund_id = p_refund_id;

            IF v_b_sale > 0 AND v_b_refund > 0 THEN
              v_restore_points := ROUND((v_b_refund / v_b_sale) * v_sale.loyalty_points_redeemed);
              v_restore_points := LEAST(v_restore_points, v_max_restorable);
            ELSE
              v_restore_points := 0;
            END IF;
          END IF;

          IF v_restore_points > 0 THEN
            IF NOT EXISTS (
              SELECT 1 FROM customer_loyalty_ledger
              WHERE refund_id = p_refund_id
                AND transaction_type = 'REFUND_RESTORE'
            ) THEN
              v_customer.current_loyalty_points := v_customer.current_loyalty_points + v_restore_points;

              UPDATE customers
              SET current_loyalty_points = v_customer.current_loyalty_points,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = v_sale.customer_id;

              INSERT INTO customer_loyalty_ledger (
                customer_id, outlet_id, transaction_type,
                points_change, points_balance_after,
                sale_id, refund_id, notes, created_by
              ) VALUES (
                v_sale.customer_id, v_sale.outlet_id, 'REFUND_RESTORE',
                v_restore_points, v_customer.current_loyalty_points,
                v_sale.id, p_refund_id,
                'Pengembalian poin yang ditukarkan (Refund ' || v_refund.refund_number || ' nota ' || v_sale.invoice_number || ')',
                p_processed_by
              );
            END IF;
          END IF;
        END IF;
      END IF;

      -- 8c. Recalculate customer tier after refund
      PERFORM recalculate_customer_tier(v_sale.customer_id);
    END IF;
  END IF;

  -- 9. Audit Log
  INSERT INTO audit_logs (
    user_id, action, entity_type, entity_id, before_state, after_state, reason, created_at
  ) VALUES (
    p_processed_by, 'PROCESS_REFUND', 'sale_refunds', p_refund_id,
    jsonb_build_object('status', 'PENDING'),
    jsonb_build_object('status', 'COMPLETED', 'journal_id', v_journal_id, 'sale_status', v_new_sale_status),
    v_refund.reason, CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'success', true,
    'refund_id', p_refund_id,
    'journal_id', v_journal_id,
    'status', 'COMPLETED',
    'sale_status', v_new_sale_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public._legacy_process_sale_refund(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;


-- ============================================================================
-- 4. AFFIRM PUBLIC ENTRY POINT GRANTS & SECURITY BOUNDARIES
-- ============================================================================
-- Ensure public entry points are callable by authenticated and service_role,
-- while anon remains blocked.
REVOKE EXECUTE ON FUNCTION public.void_sale(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_sale(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.process_sale_refund(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_sale_refund(UUID, UUID) TO authenticated, service_role;

-- Ensure customer_loyalty_ledger direct mutation remains blocked from authenticated
REVOKE INSERT, UPDATE, DELETE ON TABLE public.customer_loyalty_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.customer_loyalty_ledger TO authenticated;
GRANT ALL ON TABLE public.customer_loyalty_ledger TO service_role;


-- ============================================================================
-- 5. POST-MIGRATION SECURITY ASSERTIONS
-- ============================================================================
DO $$
DECLARE
  v_anon BOOLEAN;
  v_auth_execute BOOLEAN;
  v_has_refund_col BOOLEAN;
  v_has_uq_refund BOOLEAN;
  v_has_uq_void BOOLEAN;
BEGIN
  -- 1. Assert refund_id column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_loyalty_ledger'
      AND column_name = 'refund_id'
  ) INTO v_has_refund_col;

  IF NOT v_has_refund_col THEN
    RAISE EXCEPTION 'Security assertion failed: refund_id column missing on customer_loyalty_ledger';
  END IF;

  -- 2. Assert unique indexes exist
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'customer_loyalty_ledger'
      AND indexname = 'uq_loyalty_ledger_refund_event'
  ) INTO v_has_uq_refund;

  IF NOT v_has_uq_refund THEN
    RAISE EXCEPTION 'Security assertion failed: uq_loyalty_ledger_refund_event index missing';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'customer_loyalty_ledger'
      AND indexname = 'uq_loyalty_ledger_void_event'
  ) INTO v_has_uq_void;

  IF NOT v_has_uq_void THEN
    RAISE EXCEPTION 'Security assertion failed: uq_loyalty_ledger_void_event index missing';
  END IF;

  -- 3. Assert anon cannot execute void_sale or process_sale_refund
  SELECT has_function_privilege('anon', 'public.void_sale(UUID,UUID,TEXT)', 'EXECUTE') INTO v_anon;
  IF v_anon THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute void_sale';
  END IF;

  SELECT has_function_privilege('anon', 'public.process_sale_refund(UUID,UUID)', 'EXECUTE') INTO v_anon;
  IF v_anon THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute process_sale_refund';
  END IF;

  -- 4. Assert authenticated cannot mutate customer_loyalty_ledger directly
  IF has_table_privilege('authenticated', 'public.customer_loyalty_ledger', 'INSERT')
     OR has_table_privilege('authenticated', 'public.customer_loyalty_ledger', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.customer_loyalty_ledger', 'DELETE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can mutate customer_loyalty_ledger directly';
  END IF;

  -- 5. Assert authenticated cannot execute internal legacy functions
  IF has_function_privilege('authenticated', 'public._legacy_void_sale(UUID,UUID,TEXT)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can execute _legacy_void_sale directly';
  END IF;

  IF has_function_privilege('authenticated', 'public._legacy_process_sale_refund(UUID,UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can execute _legacy_process_sale_refund directly';
  END IF;
END $$;
