-- CONSOLIDATED PHASE 0.5 MIGRATION EXPORT (13 MIGRATIONS)
-- Generated: 2026-09-04T07:26:01.538Z


-- ============================================================================
-- FILE: 20260904000001_extensions_and_enums.sql
-- ============================================================================

-- 20260904000001_extensions_and_enums.sql
-- Extension and Core Enums for Barbershop Operating System

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Employee Leave
CREATE TYPE leave_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- Inventory Movements
CREATE TYPE movement_type_enum AS ENUM (
  'OPENING',
  'PURCHASE',
  'SALE',
  'SERVICE_CONSUMPTION',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'RETURN_IN',
  'RETURN_OUT'
);

-- Purchasing
CREATE TYPE purchase_status_enum AS ENUM ('DRAFT', 'RECEIVED', 'CANCELLED');
CREATE TYPE purchase_payment_status_enum AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- Adjustments & Transfers
CREATE TYPE stock_adjustment_status_enum AS ENUM ('DRAFT', 'APPROVED', 'APPLIED', 'CANCELLED');
CREATE TYPE stock_transfer_status_enum AS ENUM ('REQUESTED', 'APPROVED', 'COMPLETED', 'CANCELLED');

-- Cash Sessions & POS
CREATE TYPE cash_session_status_enum AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE sale_status_enum AS ENUM ('COMPLETED', 'REFUNDED', 'VOIDED');
CREATE TYPE sale_item_type_enum AS ENUM ('SERVICE', 'PRODUCT');
CREATE TYPE commission_type_enum AS ENUM ('PERCENTAGE', 'FIXED', 'TIERED');
CREATE TYPE commission_status_enum AS ENUM ('EARNED', 'PAYABLE', 'PAID', 'VOIDED');
CREATE TYPE refund_type_enum AS ENUM ('FULL', 'PARTIAL');
CREATE TYPE refund_status_enum AS ENUM ('COMPLETED', 'CANCELLED');

-- Bookings & Queues
CREATE TYPE appointment_status_enum AS ENUM (
  'PENDING',
  'CONFIRMED',
  'ARRIVED',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
);

CREATE TYPE queue_status_enum AS ENUM (
  'WAITING',
  'CALLED',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
);

-- Finance & Double-Entry Accounting
CREATE TYPE account_type_enum AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE normal_balance_enum AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE period_status_enum AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE journal_status_enum AS ENUM ('DRAFT', 'POSTED', 'REVERSED');


-- ============================================================================
-- FILE: 20260904000002_core_and_rbac.sql
-- ============================================================================

-- 20260904000002_core_and_rbac.sql
-- Core Business Settings, Multi-Outlet, RBAC, Profiles, and Audit Logs

-- 1. business_settings (Singleton)
CREATE TABLE business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  logo_url TEXT,
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(100),
  currency VARCHAR(10) NOT NULL DEFAULT 'IDR',
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Jakarta',
  tax_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  tax_rate NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (tax_rate >= 0),
  tax_inclusive BOOLEAN NOT NULL DEFAULT TRUE,
  receipt_header TEXT,
  receipt_footer TEXT,
  booking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  inventory_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  commission_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  finance_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ensure only one row can exist
CREATE UNIQUE INDEX business_settings_singleton_idx ON business_settings ((true));

-- 2. outlets
CREATE TABLE outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(100),
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Jakarta',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. roles
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. permissions
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  module VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. role_permissions
CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- 6. profiles (Linked to auth.users and optional employee reference)
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE,
  employee_id UUID, -- Foreign key to employees added in migration 03
  display_name VARCHAR(150) NOT NULL,
  phone VARCHAR(50),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. user_roles
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE, -- NULL means explicitly authorized business-wide scope
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT uq_user_role_outlet UNIQUE (user_id, role_id, outlet_id)
);

-- 8. audit_logs (Immutable Append-Only Log)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  before_state JSONB,
  after_state JSONB,
  reason TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================================
-- FILE: 20260904000003_employees_and_customers.sql
-- ============================================================================

-- 20260904000003_employees_and_customers.sql
-- Employees, Employee Schedules, Leaves, and Customers

-- 9. employees
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(100),
  position VARCHAR(100) NOT NULL,
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  termination_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Link profiles.employee_id to employees(id)
ALTER TABLE profiles
  ADD CONSTRAINT fk_profiles_employee
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

-- 10. employee_outlets
CREATE TABLE employee_outlets (
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (employee_id, outlet_id)
);

-- 11. employee_schedules
CREATE TABLE employee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sun..6=Sat
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_start TIME,
  break_end TIME,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT chk_schedule_times CHECK (end_time > start_time),
  CONSTRAINT uq_employee_schedule UNIQUE (employee_id, outlet_id, day_of_week)
);

-- 12. employee_leaves
CREATE TABLE employee_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  status leave_status_enum NOT NULL DEFAULT 'PENDING',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_leave_times CHECK (end_at > start_at)
);

-- 13. customers
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(100),
  gender VARCHAR(20),
  date_of_birth DATE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_phone ON customers(phone);


-- ============================================================================
-- FILE: 20260904000004_catalog_and_pricing.sql
-- ============================================================================

-- 20260904000004_catalog_and_pricing.sql
-- Service Catalog, Product Catalog, Outlet Pricing, Consumptions, and Unit Conversions

-- 14. service_categories
CREATE TABLE service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 15. services (Global Definition)
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  default_cost_price NUMERIC(18,2), -- Reference fallback only
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 16. service_outlets (Outlet-Specific Service Pricing and Availability)
CREATE TABLE service_outlets (
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  selling_price NUMERIC(18,2) NOT NULL CHECK (selling_price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (service_id, outlet_id)
);

-- 17. product_categories
CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 18. products (Global Definition)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES product_categories(id) ON DELETE RESTRICT,
  sku VARCHAR(50) NOT NULL UNIQUE,
  barcode VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  base_unit VARCHAR(20) NOT NULL, -- e.g. "pcs", "ml", "gram", "bottle"
  default_cost_price NUMERIC(18,2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 19. product_outlets (Outlet-Specific Product Pricing and Availability)
CREATE TABLE product_outlets (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  selling_price NUMERIC(18,2) NOT NULL CHECK (selling_price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (product_id, outlet_id)
);

-- 20. product_unit_conversions (Packaging Conversion e.g. 1 box = 12 pcs)
CREATE TABLE product_unit_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_name VARCHAR(50) NOT NULL,
  multiplier_to_base NUMERIC(18,4) NOT NULL CHECK (multiplier_to_base > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_product_unit UNIQUE (product_id, unit_name)
);

-- 21. service_consumptions (Materials consumed when a service is charged)
CREATE TABLE service_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0), -- Measured in product.base_unit
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_service_product_consumption UNIQUE (service_id, product_id)
);


-- ============================================================================
-- FILE: 20260904000005_inventory_and_purchases.sql
-- ============================================================================

-- 20260904000005_inventory_and_purchases.sql
-- Inventory Ledger, Current Stock, Suppliers, Purchases, Adjustments, and Transfers

-- 22. outlet_inventory (Current Stock Balance & Moving Average Cost)
CREATE TABLE outlet_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 0.0000 CHECK (quantity >= 0),
  average_cost NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (average_cost >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_outlet_product_inventory UNIQUE (outlet_id, product_id)
);

-- 23. inventory_movements (Immutable Append-Only Inventory Ledger)
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type movement_type_enum NOT NULL,
  quantity NUMERIC(18,4) NOT NULL, -- positive for IN, negative for OUT
  unit_cost NUMERIC(18,2) NOT NULL DEFAULT 0.00,
  quantity_before NUMERIC(18,4) NOT NULL,
  quantity_after NUMERIC(18,4) NOT NULL,
  reference_type VARCHAR(50) NOT NULL, -- "PURCHASE", "SALE", "SERVICE_CONSUMPTION", "ADJUSTMENT", "TRANSFER"
  reference_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inv_mov_outlet_prod ON inventory_movements(outlet_id, product_id, occurred_at);
CREATE INDEX idx_inv_mov_reference ON inventory_movements(reference_type, reference_id);

-- 24. suppliers
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(100),
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 25. purchases
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_number VARCHAR(50) NOT NULL UNIQUE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  status purchase_status_enum NOT NULL DEFAULT 'DRAFT',
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
  discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  payment_status purchase_payment_status_enum NOT NULL DEFAULT 'UNPAID',
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 26. purchase_items
CREATE TABLE purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18,2) NOT NULL CHECK (unit_cost >= 0),
  discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  total_amount NUMERIC(18,2) NOT NULL CHECK (total_amount >= 0)
);

-- 27. supplier_payments (Supports AP partial/full supplier settlements)
CREATE TABLE supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  payment_method_id UUID, -- References payment_methods(id) added in migration 06
  financial_account_id UUID, -- References financial_accounts(id) added in migration 09
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  reference_number VARCHAR(100),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 28. stock_adjustments
CREATE TABLE stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_number VARCHAR(50) NOT NULL UNIQUE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  status stock_adjustment_status_enum NOT NULL DEFAULT 'DRAFT',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 29. stock_adjustment_items
CREATE TABLE stock_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_before NUMERIC(18,4) NOT NULL,
  quantity_after NUMERIC(18,4) NOT NULL CHECK (quantity_after >= 0),
  quantity_delta NUMERIC(18,4) NOT NULL,
  unit_cost NUMERIC(18,2) NOT NULL DEFAULT 0.00,
  reason TEXT
);

-- 30. stock_transfers (Inter-Outlet Stock Movement)
CREATE TABLE stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number VARCHAR(50) NOT NULL UNIQUE,
  from_outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  to_outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  status stock_transfer_status_enum NOT NULL DEFAULT 'REQUESTED',
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_different_outlets CHECK (from_outlet_id != to_outlet_id)
);

-- 31. stock_transfer_items
CREATE TABLE stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18,2) NOT NULL DEFAULT 0.00
);


-- ============================================================================
-- FILE: 20260904000006_pos_sales_and_refunds.sql
-- ============================================================================

-- 20260904000006_pos_sales_and_refunds.sql
-- Cash Registers, Sessions, Sales, Items, Payments, and Refunds

-- 32. cash_registers
CREATE TABLE cash_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 33. cash_sessions (Operational Cash Control Shift)
CREATE TABLE cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_register_id UUID NOT NULL REFERENCES cash_registers(id) ON DELETE RESTRICT,
  opened_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (opening_balance >= 0),
  closed_by UUID REFERENCES profiles(id) ON DELETE RESTRICT,
  closed_at TIMESTAMPTZ,
  closing_balance NUMERIC(18,2),
  status cash_session_status_enum NOT NULL DEFAULT 'OPEN'
);

-- 34. payment_methods
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL, -- e.g. "CASH", "QRIS", "BANK_TRANSFER", "EDC"
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Connect supplier_payments.payment_method_id FK
ALTER TABLE supplier_payments
  ADD CONSTRAINT fk_supplier_payments_method
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL;

-- 35. sales (Enforces Idempotency Key)
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
  discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  status sale_status_enum NOT NULL DEFAULT 'COMPLETED',
  idempotency_key VARCHAR(100) NOT NULL,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_sales_outlet_idempotency UNIQUE (outlet_id, idempotency_key)
);

CREATE INDEX idx_sales_outlet_sold_at ON sales(outlet_id, sold_at);
CREATE INDEX idx_sales_customer ON sales(customer_id);

-- 36. sale_items (Historical Snapshot)
CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  item_type sale_item_type_enum NOT NULL,
  service_id UUID REFERENCES services(id) ON DELETE RESTRICT,
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
  barber_id UUID REFERENCES employees(id) ON DELETE RESTRICT,
  description_snapshot VARCHAR(255) NOT NULL,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(18,2) NOT NULL CHECK (unit_price >= 0),
  item_discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (item_discount_amount >= 0),
  allocated_discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (allocated_discount_amount >= 0),
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  total_amount NUMERIC(18,2) NOT NULL CHECK (total_amount >= 0),
  cost_price NUMERIC(18,2), -- Snapshot Moving Average Cost / Default Cost at sale time
  commission_type commission_type_enum,
  commission_rate NUMERIC(18,2),
  commission_amount NUMERIC(18,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_sale_item_type CHECK (
    (item_type = 'SERVICE' AND service_id IS NOT NULL AND product_id IS NULL)
    OR
    (item_type = 'PRODUCT' AND product_id IS NOT NULL AND service_id IS NULL)
  )
);

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_barber ON sale_items(barber_id);

-- 37. sale_payments (Supports Split Payment)
CREATE TABLE sale_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  reference_number VARCHAR(100),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sale_payments_sale ON sale_payments(sale_id);

-- 38. sale_refunds
CREATE TABLE sale_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_number VARCHAR(50) NOT NULL UNIQUE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  refund_type refund_type_enum NOT NULL,
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
  discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  total_amount NUMERIC(18,2) NOT NULL CHECK (total_amount > 0),
  reason TEXT NOT NULL,
  status refund_status_enum NOT NULL DEFAULT 'COMPLETED',
  refunded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 39. sale_refund_items
CREATE TABLE sale_refund_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID NOT NULL REFERENCES sale_refunds(id) ON DELETE CASCADE,
  sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  refund_amount NUMERIC(18,2) NOT NULL CHECK (refund_amount > 0),
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  cost_price NUMERIC(18,2),
  return_to_inventory BOOLEAN NOT NULL DEFAULT TRUE,
  reason TEXT
);


-- ============================================================================
-- FILE: 20260904000007_bookings_and_queues.sql
-- ============================================================================

-- 20260904000007_bookings_and_queues.sql
-- Appointments with PostgreSQL Exclusion Constraint Collision Guard, and Real-time Queues

-- 40. appointments
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  barber_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status appointment_status_enum NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL, -- NULL = public guest booking
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_appointment_times CHECK (end_at > start_at),
  -- Database-level race-condition prevention: No two active appointments for the same barber can overlap
  CONSTRAINT exclude_overlapping_barber_appointment
  EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status NOT IN ('CANCELLED', 'NO_SHOW'))
);

CREATE INDEX idx_appointments_outlet_start ON appointments(outlet_id, start_at);
CREATE INDEX idx_appointments_barber_start ON appointments(barber_id, start_at);

-- 41. queues
CREATE TABLE queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_number INT NOT NULL,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  barber_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  status queue_status_enum NOT NULL DEFAULT 'WAITING',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  called_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_queues_outlet_status ON queues(outlet_id, status, joined_at);


-- ============================================================================
-- FILE: 20260904000008_commissions.sql
-- ============================================================================

-- 20260904000008_commissions.sql
-- 8-Tier Commission Rules Engine and Commission Ledger

-- 42. commission_rules
CREATE TABLE commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
  commission_type commission_type_enum NOT NULL DEFAULT 'PERCENTAGE',
  commission_rate NUMERIC(18,2) CHECK (commission_rate >= 0),
  fixed_amount NUMERIC(18,2) CHECK (fixed_amount >= 0),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  priority INT NOT NULL DEFAULT 8 CHECK (priority >= 1 AND priority <= 8),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_commission_effective_dates CHECK (
    effective_until IS NULL OR effective_until >= effective_from
  )
);

CREATE INDEX idx_commission_rules_lookup ON commission_rules (
  employee_id, service_id, product_id, outlet_id, effective_from
);

-- 43. commissions (Commission Liability Ledger)
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  commission_type commission_type_enum NOT NULL,
  commission_rate NUMERIC(18,2),
  commission_amount NUMERIC(18,2) NOT NULL CHECK (commission_amount >= 0),
  status commission_status_enum NOT NULL DEFAULT 'EARNED',
  earned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_commissions_employee_earned ON commissions(employee_id, earned_at);
CREATE INDEX idx_commissions_status ON commissions(status);


-- ============================================================================
-- FILE: 20260904000009_double_entry_finance.sql
-- ============================================================================

-- 20260904000009_double_entry_finance.sql
-- Level 2 Double-Entry Accounting Engine: Chart of Accounts, Periods, Journal Entries, and Lines

-- 44. financial_accounts (Chart of Accounts)
CREATE TABLE financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code VARCHAR(50) NOT NULL UNIQUE,
  account_name VARCHAR(150) NOT NULL,
  account_type account_type_enum NOT NULL,
  parent_id UUID REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  normal_balance normal_balance_enum NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Connect supplier_payments.financial_account_id FK
ALTER TABLE supplier_payments
  ADD CONSTRAINT fk_supplier_payments_account
  FOREIGN KEY (financial_account_id) REFERENCES financial_accounts(id) ON DELETE RESTRICT;

-- 45. financial_periods (Period Lock)
CREATE TABLE financial_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status period_status_enum NOT NULL DEFAULT 'OPEN',
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_period_dates CHECK (period_end >= period_start)
);

-- 46. journal_entries (Header)
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number VARCHAR(50) NOT NULL UNIQUE,
  journal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_type VARCHAR(50), -- "SALE", "PURCHASE", "REFUND", "SETTLEMENT", "MANUAL"
  reference_id UUID,
  description TEXT NOT NULL,
  status journal_status_enum NOT NULL DEFAULT 'DRAFT',
  created_by UUID REFERENCES profiles(id) ON DELETE RESTRICT,
  posted_by UUID REFERENCES profiles(id) ON DELETE RESTRICT,
  posted_at TIMESTAMPTZ,
  reversed_journal_id UUID REFERENCES journal_entries(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_journal_entries_date ON journal_entries(journal_date);
CREATE INDEX idx_journal_entries_ref ON journal_entries(reference_type, reference_id);

-- 47. journal_lines (Double-Entry Debit / Credit Lines)
CREATE TABLE journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  financial_account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  outlet_id UUID REFERENCES outlets(id) ON DELETE RESTRICT,
  debit NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (debit >= 0),
  credit NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (credit >= 0),
  description TEXT,
  -- Single line invariant: Line must have either debit OR credit > 0, never both, never neither
  CONSTRAINT chk_journal_line_xor CHECK (
    (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
  )
);

CREATE INDEX idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(financial_account_id);


-- ============================================================================
-- FILE: 20260904000010_notifications_and_indexes.sql
-- ============================================================================

-- 20260904000010_notifications_and_indexes.sql
-- Table 48: Notifications, and Comprehensive Domain Performance Indexes

-- 48. notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- Additional Crucial Composite Indexes for High Performance
CREATE INDEX idx_outlets_active ON outlets(is_active);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_services_code ON services(code);
CREATE INDEX idx_outlet_inventory_low_stock ON outlet_inventory(outlet_id, quantity);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);


-- ============================================================================
-- FILE: 20260904000011_atomic_functions_and_rpc.sql
-- ============================================================================

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


-- ============================================================================
-- FILE: 20260904000012_security_rls_and_audit_guards.sql
-- ============================================================================

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


-- ============================================================================
-- FILE: 20260904000013_security_transaction_hardening.sql
-- ============================================================================

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

