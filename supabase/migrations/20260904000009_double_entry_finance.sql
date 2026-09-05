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
