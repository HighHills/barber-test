import { roundMoney } from './rounding.js';

export interface JournalLineCheck {
  financial_account_id: string;
  debit: number;
  credit: number;
  description?: string | null;
}

export interface BalanceCheckResult {
  is_balanced: boolean;
  total_debit: number;
  total_credit: number;
  difference: number;
  errors: string[];
}

/**
 * Validates that journal lines strictly conform to double-entry accounting rules:
 * 1. At least two lines
 * 2. Each line must have debit >= 0 and credit >= 0
 * 3. Each line must be either debit or credit (never both > 0, never both 0)
 * 4. Sum of Debits must exactly equal Sum of Credits
 */
export function validateJournalBalance(lines: JournalLineCheck[]): BalanceCheckResult {
  const errors: string[] = [];

  if (!lines || lines.length < 2) {
    errors.push('A journal entry must contain at least 2 lines');
  }

  let totalDebit = 0;
  let totalCredit = 0;

  lines.forEach((line, idx) => {
    const debit = roundMoney(line.debit || 0);
    const credit = roundMoney(line.credit || 0);

    if (debit < 0 || credit < 0) {
      errors.push(`Line ${idx + 1}: Negative amounts are not allowed`);
    }

    if (debit === 0 && credit === 0) {
      errors.push(`Line ${idx + 1}: Line must have either debit or credit greater than zero`);
    }

    if (debit > 0 && credit > 0) {
      errors.push(`Line ${idx + 1}: Line cannot have both debit and credit greater than zero`);
    }

    totalDebit = roundMoney(totalDebit + debit);
    totalCredit = roundMoney(totalCredit + credit);
  });

  const difference = roundMoney(Math.abs(totalDebit - totalCredit));
  const is_balanced = errors.length === 0 && difference < 0.0001;

  if (difference >= 0.0001) {
    errors.push(`Journal is unbalanced: Total Debit (${totalDebit}) does not equal Total Credit (${totalCredit})`);
  }

  return {
    is_balanced,
    total_debit: totalDebit,
    total_credit: totalCredit,
    difference,
    errors,
  };
}
