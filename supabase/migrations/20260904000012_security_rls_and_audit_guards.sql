-- 20260904000012_security_rls_and_audit_guards.sql
-- Row Level Security (RLS) on all 48 tables, Security Helpers, and Database-Level Immutability Guards

-- 1. SCH-01 & SCH-02 Defensive Constraints (Idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_business_settings_tax_rate_non_neg'
  ) THEN
    ALTER TABLE business_settings ADD CONSTRAINT chk_business_settings_tax_rate_non_neg CHECK (tax_rate >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_employee_schedule'
  ) THEN
    ALTER TABLE employee_schedules ADD CONSTRAINT uq_employee_schedule UNIQUE (employee_id, outlet_id, day_of_week);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- 2. Database-Level Immutability Guards (AUD-01 & ACC-02)

-- A. Audit Logs Immutability Trigger
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable. UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- B. Inventory Movements Immutability Trigger
CREATE OR REPLACE FUNCTION prevent_inventory_movement_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Inventory movements are immutable. UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_inventory_movements_immutable ON inventory_movements;
CREATE TRIGGER trg_inventory_movements_immutable
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_movement_modification();

-- C. Posted Journal Entries Immutability Trigger
CREATE OR REPLACE FUNCTION prevent_posted_journal_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Allow transition from POSTED to REVERSED when linking reversed_journal_id
    IF OLD.status = 'POSTED' AND NEW.status = 'REVERSED' AND NEW.reversed_journal_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'POSTED' THEN
      RAISE EXCEPTION 'Posted journal entries are immutable. Create a reversing journal entry instead.';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'POSTED' THEN
      RAISE EXCEPTION 'Posted journal entries cannot be deleted.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_journal_entries_immutable ON journal_entries;
CREATE TRIGGER trg_journal_entries_immutable
BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION prevent_posted_journal_modification();

-- D. Posted Journal Lines Immutability Trigger
CREATE OR REPLACE FUNCTION prevent_posted_journal_line_modification()
RETURNS TRIGGER AS $$
DECLARE
  v_status journal_status_enum;
BEGIN
  SELECT status INTO v_status FROM journal_entries WHERE id = OLD.journal_entry_id;
  IF v_status = 'POSTED' THEN
    RAISE EXCEPTION 'Lines belonging to a POSTED journal entry cannot be updated or deleted.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_journal_lines_immutable ON journal_lines;
CREATE TRIGGER trg_journal_lines_immutable
BEFORE UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION prevent_posted_journal_line_modification();


-- 3. Security Helper Functions (SEC-01 & SEC-03)
-- Note: auth.uid() is natively provided by Supabase Auth; test environments mock this in test harness.
CREATE OR REPLACE FUNCTION get_current_profile_id()
RETURNS UUID AS $$
  SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION is_owner_or_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN profiles p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.code IN ('OWNER', 'ADMIN')
      AND r.is_active = TRUE
      AND p.is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- 1.1 Connect payment_methods.financial_account_id FK if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_methods' AND column_name = 'financial_account_id'
  ) THEN
    ALTER TABLE payment_methods ADD COLUMN financial_account_id UUID REFERENCES financial_accounts(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION current_user_has_outlet_access(p_outlet_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN profiles p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND p.is_active = TRUE
      AND r.is_active = TRUE
      AND (
        -- Only OWNER or ADMIN have global access when outlet_id IS NULL or matching
        (r.code IN ('OWNER', 'ADMIN') AND (ur.outlet_id IS NULL OR ur.outlet_id = p_outlet_id))
        -- Operational roles MUST have an explicit matching outlet_id
        OR (r.code NOT IN ('OWNER', 'ADMIN') AND ur.outlet_id IS NOT NULL AND ur.outlet_id = p_outlet_id)
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

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
        -- OWNER and ADMIN have permission globally
        r.code IN ('OWNER', 'ADMIN')
        -- Explicit matching outlet for operational roles
        OR (p_outlet_id IS NOT NULL AND ur.outlet_id IS NOT NULL AND ur.outlet_id = p_outlet_id)
        -- Global permissions only if role is OWNER or ADMIN
        OR (p_outlet_id IS NULL AND ur.outlet_id IS NULL AND r.code IN ('OWNER', 'ADMIN'))
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;


-- 4. Enable Row Level Security (RLS) on ALL 48 Tables (SEC-01)
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets FORCE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_outlets FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_leaves FORCE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;

ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;
ALTER TABLE service_outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_outlets FORCE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE product_outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_outlets FORCE ROW LEVEL SECURITY;
ALTER TABLE product_unit_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_unit_conversions FORCE ROW LEVEL SECURITY;
ALTER TABLE service_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_consumptions FORCE ROW LEVEL SECURITY;

ALTER TABLE outlet_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_inventory FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases FORCE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items FORCE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustment_items FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_items FORCE ROW LEVEL SECURITY;

ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_registers FORCE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods FORCE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales FORCE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items FORCE ROW LEVEL SECURITY;
ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE sale_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE sale_refund_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_refund_items FORCE ROW LEVEL SECURITY;

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE queues FORCE ROW LEVEL SECURITY;

ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions FORCE ROW LEVEL SECURITY;

ALTER TABLE financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines FORCE ROW LEVEL SECURITY;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;


-- 5. Non-Recursive RLS Policies (SEC-01)

-- Dictionaries & Reference Masters
CREATE POLICY "roles_select" ON roles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "roles_admin" ON roles FOR ALL USING (is_owner_or_admin());

CREATE POLICY "permissions_select" ON permissions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "permissions_admin" ON permissions FOR ALL USING (is_owner_or_admin());

CREATE POLICY "role_permissions_select" ON role_permissions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "role_permissions_admin" ON role_permissions FOR ALL USING (is_owner_or_admin());

CREATE POLICY "payment_methods_select" ON payment_methods FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "payment_methods_admin" ON payment_methods FOR ALL USING (is_owner_or_admin());

CREATE POLICY "service_categories_select" ON service_categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "service_categories_admin" ON service_categories FOR ALL USING (is_owner_or_admin());

CREATE POLICY "services_select" ON services FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "services_admin" ON services FOR ALL USING (is_owner_or_admin());

CREATE POLICY "product_categories_select" ON product_categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "product_categories_admin" ON product_categories FOR ALL USING (is_owner_or_admin());

CREATE POLICY "products_select" ON products FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "products_admin" ON products FOR ALL USING (is_owner_or_admin());

CREATE POLICY "product_unit_conversions_select" ON product_unit_conversions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "product_unit_conversions_admin" ON product_unit_conversions FOR ALL USING (is_owner_or_admin());

CREATE POLICY "service_consumptions_select" ON service_consumptions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "service_consumptions_admin" ON service_consumptions FOR ALL USING (is_owner_or_admin());

CREATE POLICY "suppliers_select" ON suppliers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "suppliers_admin" ON suppliers FOR ALL USING (is_owner_or_admin());

-- Business Settings & Core Global
CREATE POLICY "business_settings_select" ON business_settings FOR SELECT USING (true);
CREATE POLICY "business_settings_admin" ON business_settings FOR ALL USING (is_owner_or_admin());

CREATE POLICY "customers_select" ON customers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "customers_manage" ON customers FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "financial_accounts_select" ON financial_accounts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "financial_accounts_admin" ON financial_accounts FOR ALL USING (is_owner_or_admin());

CREATE POLICY "financial_periods_select" ON financial_periods FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "financial_periods_admin" ON financial_periods FOR ALL USING (is_owner_or_admin());

-- Profiles & User Roles
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "profiles_update_self" ON profiles FOR UPDATE USING (auth.uid() = auth_user_id OR is_owner_or_admin());
CREATE POLICY "profiles_admin" ON profiles FOR ALL USING (is_owner_or_admin());

CREATE POLICY "user_roles_select" ON user_roles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "user_roles_admin" ON user_roles FOR ALL USING (is_owner_or_admin());

CREATE POLICY "employees_select" ON employees FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "employees_admin" ON employees FOR ALL USING (is_owner_or_admin());

CREATE POLICY "employee_outlets_select" ON employee_outlets FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "employee_outlets_admin" ON employee_outlets FOR ALL USING (is_owner_or_admin());

CREATE POLICY "employee_schedules_select" ON employee_schedules FOR SELECT USING (current_user_has_outlet_access(outlet_id));
CREATE POLICY "employee_schedules_manage" ON employee_schedules FOR ALL USING (current_user_has_outlet_access(outlet_id));

CREATE POLICY "employee_leaves_select" ON employee_leaves FOR SELECT USING (current_user_has_outlet_access(outlet_id));
CREATE POLICY "employee_leaves_manage" ON employee_leaves FOR ALL USING (current_user_has_outlet_access(outlet_id));

-- Outlet-Scoped Tables
CREATE POLICY "outlets_select" ON outlets FOR SELECT USING (current_user_has_outlet_access(id));
CREATE POLICY "outlets_admin" ON outlets FOR ALL USING (is_owner_or_admin());

CREATE POLICY "service_outlets_access" ON service_outlets FOR ALL USING (current_user_has_outlet_access(outlet_id));
CREATE POLICY "product_outlets_access" ON product_outlets FOR ALL USING (current_user_has_outlet_access(outlet_id));

CREATE POLICY "outlet_inventory_access" ON outlet_inventory FOR ALL USING (current_user_has_outlet_access(outlet_id));

CREATE POLICY "inventory_movements_select" ON inventory_movements FOR SELECT USING (current_user_has_outlet_access(outlet_id));
CREATE POLICY "inventory_movements_insert" ON inventory_movements FOR INSERT WITH CHECK (current_user_has_outlet_access(outlet_id));

CREATE POLICY "purchases_access" ON purchases FOR ALL USING (current_user_has_outlet_access(outlet_id));

CREATE POLICY "purchase_items_access" ON purchase_items FOR ALL USING (
  EXISTS (SELECT 1 FROM purchases p WHERE p.id = purchase_id AND current_user_has_outlet_access(p.outlet_id))
);

CREATE POLICY "supplier_payments_select" ON supplier_payments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "supplier_payments_admin" ON supplier_payments FOR ALL USING (is_owner_or_admin());

CREATE POLICY "stock_adjustments_access" ON stock_adjustments FOR ALL USING (current_user_has_outlet_access(outlet_id));

CREATE POLICY "stock_adjustment_items_access" ON stock_adjustment_items FOR ALL USING (
  EXISTS (SELECT 1 FROM stock_adjustments sa WHERE sa.id = adjustment_id AND current_user_has_outlet_access(sa.outlet_id))
);

CREATE POLICY "stock_transfers_access" ON stock_transfers FOR ALL USING (
  current_user_has_outlet_access(from_outlet_id) OR current_user_has_outlet_access(to_outlet_id)
);

CREATE POLICY "stock_transfer_items_access" ON stock_transfer_items FOR ALL USING (
  EXISTS (
    SELECT 1 FROM stock_transfers st
    WHERE st.id = transfer_id
      AND (current_user_has_outlet_access(st.from_outlet_id) OR current_user_has_outlet_access(st.to_outlet_id))
  )
);

CREATE POLICY "cash_registers_access" ON cash_registers FOR ALL USING (current_user_has_outlet_access(outlet_id));

CREATE POLICY "cash_sessions_access" ON cash_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM cash_registers cr WHERE cr.id = cash_register_id AND current_user_has_outlet_access(cr.outlet_id))
);

CREATE POLICY "sales_access" ON sales FOR ALL USING (current_user_has_outlet_access(outlet_id));

CREATE POLICY "sale_items_access" ON sale_items FOR ALL USING (
  EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_id AND current_user_has_outlet_access(s.outlet_id))
);

CREATE POLICY "sale_payments_access" ON sale_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_id AND current_user_has_outlet_access(s.outlet_id))
);

CREATE POLICY "sale_refunds_access" ON sale_refunds FOR ALL USING (current_user_has_outlet_access(outlet_id));

CREATE POLICY "sale_refund_items_access" ON sale_refund_items FOR ALL USING (
  EXISTS (SELECT 1 FROM sale_refunds sr WHERE sr.id = refund_id AND current_user_has_outlet_access(sr.outlet_id))
);

CREATE POLICY "appointments_access" ON appointments FOR ALL USING (
  current_user_has_outlet_access(outlet_id) OR auth.uid() IS NULL
);

CREATE POLICY "queues_access" ON queues FOR ALL USING (current_user_has_outlet_access(outlet_id));

CREATE POLICY "commission_rules_select" ON commission_rules FOR SELECT USING (
  outlet_id IS NULL OR current_user_has_outlet_access(outlet_id)
);
CREATE POLICY "commission_rules_admin" ON commission_rules FOR ALL USING (is_owner_or_admin());

CREATE POLICY "commissions_select" ON commissions FOR SELECT USING (
  current_user_has_outlet_access(outlet_id)
  OR employee_id IN (SELECT employee_id FROM profiles WHERE auth_user_id = auth.uid())
);
CREATE POLICY "commissions_admin" ON commissions FOR ALL USING (is_owner_or_admin());

CREATE POLICY "journal_entries_select" ON journal_entries FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "journal_entries_manage" ON journal_entries FOR ALL USING (is_owner_or_admin());

CREATE POLICY "journal_lines_select" ON journal_lines FOR SELECT USING (
  outlet_id IS NULL OR current_user_has_outlet_access(outlet_id)
);
CREATE POLICY "journal_lines_manage" ON journal_lines FOR ALL USING (is_owner_or_admin());

CREATE POLICY "notifications_self" ON notifications FOR ALL USING (
  user_id = get_current_profile_id()
);

CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT USING (is_owner_or_admin());
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
