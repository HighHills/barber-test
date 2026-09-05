-- 20260904000011_atomic_functions_and_rpc.sql
-- Mission-Critical Atomic Transaction Functions: Journal Posting, Stock Transfer, POS Checkout Engine, Void, Refund, and Adjustment

-- 1. post_journal_entry
CREATE OR REPLACE FUNCTION post_journal_entry(
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
  -- Caller Authorization Verification
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = p_posted_by AND auth_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Caller is not authorized for posting profile %', p_posted_by;
    END IF;
  END IF;

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

  -- Calculate sum of debits and credits
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
    RAISE EXCEPTION 'Journal entry must have at least 2 lines to be posted';
  END IF;

  IF v_total_debit != v_total_credit THEN
    RAISE EXCEPTION 'Accounting Invariant Violated: Total Debit (%) != Total Credit (%)', v_total_debit, v_total_credit;
  END IF;

  -- Update to POSTED
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


-- 2. process_stock_transfer
CREATE OR REPLACE FUNCTION process_stock_transfer(
  p_transfer_id UUID,
  p_approved_by UUID
) RETURNS JSONB AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_source_stock RECORD;
  v_dest_stock RECORD;
  v_new_dest_avg_cost NUMERIC(18,2);
  v_new_dest_qty NUMERIC(18,4);
BEGIN
  -- Caller Authorization Verification
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = p_approved_by AND auth_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Caller is not authorized for approver profile %', p_approved_by;
    END IF;
  END IF;

  SELECT * INTO v_transfer
  FROM stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Transfer already completed');
  END IF;

  FOR v_item IN
    SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    -- 1. Source Outlet: Lock & deduct
    SELECT * INTO v_source_stock
    FROM outlet_inventory
    WHERE outlet_id = v_transfer.from_outlet_id AND product_id = v_item.product_id
    FOR UPDATE;

    IF NOT FOUND OR v_source_stock.quantity < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product % at source outlet. Available: %, Requested: %',
        v_item.product_id, COALESCE(v_source_stock.quantity, 0), v_item.quantity;
    END IF;

    UPDATE outlet_inventory
    SET
      quantity = quantity - v_item.quantity,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_source_stock.id;

    -- Record TRANSFER_OUT movement
    INSERT INTO inventory_movements (
      outlet_id, product_id, movement_type, quantity, unit_cost,
      quantity_before, quantity_after, reference_type, reference_id,
      occurred_at, created_by
    ) VALUES (
      v_transfer.from_outlet_id, v_item.product_id, 'TRANSFER_OUT', -v_item.quantity, v_source_stock.average_cost,
      v_source_stock.quantity, v_source_stock.quantity - v_item.quantity, 'TRANSFER', p_transfer_id,
      CURRENT_TIMESTAMP, p_approved_by
    );

    -- 2. Destination Outlet: Lock & add with Moving Average Cost update
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

      -- Record TRANSFER_IN movement
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

      -- Record TRANSFER_IN movement
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
  SET
    status = 'COMPLETED',
    approved_by = p_approved_by,
    completed_at = CURRENT_TIMESTAMP
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('success', true, 'transfer_id', p_transfer_id, 'status', 'COMPLETED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- 3. process_pos_sale (Master Atomic POS Engine with Level 2 Double-Entry Accounting)
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
  v_existing_sale RECORD;
  v_sale_id UUID;
  v_invoice_number VARCHAR(50);
  v_session RECORD;
  v_period RECORD;
  v_item JSONB;
  v_payment JSONB;
  v_item_subtotal NUMERIC(18,2) := 0.00;
  v_total_amount NUMERIC(18,2) := 0.00;
  v_payments_sum NUMERIC(18,2) := 0.00;
  v_stock RECORD;
  v_cost_price NUMERIC(18,2);
  v_consumption RECORD;
  v_sale_item_id UUID;

  -- Accounting Totals
  v_total_service_revenue NUMERIC(18,2) := 0.00;
  v_total_product_revenue NUMERIC(18,2) := 0.00;
  v_total_tax NUMERIC(18,2) := 0.00;
  v_total_cogs NUMERIC(18,2) := 0.00;
  v_total_commission NUMERIC(18,2) := 0.00;
  v_revenue_diff NUMERIC(18,2) := 0.00;

  -- Financial Accounts
  v_payment_account_id UUID;
  v_service_rev_id UUID;
  v_product_rev_id UUID;
  v_tax_payable_id UUID;
  v_cogs_id UUID;
  v_inventory_id UUID;
  v_comm_expense_id UUID;
  v_comm_payable_id UUID;
  v_journal_id UUID;
  v_journal_number VARCHAR(50);
  v_pm RECORD;
BEGIN
  -- 0. Caller Authorization Verification
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = p_cashier_id AND auth_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Caller is not authorized for cashier profile %', p_cashier_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      JOIN profiles p ON p.id = ur.user_id
      WHERE p.id = p_cashier_id
        AND r.is_active = TRUE
        AND (
          (r.code IN ('OWNER', 'ADMIN'))
          OR (ur.outlet_id IS NOT NULL AND ur.outlet_id = p_outlet_id)
        )
    ) THEN
      RAISE EXCEPTION 'Cashier % does not have access to outlet %', p_cashier_id, p_outlet_id;
    END IF;
  END IF;

  -- 1. Idempotency Check
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

  -- 2. Validate Cash Session if provided
  IF p_cash_session_id IS NOT NULL THEN
    SELECT * INTO v_session
    FROM cash_sessions
    WHERE id = p_cash_session_id;

    IF NOT FOUND OR v_session.status != 'OPEN' THEN
      RAISE EXCEPTION 'Active cash session % is not OPEN', p_cash_session_id;
    END IF;
  END IF;

  -- 3. Verify Financial Period is OPEN
  SELECT * INTO v_period
  FROM financial_periods
  WHERE CURRENT_DATE >= period_start AND CURRENT_DATE <= period_end;

  IF FOUND AND v_period.status = 'CLOSED' THEN
    RAISE EXCEPTION 'Cannot process sale into a CLOSED financial period (%)', v_period.id;
  END IF;

  -- 4. Validate Payments Sum
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    v_payments_sum := v_payments_sum + (v_payment->>'amount')::NUMERIC(18,2);
  END LOOP;

  -- Calculate item subtotals
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_subtotal := v_item_subtotal + (v_item->>'total_amount')::NUMERIC(18,2);
  END LOOP;

  v_total_amount := v_item_subtotal;

  IF ABS(v_payments_sum - v_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Payment Sum (%) does not match Sale Total (%)', v_payments_sum, v_total_amount;
  END IF;

  -- 5. Generate Invoice Number & Sale ID
  v_invoice_number := 'INV-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');
  v_sale_id := gen_random_uuid();

  -- 6. Insert Sale Header
  INSERT INTO sales (
    id, invoice_number, outlet_id, customer_id, cash_session_id,
    subtotal, discount_amount, tax_amount, total_amount, status,
    idempotency_key, sold_at, created_by
  ) VALUES (
    v_sale_id, v_invoice_number, p_outlet_id, p_customer_id, p_cash_session_id,
    v_item_subtotal, p_discount_amount, 0.00, v_total_amount, 'COMPLETED',
    p_idempotency_key, CURRENT_TIMESTAMP, p_cashier_id
  );

  -- 7. Insert Items, Deduct Inventory, Calculate Cost & Commissions
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sale_item_id := gen_random_uuid();
    v_cost_price := 0.00;

    -- If Product: Check stock and deduct
    IF (v_item->>'item_type') = 'PRODUCT' THEN
      SELECT * INTO v_stock
      FROM outlet_inventory
      WHERE outlet_id = p_outlet_id AND product_id = (v_item->>'product_id')::UUID
      FOR UPDATE;

      IF NOT FOUND OR v_stock.quantity < (v_item->>'quantity')::NUMERIC(18,4) THEN
        RAISE EXCEPTION 'Insufficient inventory for product % at outlet %', v_item->>'product_id', p_outlet_id;
      END IF;

      v_cost_price := v_stock.average_cost;

      UPDATE outlet_inventory
      SET
        quantity = quantity - (v_item->>'quantity')::NUMERIC(18,4),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = v_stock.id;

      INSERT INTO inventory_movements (
        outlet_id, product_id, movement_type, quantity, unit_cost,
        quantity_before, quantity_after, reference_type, reference_id,
        occurred_at, created_by
      ) VALUES (
        p_outlet_id, (v_item->>'product_id')::UUID, 'SALE', -(v_item->>'quantity')::NUMERIC(18,4), v_cost_price,
        v_stock.quantity, v_stock.quantity - (v_item->>'quantity')::NUMERIC(18,4), 'SALE', v_sale_id,
        CURRENT_TIMESTAMP, p_cashier_id
      );

      v_total_cogs := v_total_cogs + ((v_item->>'quantity')::NUMERIC(18,4) * v_cost_price);
      v_total_product_revenue := v_total_product_revenue + ((v_item->>'total_amount')::NUMERIC(18,2) - COALESCE((v_item->>'tax_amount')::NUMERIC(18,2), 0.00));
    END IF;

    -- If Service: Check service consumption and deduct consumable materials
    IF (v_item->>'item_type') = 'SERVICE' THEN
      FOR v_consumption IN
        SELECT * FROM service_consumptions
        WHERE service_id = (v_item->>'service_id')::UUID AND is_active = TRUE
      LOOP
        SELECT * INTO v_stock
        FROM outlet_inventory
        WHERE outlet_id = p_outlet_id AND product_id = v_consumption.product_id
        FOR UPDATE;

        IF FOUND AND v_stock.quantity >= (v_consumption.quantity * (v_item->>'quantity')::NUMERIC(18,4)) THEN
          UPDATE outlet_inventory
          SET
            quantity = quantity - (v_consumption.quantity * (v_item->>'quantity')::NUMERIC(18,4)),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = v_stock.id;

          INSERT INTO inventory_movements (
            outlet_id, product_id, movement_type, quantity, unit_cost,
            quantity_before, quantity_after, reference_type, reference_id,
            occurred_at, created_by
          ) VALUES (
            p_outlet_id, v_consumption.product_id, 'SERVICE_CONSUMPTION',
            -(v_consumption.quantity * (v_item->>'quantity')::NUMERIC(18,4)), v_stock.average_cost,
            v_stock.quantity, v_stock.quantity - (v_consumption.quantity * (v_item->>'quantity')::NUMERIC(18,4)),
            'SALE', v_sale_id, CURRENT_TIMESTAMP, p_cashier_id
          );

          v_total_cogs := v_total_cogs + ((v_consumption.quantity * (v_item->>'quantity')::NUMERIC(18,4)) * v_stock.average_cost);
        END IF;
      END LOOP;

      v_total_service_revenue := v_total_service_revenue + ((v_item->>'total_amount')::NUMERIC(18,2) - COALESCE((v_item->>'tax_amount')::NUMERIC(18,2), 0.00));
    END IF;

    -- Track tax amount
    v_total_tax := v_total_tax + COALESCE((v_item->>'tax_amount')::NUMERIC(18,2), 0.00);

    -- Insert sale item snapshot
    INSERT INTO sale_items (
      id, sale_id, item_type, service_id, product_id, barber_id,
      description_snapshot, quantity, unit_price, item_discount_amount,
      allocated_discount_amount, tax_amount, total_amount, cost_price,
      commission_type, commission_rate, commission_amount
    ) VALUES (
      v_sale_item_id, v_sale_id, (v_item->>'item_type')::sale_item_type_enum,
      (v_item->>'service_id')::UUID, (v_item->>'product_id')::UUID, (v_item->>'barber_id')::UUID,
      COALESCE(v_item->>'description_snapshot', 'Item'), (v_item->>'quantity')::NUMERIC(18,4),
      (v_item->>'unit_price')::NUMERIC(18,2), COALESCE((v_item->>'item_discount_amount')::NUMERIC(18,2), 0.00),
      COALESCE((v_item->>'allocated_discount_amount')::NUMERIC(18,2), 0.00),
      COALESCE((v_item->>'tax_amount')::NUMERIC(18,2), 0.00),
      (v_item->>'total_amount')::NUMERIC(18,2), v_cost_price,
      (v_item->>'commission_type')::commission_type_enum,
      (v_item->>'commission_rate')::NUMERIC(18,2),
      (v_item->>'commission_amount')::NUMERIC(18,2)
    );

    -- If barber commission is present, record into commissions ledger
    IF (v_item->>'barber_id') IS NOT NULL AND (v_item->>'commission_amount')::NUMERIC(18,2) > 0 THEN
      INSERT INTO commissions (
        sale_id, sale_item_id, employee_id, outlet_id,
        commission_type, commission_rate, commission_amount,
        status, earned_at
      ) VALUES (
        v_sale_id, v_sale_item_id, (v_item->>'barber_id')::UUID, p_outlet_id,
        (v_item->>'commission_type')::commission_type_enum,
        (v_item->>'commission_rate')::NUMERIC(18,2),
        (v_item->>'commission_amount')::NUMERIC(18,2),
        'EARNED', CURRENT_TIMESTAMP
      );

      v_total_commission := v_total_commission + (v_item->>'commission_amount')::NUMERIC(18,2);
    END IF;
  END LOOP;

  -- 8. Insert Payments
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

  -- 9. LEVEL 2 DOUBLE-ENTRY JOURNAL CREATION (Balanced compound entry)
  -- Rebalance revenue with total amount to prevent 1-cent split rounding mismatch
  v_revenue_diff := v_total_amount - (v_total_service_revenue + v_total_product_revenue + v_total_tax);
  IF v_revenue_diff != 0.00 THEN
    IF v_total_service_revenue > 0 THEN
      v_total_service_revenue := v_total_service_revenue + v_revenue_diff;
    ELSE
      v_total_product_revenue := v_total_product_revenue + v_revenue_diff;
    END IF;
  END IF;

  -- Dynamic Account Lookups
  SELECT id INTO v_service_rev_id FROM financial_accounts WHERE account_code = '4000' LIMIT 1;
  SELECT id INTO v_product_rev_id FROM financial_accounts WHERE account_code = '4100' LIMIT 1;
  SELECT id INTO v_tax_payable_id FROM financial_accounts WHERE account_code = '2200' LIMIT 1;
  SELECT id INTO v_cogs_id FROM financial_accounts WHERE account_code = '5000' LIMIT 1;
  SELECT id INTO v_inventory_id FROM financial_accounts WHERE account_code = '1300' LIMIT 1;
  SELECT id INTO v_comm_expense_id FROM financial_accounts WHERE account_code = '5100' LIMIT 1;
  SELECT id INTO v_comm_payable_id FROM financial_accounts WHERE account_code = '2100' LIMIT 1;

  v_journal_id := gen_random_uuid();
  v_journal_number := 'JRN-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

  INSERT INTO journal_entries (
    id, journal_number, journal_date, reference_type, reference_id,
    description, status, created_by, posted_by, posted_at
  ) VALUES (
    v_journal_id, v_journal_number, CURRENT_DATE, 'SALE', v_sale_id,
    'Automated POS sale journal for invoice ' || v_invoice_number,
    'POSTED', p_cashier_id, p_cashier_id, CURRENT_TIMESTAMP
  );

  -- A. Debit Payment Asset Accounts
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    SELECT * INTO v_pm FROM payment_methods WHERE id = (v_payment->>'payment_method_id')::UUID;
    v_payment_account_id := v_pm.financial_account_id;

    -- Dynamic fallback if payment method does not have financial_account_id set directly
    IF v_payment_account_id IS NULL THEN
      IF v_pm.type = 'CASH' THEN
        SELECT id INTO v_payment_account_id FROM financial_accounts WHERE account_code = '1000' LIMIT 1;
      ELSIF v_pm.type = 'QRIS' THEN
        SELECT id INTO v_payment_account_id FROM financial_accounts WHERE account_code = '1200' LIMIT 1;
      ELSE
        SELECT id INTO v_payment_account_id FROM financial_accounts WHERE account_code = '1100' LIMIT 1;
      END IF;

      IF v_payment_account_id IS NULL THEN
        SELECT id INTO v_payment_account_id FROM financial_accounts WHERE account_type = 'ASSET' ORDER BY account_code ASC LIMIT 1;
      END IF;
    END IF;

    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_payment_account_id, p_outlet_id,
      (v_payment->>'amount')::NUMERIC(18,2), 0.00,
      'Payment received (' || v_pm.name || ') for invoice ' || v_invoice_number
    );
  END LOOP;

  -- B. Credit Revenue Accounts
  IF v_total_service_revenue > 0 AND v_service_rev_id IS NOT NULL THEN
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_service_rev_id, p_outlet_id, 0.00, v_total_service_revenue,
      'Service revenue for invoice ' || v_invoice_number
    );
  END IF;

  IF v_total_product_revenue > 0 AND v_product_rev_id IS NOT NULL THEN
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_product_rev_id, p_outlet_id, 0.00, v_total_product_revenue,
      'Product revenue for invoice ' || v_invoice_number
    );
  END IF;

  -- C. Credit Tax Payable
  IF v_total_tax > 0 AND v_tax_payable_id IS NOT NULL THEN
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_tax_payable_id, p_outlet_id, 0.00, v_total_tax,
      'Tax payable for invoice ' || v_invoice_number
    );
  END IF;

  -- D. COGS and Inventory Asset (if applicable)
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

  -- E. Commission Expense and Commission Payable (if applicable)
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

  -- 10. Write Immutable Audit Log
  INSERT INTO audit_logs (
    user_id, action, entity_type, entity_id, after_state, created_at
  ) VALUES (
    p_cashier_id, 'PROCESS_SALE', 'sales', v_sale_id,
    jsonb_build_object('invoice_number', v_invoice_number, 'total_amount', v_total_amount, 'journal_id', v_journal_id),
    CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'invoice_number', v_invoice_number,
    'total_amount', v_total_amount,
    'journal_id', v_journal_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- 4. void_sale (Atomic Shift/Same-Day Void with Stock Rollback & Journal Reversal)
CREATE OR REPLACE FUNCTION void_sale(
  p_sale_id UUID,
  p_voided_by UUID,
  p_reason TEXT
) RETURNS JSONB AS $$
DECLARE
  v_sale RECORD;
  v_item RECORD;
  v_stock RECORD;
  v_consumption RECORD;
  v_orig_journal RECORD;
  v_rev_journal_id UUID;
  v_rev_journal_number VARCHAR(50);
BEGIN
  -- Caller Authorization Verification
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = p_voided_by AND auth_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Caller is not authorized for voiding profile %', p_voided_by;
    END IF;
  END IF;

  -- Lock Sale
  SELECT * INTO v_sale
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found', p_sale_id;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF NOT current_user_has_outlet_access(v_sale.outlet_id) THEN
      RAISE EXCEPTION 'Caller does not have access to outlet %', v_sale.outlet_id;
    END IF;
  END IF;

  IF v_sale.status != 'COMPLETED' THEN
    RAISE EXCEPTION 'Cannot void sale with status % (must be COMPLETED)', v_sale.status;
  END IF;

  -- 1. Rollback Inventory for each item
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

  -- 2. Cancel Commissions
  UPDATE commissions
  SET status = 'VOIDED'
  WHERE sale_id = p_sale_id;

  -- 3. Post Reversing Accounting Journal
  SELECT * INTO v_orig_journal
  FROM journal_entries
  WHERE reference_type = 'SALE' AND reference_id = p_sale_id AND status = 'POSTED'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_rev_journal_id := gen_random_uuid();
    v_rev_journal_number := 'JRN-REV-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

    INSERT INTO journal_entries (
      id, journal_number, journal_date, reference_type, reference_id,
      description, status, created_by, posted_by, posted_at, reversed_journal_id
    ) VALUES (
      v_rev_journal_id, v_rev_journal_number, CURRENT_DATE, 'SALE', p_sale_id,
      'Reversal journal of VOID sale ' || v_sale.invoice_number || ': ' || p_reason,
      'POSTED', p_voided_by, p_voided_by, CURRENT_TIMESTAMP, v_orig_journal.id
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

    UPDATE journal_entries
    SET status = 'REVERSED', reversed_journal_id = v_rev_journal_id
    WHERE id = v_orig_journal.id;
  END IF;

  -- 4. Update Sale Status
  UPDATE sales
  SET
    status = 'VOIDED',
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_sale_id;

  -- 5. Audit Log
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


-- 5. process_sale_refund (Item-Level and Full Refund Engine)
CREATE OR REPLACE FUNCTION process_sale_refund(
  p_refund_id UUID,
  p_processed_by UUID
) RETURNS JSONB AS $$
DECLARE
  v_refund RECORD;
  v_sale RECORD;
  v_ref_item RECORD;
  v_sale_item RECORD;
  v_stock RECORD;
  v_total_refund_cogs NUMERIC(18,2) := 0.00;
  v_contra_rev_id UUID;
  v_cash_acc_id UUID;
  v_tax_acc_id UUID;
  v_cogs_acc_id UUID;
  v_inv_acc_id UUID;
  v_journal_id UUID;
  v_journal_number VARCHAR(50);
BEGIN
  -- Caller Authorization Verification
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = p_processed_by AND auth_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Caller is not authorized for refund profile %', p_processed_by;
    END IF;
  END IF;

  SELECT * INTO v_refund
  FROM sale_refunds
  WHERE id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund % not found', p_refund_id;
  END IF;

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

  IF auth.uid() IS NOT NULL THEN
    IF NOT current_user_has_outlet_access(v_refund.outlet_id) THEN
      RAISE EXCEPTION 'Caller does not have access to outlet %', v_refund.outlet_id;
    END IF;
  END IF;

  SELECT * INTO v_sale
  FROM sales
  WHERE id = v_refund.sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found for refund', v_refund.sale_id;
  END IF;

  IF v_sale.status NOT IN ('COMPLETED', 'REFUNDED') THEN
    RAISE EXCEPTION 'Cannot refund sale in status %', v_sale.status;
  END IF;

  -- 1. Restock items marked return_to_inventory
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

    -- Void associated commission
    IF v_sale_item.barber_id IS NOT NULL THEN
      UPDATE commissions
      SET status = 'VOIDED'
      WHERE sale_item_id = v_sale_item.id;
    END IF;
  END LOOP;

  -- 2. Post Level 2 Double-Entry Refund Journal
  SELECT id INTO v_contra_rev_id FROM financial_accounts WHERE account_code = '5600' LIMIT 1;
  IF v_contra_rev_id IS NULL THEN
    SELECT id INTO v_contra_rev_id FROM financial_accounts WHERE account_code = '4000' LIMIT 1;
  END IF;

  SELECT id INTO v_cash_acc_id FROM financial_accounts WHERE account_code = '1000' LIMIT 1;
  SELECT id INTO v_tax_acc_id FROM financial_accounts WHERE account_code = '2200' LIMIT 1;
  SELECT id INTO v_cogs_acc_id FROM financial_accounts WHERE account_code = '5000' LIMIT 1;
  SELECT id INTO v_inv_acc_id FROM financial_accounts WHERE account_code = '1300' LIMIT 1;

  v_journal_id := gen_random_uuid();
  v_journal_number := 'JRN-REF-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

  INSERT INTO journal_entries (
    id, journal_number, journal_date, reference_type, reference_id,
    description, status, created_by, posted_by, posted_at
  ) VALUES (
    v_journal_id, v_journal_number, CURRENT_DATE, 'REFUND', p_refund_id,
    'Refund journal for invoice ' || v_sale.invoice_number || ' (' || v_refund.refund_number || ')',
    'POSTED', p_processed_by, p_processed_by, CURRENT_TIMESTAMP
  );

  -- Debit: Contra Revenue / Refund Expense
  INSERT INTO journal_lines (
    journal_entry_id, financial_account_id, outlet_id, debit, credit, description
  ) VALUES (
    v_journal_id, v_contra_rev_id, v_refund.outlet_id,
    v_refund.total_amount - v_refund.tax_amount, 0.00,
    'Contra-revenue for refund ' || v_refund.refund_number
  );

  -- Debit: Tax Payable (decreasing liability if tax was refunded)
  IF v_refund.tax_amount > 0 AND v_tax_acc_id IS NOT NULL THEN
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_tax_acc_id, v_refund.outlet_id,
      v_refund.tax_amount, 0.00,
      'Tax refund adjustment for ' || v_refund.refund_number
    );
  END IF;

  -- Credit: Cash Outflow / Cash on Hand
  INSERT INTO journal_lines (
    journal_entry_id, financial_account_id, outlet_id, debit, credit, description
  ) VALUES (
    v_journal_id, v_cash_acc_id, v_refund.outlet_id,
    0.00, v_refund.total_amount,
    'Cash refund payout for ' || v_refund.refund_number
  );

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

  -- 3. Update Statuses
  UPDATE sale_refunds
  SET status = 'COMPLETED', refunded_at = CURRENT_TIMESTAMP
  WHERE id = p_refund_id;

  UPDATE sales
  SET status = 'REFUNDED', updated_at = CURRENT_TIMESTAMP
  WHERE id = v_sale.id;

  -- 4. Audit Log
  INSERT INTO audit_logs (
    user_id, action, entity_type, entity_id, after_state, created_at
  ) VALUES (
    p_processed_by, 'PROCESS_REFUND', 'sale_refunds', p_refund_id,
    jsonb_build_object('refund_number', v_refund.refund_number, 'total_amount', v_refund.total_amount, 'journal_id', v_journal_id),
    CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'success', true,
    'refund_id', p_refund_id,
    'journal_id', v_journal_id,
    'status', 'COMPLETED'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- 6. process_stock_adjustment (Stock Opname Engine with Double-Entry Journals)
CREATE OR REPLACE FUNCTION process_stock_adjustment(
  p_adjustment_id UUID,
  p_approved_by UUID
) RETURNS JSONB AS $$
DECLARE
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
  -- Caller Authorization Verification
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = p_approved_by AND auth_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Caller is not authorized for approver profile %', p_approved_by;
    END IF;
  END IF;

  SELECT * INTO v_adj
  FROM stock_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock adjustment % not found', p_adjustment_id;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF NOT current_user_has_outlet_access(v_adj.outlet_id) THEN
      RAISE EXCEPTION 'Caller does not have access to outlet %', v_adj.outlet_id;
    END IF;
  END IF;

  IF v_adj.status IN ('APPROVED', 'APPLIED') THEN
    RETURN jsonb_build_object('success', true, 'message', 'Adjustment already applied');
  END IF;

  -- 1. Apply line adjustments
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
      -- Shrinkage / Waste: ADJUSTMENT_OUT
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
      -- Surplus / Found: ADJUSTMENT_IN
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

  -- 2. Post Level 2 Double-Entry Adjustment Journal (if any value variance)
  IF v_total_loss > 0 OR v_total_gain > 0 THEN
    SELECT id INTO v_inv_loss_acc_id FROM financial_accounts WHERE account_code = '5700' LIMIT 1;
    SELECT id INTO v_inv_asset_acc_id FROM financial_accounts WHERE account_code = '1300' LIMIT 1;

    v_journal_id := gen_random_uuid();
    v_journal_number := 'JRN-ADJ-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

    INSERT INTO journal_entries (
      id, journal_number, journal_date, reference_type, reference_id,
      description, status, created_by, posted_by, posted_at
    ) VALUES (
      v_journal_id, v_journal_number, CURRENT_DATE, 'ADJUSTMENT', p_adjustment_id,
      'Stock adjustment journal #' || v_adj.adjustment_number || ': ' || v_adj.reason,
      'POSTED', p_approved_by, p_approved_by, CURRENT_TIMESTAMP
    );

    IF v_total_loss > 0 AND v_inv_loss_acc_id IS NOT NULL AND v_inv_asset_acc_id IS NOT NULL THEN
      -- Debit: Inventory Loss Expense
      INSERT INTO journal_lines (
        journal_entry_id, financial_account_id, outlet_id, debit, credit, description
      ) VALUES (
        v_journal_id, v_inv_loss_acc_id, v_adj.outlet_id, v_total_loss, 0.00,
        'Inventory loss / shrinkage for #' || v_adj.adjustment_number
      );

      -- Credit: Inventory Asset
      INSERT INTO journal_lines (
        journal_entry_id, financial_account_id, outlet_id, debit, credit, description
      ) VALUES (
        v_journal_id, v_inv_asset_acc_id, v_adj.outlet_id, 0.00, v_total_loss,
        'Inventory asset reduction for #' || v_adj.adjustment_number
      );
    END IF;

    IF v_total_gain > 0 AND v_inv_loss_acc_id IS NOT NULL AND v_inv_asset_acc_id IS NOT NULL THEN
      -- Debit: Inventory Asset
      INSERT INTO journal_lines (
        journal_entry_id, financial_account_id, outlet_id, debit, credit, description
      ) VALUES (
        v_journal_id, v_inv_asset_acc_id, v_adj.outlet_id, v_total_gain, 0.00,
        'Inventory asset gain for #' || v_adj.adjustment_number
      );

      -- Credit: Inventory Loss Offset / Surplus
      INSERT INTO journal_lines (
        journal_entry_id, financial_account_id, outlet_id, debit, credit, description
      ) VALUES (
        v_journal_id, v_inv_loss_acc_id, v_adj.outlet_id, 0.00, v_total_gain,
        'Inventory surplus / offset for #' || v_adj.adjustment_number
      );
    END IF;
  END IF;

  -- 3. Update Status
  UPDATE stock_adjustments
  SET
    status = 'APPLIED',
    approved_by = p_approved_by
  WHERE id = p_adjustment_id;

  -- 4. Audit Log
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
