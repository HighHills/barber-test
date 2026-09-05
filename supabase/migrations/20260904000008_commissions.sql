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
