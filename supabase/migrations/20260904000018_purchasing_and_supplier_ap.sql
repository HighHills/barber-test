-- 20260904000018_purchasing_and_supplier_ap.sql
-- Module: Purchasing, Goods Receipt, Moving Average Costing, and Accounts Payable (AP) Settlement

-- ============================================================================
-- 1. HELPER: UPSERT SUPPLIER
-- ============================================================================
CREATE OR REPLACE FUNCTION upsert_supplier(
  p_id UUID DEFAULT NULL,
  p_code TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_supplier_id UUID;
  v_code VARCHAR(50);
  v_res JSONB;
BEGIN
  -- Permission check: Owner, Admin, Manager, Inventory or unauthenticated dev
  IF NOT (
    is_owner_or_admin() 
    OR current_user_has_permission('inventory.purchase')
    OR auth.uid() IS NULL
  ) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Owner, Admin, atau Staf Inventori yang dapat mengelola supplier';
  END IF;

  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Nama supplier/vendor wajib diisi';
  END IF;

  -- Generate code if not provided
  IF p_code IS NULL OR TRIM(p_code) = '' THEN
    v_code := 'SUP-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  ELSE
    v_code := UPPER(TRIM(p_code));
  END IF;

  IF p_id IS NOT NULL THEN
    -- Update existing supplier
    UPDATE suppliers
    SET
      code = v_code,
      name = TRIM(p_name),
      phone = TRIM(p_phone),
      email = TRIM(p_email),
      address = TRIM(p_address),
      is_active = p_is_active,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id
    RETURNING id INTO v_supplier_id;

    IF v_supplier_id IS NULL THEN
      RAISE EXCEPTION 'Supplier dengan ID % tidak ditemukan', p_id;
    END IF;
  ELSE
    -- Insert new supplier
    INSERT INTO suppliers (code, name, phone, email, address, is_active)
    VALUES (v_code, TRIM(p_name), TRIM(p_phone), TRIM(p_email), TRIM(p_address), p_is_active)
    RETURNING id INTO v_supplier_id;
  END IF;

  SELECT json_build_object(
    'success', true,
    'id', v_supplier_id,
    'code', v_code,
    'name', TRIM(p_name),
    'message', 'Data supplier berhasil disimpan'
  )::JSONB INTO v_res;

  RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION upsert_supplier(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_supplier(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, anon;


-- ============================================================================
-- 2. HELPER: DELETE / DEACTIVATE SUPPLIER
-- ============================================================================
CREATE OR REPLACE FUNCTION delete_supplier(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_has_purchases BOOLEAN;
  v_res JSONB;
BEGIN
  IF NOT (
    is_owner_or_admin() 
    OR current_user_has_permission('inventory.purchase')
    OR auth.uid() IS NULL
  ) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Owner, Admin, atau Staf Inventori yang dapat menghapus supplier';
  END IF;

  SELECT EXISTS(SELECT 1 FROM purchases WHERE supplier_id = p_id LIMIT 1) INTO v_has_purchases;

  IF v_has_purchases THEN
    UPDATE suppliers
    SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    SELECT json_build_object(
      'success', true,
      'id', p_id,
      'status', 'DEACTIVATED',
      'message', 'Supplier telah memiliki transaksi, status diubah menjadi non-aktif'
    )::JSONB INTO v_res;
  ELSE
    DELETE FROM suppliers WHERE id = p_id;

    SELECT json_build_object(
      'success', true,
      'id', p_id,
      'status', 'DELETED',
      'message', 'Data supplier berhasil dihapus permanen'
    )::JSONB INTO v_res;
  END IF;

  RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_supplier(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_supplier(UUID) TO authenticated, anon;


-- ============================================================================
-- 3. CREATE PURCHASE ORDER (PO DRAFT / AUTO-RECEIVE)
-- ============================================================================
CREATE OR REPLACE FUNCTION create_purchase_order(
  p_outlet_id UUID,
  p_supplier_id UUID,
  p_items JSONB, -- Array of { product_id, quantity, unit_cost, discount_amount, tax_amount }
  p_discount_amount NUMERIC DEFAULT 0.00,
  p_tax_amount NUMERIC DEFAULT 0.00,
  p_notes TEXT DEFAULT NULL,
  p_auto_receive BOOLEAN DEFAULT FALSE,
  p_created_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_purchase_id UUID := gen_random_uuid();
  v_po_number VARCHAR(50);
  v_item JSONB;
  v_subtotal NUMERIC(18,2) := 0.00;
  v_total NUMERIC(18,2) := 0.00;
  v_item_qty NUMERIC(18,4);
  v_item_cost NUMERIC(18,2);
  v_item_disc NUMERIC(18,2);
  v_item_tax NUMERIC(18,2);
  v_item_total NUMERIC(18,2);
  v_res JSONB;
BEGIN
  -- Resolve valid profile ID
  IF p_created_by IS NOT NULL THEN
    v_user_id := p_created_by;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_user_id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM profiles ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Security Guard
  IF NOT (
    is_owner_or_admin() 
    OR current_user_has_permission('inventory.purchase')
    OR (v_user_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = v_user_id
           AND r.code IN ('OWNER', 'ADMIN', 'MANAGER', 'INVENTORY')
           AND r.is_active = TRUE
       ))
    OR (auth.uid() IS NULL AND v_user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Owner, Admin, atau Staf Inventori yang dapat membuat pesanan pembelian';
  END IF;

  -- Validate outlet and supplier
  IF NOT EXISTS (SELECT 1 FROM outlets WHERE id = p_outlet_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Outlet cabang tidak valid atau tidak aktif';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM suppliers WHERE id = p_supplier_id) THEN
    RAISE EXCEPTION 'Supplier tidak valid';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Pesanan pembelian harus berisi setidaknya 1 item produk';
  END IF;

  -- Generate unique PO Number: PO-YYYYMMDD-XXXXXX
  v_po_number := 'PO-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

  -- Calculate subtotal across items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_item_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);
    v_item_disc := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
    v_item_tax := COALESCE((v_item->>'tax_amount')::NUMERIC, 0);

    IF v_item_qty <= 0 THEN
      RAISE EXCEPTION 'Kuantitas produk harus lebih besar dari 0';
    END IF;

    IF v_item_cost < 0 THEN
      RAISE EXCEPTION 'Harga modal produk tidak boleh negatif';
    END IF;

    v_item_total := (v_item_qty * v_item_cost) - v_item_disc + v_item_tax;
    v_subtotal := v_subtotal + v_item_total;
  END LOOP;

  v_total := v_subtotal - COALESCE(p_discount_amount, 0) + COALESCE(p_tax_amount, 0);
  IF v_total < 0 THEN
    v_total := 0.00;
  END IF;

  -- Insert into purchases header
  INSERT INTO purchases (
    id, purchase_number, outlet_id, supplier_id, status,
    subtotal, discount_amount, tax_amount, total_amount,
    payment_status, purchased_at, created_by
  ) VALUES (
    v_purchase_id, v_po_number, p_outlet_id, p_supplier_id, 'DRAFT',
    v_subtotal, COALESCE(p_discount_amount, 0), COALESCE(p_tax_amount, 0), v_total,
    'UNPAID', CURRENT_TIMESTAMP, v_user_id
  );

  -- Insert purchase items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_qty := (v_item->>'quantity')::NUMERIC;
    v_item_cost := (v_item->>'unit_cost')::NUMERIC;
    v_item_disc := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
    v_item_tax := COALESCE((v_item->>'tax_amount')::NUMERIC, 0);
    v_item_total := (v_item_qty * v_item_cost) - v_item_disc + v_item_tax;

    INSERT INTO purchase_items (
      purchase_id, product_id, quantity, unit_cost, discount_amount, tax_amount, total_amount
    ) VALUES (
      v_purchase_id,
      (v_item->>'product_id')::UUID,
      v_item_qty,
      v_item_cost,
      v_item_disc,
      v_item_tax,
      v_item_total
    );
  END LOOP;

  -- If auto_receive is requested, immediately process goods receipt
  IF p_auto_receive THEN
    v_res := receive_purchase_order(v_purchase_id, v_user_id);
    RETURN v_res;
  END IF;

  SELECT json_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'purchase_number', v_po_number,
    'status', 'DRAFT',
    'total_amount', v_total,
    'message', 'Faktur pesanan pembelian (P.O.) berhasil dibuat sebagai DRAFT'
  )::JSONB INTO v_res;

  RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_purchase_order(UUID, UUID, JSONB, NUMERIC, NUMERIC, TEXT, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_purchase_order(UUID, UUID, JSONB, NUMERIC, NUMERIC, TEXT, BOOLEAN, UUID) TO authenticated, anon;


-- ============================================================================
-- 4. RECEIVE PURCHASE ORDER (GOODS RECEIPT & LEVEL 2 DOUBLE-ENTRY JOURNAL)
-- ============================================================================
CREATE OR REPLACE FUNCTION receive_purchase_order(
  p_purchase_id UUID,
  p_received_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_po purchases%ROWTYPE;
  v_item RECORD;
  v_curr_qty NUMERIC(18,4);
  v_curr_cost NUMERIC(18,2);
  v_new_qty NUMERIC(18,4);
  v_new_cost NUMERIC(18,2);
  v_inv_exists BOOLEAN;
  v_supplier_name TEXT := 'Vendor';
  -- Accounting variables
  v_inv_asset_acc_id UUID;
  v_ap_acc_id UUID;
  v_journal_id UUID;
  v_journal_number VARCHAR(50);
  v_res JSONB;
BEGIN
  -- Resolve valid profile ID
  IF p_received_by IS NOT NULL THEN
    v_user_id := p_received_by;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_user_id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM profiles ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Security Guard
  IF NOT (
    is_owner_or_admin() 
    OR current_user_has_permission('inventory.purchase')
    OR (v_user_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = v_user_id
           AND r.code IN ('OWNER', 'ADMIN', 'MANAGER', 'INVENTORY')
           AND r.is_active = TRUE
       ))
    OR (auth.uid() IS NULL AND v_user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Owner, Admin, atau Staf Inventori yang dapat menerima barang';
  END IF;

  -- Load PO with lock
  SELECT * INTO v_po FROM purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Faktur pesanan pembelian tidak ditemukan';
  END IF;

  IF v_po.status = 'RECEIVED' THEN
    RAISE EXCEPTION 'Barang untuk faktur % sudah pernah diterima sebelumnya', v_po.purchase_number;
  END IF;

  IF v_po.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Faktur % telah dibatalkan dan tidak dapat diterima', v_po.purchase_number;
  END IF;

  -- Lookup supplier name for journal description
  IF v_po.supplier_id IS NOT NULL THEN
    SELECT name INTO v_supplier_name FROM suppliers WHERE id = v_po.supplier_id;
  END IF;

  -- 1. Process Stock & Moving Average Cost for Each Item in outlet_inventory
  FOR v_item IN
    SELECT pi.product_id, pi.quantity, pi.unit_cost, p.name AS product_name
    FROM purchase_items pi
    JOIN products p ON p.id = pi.product_id
    WHERE pi.purchase_id = p_purchase_id
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM outlet_inventory
      WHERE outlet_id = v_po.outlet_id AND product_id = v_item.product_id
    ) INTO v_inv_exists;

    IF v_inv_exists THEN
      SELECT quantity, average_cost
      INTO v_curr_qty, v_curr_cost
      FROM outlet_inventory
      WHERE outlet_id = v_po.outlet_id AND product_id = v_item.product_id
      FOR UPDATE;

      v_curr_qty := COALESCE(v_curr_qty, 0.0000);
      v_curr_cost := COALESCE(v_curr_cost, 0.00);

      -- Moving Average Formula: ((OldQty * OldCost) + (NewQty * NewCost)) / (OldQty + NewQty)
      v_new_qty := v_curr_qty + v_item.quantity;
      IF v_new_qty > 0 THEN
        v_new_cost := ROUND(((v_curr_qty * v_curr_cost) + (v_item.quantity * v_item.unit_cost)) / v_new_qty, 2);
      ELSE
        v_new_cost := v_item.unit_cost;
      END IF;

      UPDATE outlet_inventory
      SET
        quantity = v_new_qty,
        average_cost = v_new_cost,
        updated_at = CURRENT_TIMESTAMP
      WHERE outlet_id = v_po.outlet_id AND product_id = v_item.product_id;
    ELSE
      -- First time stocking this product in this outlet
      v_curr_qty := 0.0000;
      v_curr_cost := 0.00;
      v_new_qty := v_item.quantity;
      v_new_cost := v_item.unit_cost;

      INSERT INTO outlet_inventory (
        outlet_id, product_id, quantity, average_cost, updated_at
      ) VALUES (
        v_po.outlet_id, v_item.product_id, v_new_qty, v_new_cost, CURRENT_TIMESTAMP
      );
    END IF;

    -- Record Immutable Inventory Movement
    INSERT INTO inventory_movements (
      outlet_id, product_id, movement_type, quantity, unit_cost,
      quantity_before, quantity_after, reference_type, reference_id,
      occurred_at, created_by
    ) VALUES (
      v_po.outlet_id,
      v_item.product_id,
      'PURCHASE',
      v_item.quantity,
      v_item.unit_cost,
      v_curr_qty,
      v_new_qty,
      'PURCHASE',
      p_purchase_id,
      CURRENT_TIMESTAMP,
      v_user_id
    );
  END LOOP;

  -- 2. Post Level 2 Double-Entry Journal:
  --    Debit:  1300 Inventory Asset (Persediaan Barang Dagang)
  --    Credit: 2000 Accounts Payable (Hutang Usaha)
  SELECT id INTO v_inv_asset_acc_id FROM financial_accounts WHERE account_code = '1300' LIMIT 1;
  SELECT id INTO v_ap_acc_id FROM financial_accounts WHERE account_code = '2000' LIMIT 1;

  IF v_inv_asset_acc_id IS NOT NULL AND v_ap_acc_id IS NOT NULL AND v_po.total_amount > 0 THEN
    v_journal_id := gen_random_uuid();
    v_journal_number := 'JRN-PO-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

    INSERT INTO journal_entries (
      id, journal_number, journal_date, reference_type, reference_id,
      description, status, created_by
    ) VALUES (
      v_journal_id, v_journal_number, CURRENT_DATE, 'PURCHASE', p_purchase_id,
      'Pengadaan persediaan PO #' || v_po.purchase_number || ' dari ' || v_supplier_name,
      'DRAFT', v_user_id
    );

    -- Line 1: Debit Inventory Asset
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_inv_asset_acc_id, v_po.outlet_id, v_po.total_amount, 0.00,
      'Persediaan masuk PO #' || v_po.purchase_number
    );

    -- Line 2: Credit Accounts Payable (Hutang Usaha)
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_ap_acc_id, v_po.outlet_id, 0.00, v_po.total_amount,
      'Timbul hutang usaha PO #' || v_po.purchase_number || ' kepada ' || v_supplier_name
    );

    -- Central Gate posting
    PERFORM _internal_post_journal_entry(v_journal_id, v_user_id);
  END IF;

  -- 3. Update Purchase Header Status
  UPDATE purchases
  SET
    status = 'RECEIVED',
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_purchase_id;

  SELECT json_build_object(
    'success', true,
    'purchase_id', p_purchase_id,
    'purchase_number', v_po.purchase_number,
    'status', 'RECEIVED',
    'total_amount', v_po.total_amount,
    'journal_number', v_journal_number,
    'message', 'Penerimaan barang fisik berhasil dicatat. Stok bertambah dan jurnal hutang usaha telah diterbitkan.'
  )::JSONB INTO v_res;

  RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION receive_purchase_order(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION receive_purchase_order(UUID, UUID) TO authenticated, anon;


-- ============================================================================
-- 5. RECORD SUPPLIER PAYMENT (ACCOUNTS PAYABLE SETTLEMENT)
-- ============================================================================
CREATE OR REPLACE FUNCTION record_supplier_payment(
  p_purchase_id UUID,
  p_amount NUMERIC,
  p_payment_method_id UUID DEFAULT NULL,
  p_financial_account_id UUID DEFAULT NULL,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_paid_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_po purchases%ROWTYPE;
  v_supplier_id UUID;
  v_supplier_name TEXT := 'Vendor';
  v_already_paid NUMERIC(18,2) := 0.00;
  v_remaining NUMERIC(18,2) := 0.00;
  v_pay_acc_id UUID;
  v_ap_acc_id UUID;
  v_journal_id UUID;
  v_journal_number VARCHAR(50);
  v_payment_id UUID := gen_random_uuid();
  v_new_payment_status purchase_payment_status_enum;
  v_res JSONB;
BEGIN
  -- Resolve valid profile ID
  IF p_paid_by IS NOT NULL THEN
    v_user_id := p_paid_by;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_user_id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM profiles ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Security Guard
  IF NOT (
    is_owner_or_admin() 
    OR current_user_has_permission('finance.post')
    OR current_user_has_permission('inventory.purchase')
    OR (v_user_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = v_user_id
           AND r.code IN ('OWNER', 'ADMIN', 'MANAGER', 'INVENTORY', 'ACCOUNTING')
           AND r.is_active = TRUE
       ))
    OR (auth.uid() IS NULL AND v_user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Owner, Admin, atau Finance yang dapat mencatat pembayaran hutang supplier';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal pembayaran harus lebih besar dari 0';
  END IF;

  -- Load PO with lock
  SELECT * INTO v_po FROM purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Faktur pembelian tidak ditemukan';
  END IF;

  IF v_po.status != 'RECEIVED' THEN
    RAISE EXCEPTION 'Hutang hanya dapat dibayar untuk faktur yang sudah diterima (RECEIVED). Status saat ini: %', v_po.status;
  END IF;

  -- Calculate already paid amount
  SELECT COALESCE(SUM(amount), 0.00) INTO v_already_paid
  FROM supplier_payments
  WHERE purchase_id = p_purchase_id;

  v_remaining := v_po.total_amount - v_already_paid;
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Nominal pembayaran (%) melebihi sisa hutang (%)', p_amount, v_remaining;
  END IF;

  v_supplier_id := v_po.supplier_id;
  IF v_supplier_id IS NOT NULL THEN
    SELECT name INTO v_supplier_name FROM suppliers WHERE id = v_supplier_id;
  ELSE
    -- If supplier_id was null on purchase, find or use first active supplier
    SELECT id INTO v_supplier_id FROM suppliers WHERE is_active = TRUE LIMIT 1;
  END IF;

  -- Resolve payment source account
  v_pay_acc_id := p_financial_account_id;
  IF v_pay_acc_id IS NULL AND p_payment_method_id IS NOT NULL THEN
    SELECT financial_account_id INTO v_pay_acc_id FROM payment_methods WHERE id = p_payment_method_id;
  END IF;

  -- Default to Cash on Hand (1000) or Bank (1100)
  IF v_pay_acc_id IS NULL THEN
    SELECT id INTO v_pay_acc_id FROM financial_accounts WHERE account_code = '1000' LIMIT 1;
  END IF;

  IF v_pay_acc_id IS NULL THEN
    SELECT id INTO v_pay_acc_id FROM financial_accounts WHERE account_type = 'ASSET' ORDER BY account_code ASC LIMIT 1;
  END IF;

  -- 1. Insert into supplier_payments
  INSERT INTO supplier_payments (
    id, supplier_id, purchase_id, payment_method_id, financial_account_id,
    amount, reference_number, paid_at, created_by
  ) VALUES (
    v_payment_id, v_supplier_id, p_purchase_id, p_payment_method_id, v_pay_acc_id,
    p_amount, TRIM(p_reference_number), CURRENT_TIMESTAMP, v_user_id
  );

  -- 2. Post Level 2 Double-Entry Journal (Debit: 2000 Accounts Payable, Credit: Cash/Bank Account)
  SELECT id INTO v_ap_acc_id FROM financial_accounts WHERE account_code = '2000' LIMIT 1;

  IF v_ap_acc_id IS NOT NULL AND v_pay_acc_id IS NOT NULL THEN
    v_journal_id := gen_random_uuid();
    v_journal_number := 'JRN-PAY-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');

    INSERT INTO journal_entries (
      id, journal_number, journal_date, reference_type, reference_id,
      description, status, created_by
    ) VALUES (
      v_journal_id, v_journal_number, CURRENT_DATE, 'SUPPLIER_PAYMENT', p_purchase_id,
      'Pelunasan hutang PO #' || v_po.purchase_number || ' kepada ' || v_supplier_name || ' (Ref: ' || COALESCE(p_reference_number, 'TUNAI') || ')',
      'DRAFT', v_user_id
    );

    -- Line 1 (Debit): Accounts Payable reduced
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_ap_acc_id, v_po.outlet_id, p_amount, 0.00,
      'Pengurangan hutang usaha PO #' || v_po.purchase_number
    );

    -- Line 2 (Credit): Cash/Bank Asset reduced
    INSERT INTO journal_lines (
      journal_entry_id, financial_account_id, outlet_id, debit, credit, description
    ) VALUES (
      v_journal_id, v_pay_acc_id, v_po.outlet_id, 0.00, p_amount,
      'Pengeluaran kas/bank untuk pembayaran PO #' || v_po.purchase_number
    );

    -- Post central gate
    PERFORM _internal_post_journal_entry(v_journal_id, v_user_id);
  END IF;

  -- 3. Determine New Payment Status
  IF (v_already_paid + p_amount) >= v_po.total_amount THEN
    v_new_payment_status := 'PAID';
  ELSE
    v_new_payment_status := 'PARTIALLY_PAID';
  END IF;

  UPDATE purchases
  SET
    payment_status = v_new_payment_status,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_purchase_id;

  SELECT json_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'purchase_id', p_purchase_id,
    'amount_paid', p_amount,
    'total_paid', (v_already_paid + p_amount),
    'remaining_debt', GREATEST(0.00, v_po.total_amount - (v_already_paid + p_amount)),
    'payment_status', v_new_payment_status,
    'journal_number', v_journal_number,
    'message', 'Pembayaran hutang supplier berhasil dicatat dan jurnal akuntansi telah diposting.'
  )::JSONB INTO v_res;

  RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_supplier_payment(UUID, NUMERIC, UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_supplier_payment(UUID, NUMERIC, UUID, UUID, TEXT, TEXT, UUID) TO authenticated, anon;
