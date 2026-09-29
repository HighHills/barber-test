import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mapExpenseOperationError } from '../lib/expense-operation-errors';

describe('expense operation error sanitization and authorization', () => {
  it('fails closed for raw PostgreSQL errors', () => {
    const message = mapExpenseOperationError(
      { code: '42P01', message: 'relation "expenses_private" does not exist' },
      'load'
    );
    expect(message).toBe('Gagal memuat data biaya operasional. Silakan muat ulang halaman.');
    expect(message).not.toMatch(/expenses_private|42P01|does not exist/i);
  });

  it('maps void authorization safely', () => {
    expect(mapExpenseOperationError({ code: '42501', message: 'permission denied' }, 'void')).toBe(
      'Akses ditolak. Hanya Owner/Admin yang dapat membatalkan biaya operasional.'
    );
  });

  it('hides the void action from non Owner/Admin users and validates RPC responses', () => {
    const page = fs.readFileSync(path.resolve('src/app/expenses/page.tsx'), 'utf8');
    const modal = fs.readFileSync(path.resolve('src/components/expenses/expense-modal.tsx'), 'utf8');
    expect(page).toContain('isOwner ?');
    expect(page).toContain('res.success !== true');
    expect(page).toContain('res.expense_id !== exp.id');
    expect(modal).toContain('res.success !== true');
    expect(modal).toContain('!res.expense_id');
    expect(modal).toContain('mapExpenseOperationError');
  });
});

