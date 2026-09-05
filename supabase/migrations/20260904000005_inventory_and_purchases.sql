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
