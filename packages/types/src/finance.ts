export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type NormalBalance = 'DEBIT' | 'CREDIT';

export interface FinancialAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  parent_id: string | null;
  normal_balance: NormalBalance;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PeriodStatus = 'OPEN' | 'CLOSED';

export interface FinancialPeriod {
  id: string;
  period_start: string;
  period_end: string;
  status: PeriodStatus;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
}

export type JournalStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export interface JournalEntry {
  id: string;
  journal_number: string;
  journal_date: string;
  reference_type: string | null;
  reference_id: string | null;
  description: string;
  status: JournalStatus;
  created_by: string;
  posted_by: string | null;
  posted_at: string | null;
  reversed_journal_id: string | null;
  created_at: string;
}

export interface JournalLine {
  id: string;
  journal_entry_id: string;
  financial_account_id: string;
  outlet_id: string | null;
  debit: number;
  credit: number;
  description: string | null;
}
