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
