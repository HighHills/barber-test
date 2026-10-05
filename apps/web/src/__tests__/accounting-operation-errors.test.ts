import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mapAccountingOperationError } from '../lib/accounting-operation-errors';

describe('accounting operation safety', () => {
  it('sanitizes raw database failures', () => {
    const result = mapAccountingOperationError(
      { code: '42P01', message: 'relation "journal_entries" does not exist' },
      'load'
    );
    expect(result).toBe('Gagal memuat data akuntansi karena kendala sistem. Silakan muat ulang halaman.');
    expect(result).not.toMatch(/journal_entries|42P01|does not exist/i);
  });

  it('maps permission and domain failures to safe operational messages', () => {
    expect(mapAccountingOperationError({ code: '42501', message: 'permission denied' }, 'close-period')).toBe(
      'Akses ditolak. Anda tidak memiliki izin untuk menjalankan operasi keuangan ini.'
    );
    expect(mapAccountingOperationError({ message: 'periode sudah ditutup' }, 'close-period')).toBe(
      'Periode buku sudah ditutup dan tidak dapat diubah.'
    );
  });

  it('keeps accounting UI fail-closed while journal mutations remain RPC-only', () => {
    const page = fs.readFileSync(path.resolve('src/app/accounting/page.tsx'), 'utf8');
    const service = fs.readFileSync(path.resolve('src/services/accounting-service.ts'), 'utf8');
    expect(page).toContain('mapAccountingOperationError');
    expect(page).not.toMatch(/err instanceof Error \? err\.message/);
    expect(service).toContain("rpc('open_cash_session'");
    expect(service).toContain("rpc('close_cash_session'");
    expect(service).toContain("rpc('close_financial_period'");
    expect(service).not.toMatch(/\.from\('cash_sessions'\)\s*\.insert/);
    expect(service).not.toMatch(/\.from\('financial_periods'\)\s*\.update/);
  });
});
