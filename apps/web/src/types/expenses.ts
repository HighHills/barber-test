// apps/web/src/types/expenses.ts
// Operational Expenses & Petty Cash TypeScript Definitions

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  financial_account_id: string;
  icon?: string | null;
  is_active: boolean;
}

export interface ExpenseItem {
  id: string;
  expense_number: string;
  outlet_id: string;
  outlet_name?: string;
  outlet_code?: string;
  category_id: string;
  category_name?: string;
  category_icon?: string;
  financial_account_id: string;
  financial_account_code?: string;
  financial_account_name?: string;
  payment_account_id: string;
  payment_account_code?: string;
  payment_account_name?: string;
  amount: number;
  expense_date: string;
  recipient?: string | null;
  notes?: string | null;
  reference_number?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  journal_number?: string | null;
}

export interface CreateExpensePayload {
  p_outlet_id: string;
  p_category_id: string;
  p_payment_account_id: string;
  p_amount: number;
  p_expense_date?: string;
  p_recipient?: string | null;
  p_notes?: string | null;
  p_reference_number?: string | null;
  p_created_by?: string | null;
}

export interface ExpenseSummaryMetrics {
  totalMonthlyExpense: number;
  cashOnHandExpense: number;
  bankExpense: number;
  transactionCount: number;
}
