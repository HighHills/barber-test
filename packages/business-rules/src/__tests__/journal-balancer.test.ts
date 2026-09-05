import { describe, it, expect } from 'vitest';
import { validateJournalBalance } from '../journal-balancer.js';

describe('validateJournalBalance', () => {
  it('approves a balanced 2-line journal entry', () => {
    const result = validateJournalBalance([
      { financial_account_id: 'acc-cash', debit: 100000, credit: 0 },
      { financial_account_id: 'acc-rev', debit: 0, credit: 100000 },
    ]);

    expect(result.is_balanced).toBe(true);
    expect(result.total_debit).toBe(100000);
    expect(result.total_credit).toBe(100000);
    expect(result.difference).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  it('approves a multi-line compound journal with split credits (Revenue + Tax Payable)', () => {
    const result = validateJournalBalance([
      { financial_account_id: 'acc-cash', debit: 111000, credit: 0 },
      { financial_account_id: 'acc-service-rev', debit: 0, credit: 100000 },
      { financial_account_id: 'acc-tax-payable', debit: 0, credit: 11000 },
    ]);

    expect(result.is_balanced).toBe(true);
    expect(result.total_debit).toBe(111000);
    expect(result.total_credit).toBe(111000);
    expect(result.difference).toBe(0);
  });

  it('rejects an unbalanced journal entry', () => {
    const result = validateJournalBalance([
      { financial_account_id: 'acc-cash', debit: 100000, credit: 0 },
      { financial_account_id: 'acc-rev', debit: 0, credit: 90000 },
    ]);

    expect(result.is_balanced).toBe(false);
    expect(result.difference).toBe(10000);
    expect(result.errors.some((e) => e.includes('unbalanced'))).toBe(true);
  });

  it('rejects a line with both debit and credit > 0', () => {
    const result = validateJournalBalance([
      { financial_account_id: 'acc-cash', debit: 100000, credit: 50000 },
      { financial_account_id: 'acc-rev', debit: 0, credit: 50000 },
    ]);

    expect(result.is_balanced).toBe(false);
    expect(result.errors.some((e) => e.includes('both debit and credit'))).toBe(true);
  });
});
