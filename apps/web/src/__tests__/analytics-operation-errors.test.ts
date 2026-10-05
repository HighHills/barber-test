import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mapAnalyticsOperationError } from '../lib/analytics-operation-errors';

describe('analytics safety and parity', () => {
  it('sanitizes database errors and maps access denial', () => {
    const internal = mapAnalyticsOperationError(
      { code: '42P01', message: 'relation "private_sales" does not exist' }
    );
    expect(internal).toBe('Gagal memuat analitik karena kendala sistem. Silakan muat ulang halaman.');
    expect(internal).not.toMatch(/private_sales|42P01|does not exist/i);
    expect(mapAnalyticsOperationError({ code: '42501', message: 'permission denied' })).toBe(
      'Akses ditolak. Anda tidak memiliki izin untuk melihat analitik ini.'
    );
  });

  it('keeps Web range and outlet scope aligned with the mobile contract', () => {
    const page = fs.readFileSync(path.resolve('src/app/analytics/page.tsx'), 'utf8');
    expect(page).toContain('now.getDate() - 6');
    expect(page).toContain('now.getDate() - 29');
    expect(page).toContain(".gte('started_at', dateRange.startIso)");
    expect(page).toContain(".lte('started_at', dateRange.endIso)");
    expect(page).toContain("salesQuery = salesQuery.in('outlet_id', accessibleOutletIds)");
    expect(page).toContain("queuesQuery = queuesQuery.in('outlet_id', accessibleOutletIds)");
    expect(page).toContain('setErrorMessage(mapAnalyticsOperationError(err))');
    expect(page).not.toContain(': 85;');
  });
});
