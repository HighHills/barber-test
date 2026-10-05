import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  mapCommissionOperationError,
  parseCommissionPayoutResponse,
} from '../lib/commission-operation-errors';

describe('commission operation safety', () => {
  it('sanitizes raw PostgreSQL errors', () => {
    const message = mapCommissionOperationError(
      { code: '42P01', message: 'relation "private_commission_ledger" does not exist' },
      'load'
    );
    expect(message).toBe('Gagal memuat data komisi karena kendala sistem. Silakan muat ulang halaman.');
    expect(message).not.toMatch(/private_commission_ledger|42P01|does not exist/i);
  });

  it('maps authorization errors without exposing database detail', () => {
    expect(mapCommissionOperationError({ code: '42501', message: 'permission denied' }, 'payout')).toBe(
      'Akses ditolak. Anda tidak memiliki izin untuk mengelola komisi pada cabang ini.'
    );
  });

  it('accepts only a matching, complete payout response', () => {
    const expected = {
      employeeId: 'employee-1',
      outletId: 'outlet-1',
      paymentSource: 'BANK' as const,
    };
    expect(parseCommissionPayoutResponse({
      success: true,
      status: 'PAID',
      employee_id: expected.employeeId,
      outlet_id: expected.outletId,
      payment_source: expected.paymentSource,
      commission_count: 2,
      total_amount: '80000',
      journal_id: 'journal-1',
      journal_number: 'JV-001',
    }, expected)).toEqual({
      commissionCount: 2,
      totalAmount: 80000,
      journalId: 'journal-1',
      journalNumber: 'JV-001',
    });

    expect(() => parseCommissionPayoutResponse({ success: true }, expected)).toThrow('PAYOUT_RESPONSE_INVALID');
  });

  it('uses backend permission checks and protects both payout and rule controls', () => {
    const page = fs.readFileSync(path.resolve('src/app/commissions/page.tsx'), 'utf8');
    const ledger = fs.readFileSync(path.resolve('src/components/commissions/commission-ledger-table.tsx'), 'utf8');
    const rules = fs.readFileSync(path.resolve('src/components/commissions/commission-rules-manager.tsx'), 'utf8');
    const payout = fs.readFileSync(path.resolve('src/components/commissions/commission-payout-modal.tsx'), 'utf8');
    expect(page).toContain("rpc('current_user_has_permission'");
    expect(page).toContain("p_perm_code: 'commission.manage'");
    expect(payout).toContain('parseCommissionPayoutResponse');
    expect(ledger).toContain('!canManageCommissions');
    expect(rules).toContain('canManageCommissions');
    expect(page).not.toMatch(/err instanceof Error \? err\.message/);
  });
});
