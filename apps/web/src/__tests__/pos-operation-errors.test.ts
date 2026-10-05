import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mapPosHistoryError, mapPosOperationError, parsePosSaleResponse } from '../lib/pos-operation-errors';

describe('POS checkout safety', () => {
  it('sanitizes internal database errors', () => {
    const message = mapPosOperationError({ code: '42P01', message: 'relation "sales" does not exist' });
    expect(message).toBe('Transaksi tidak dapat diproses karena kendala sistem. Tidak ada nota yang dibuat.');
    expect(message).not.toMatch(/42P01|relation|sales/i);
  });

  it('requires a complete authoritative checkout response', () => {
    expect(() => parsePosSaleResponse({ success: true, sale_id: 'sale-1' })).toThrow('POS_RESPONSE_INVALID');
    expect(parsePosSaleResponse({
      success: true, sale_id: 'sale-1', invoice_number: 'INV-001', journal_id: 'journal-1',
      total_amount: 50000, is_duplicate: false, new_points_balance: null,
    })).toMatchObject({ saleId: 'sale-1', invoiceNumber: 'INV-001', totalAmount: 50000 });
  });

  it('sanitizes history-loading failures independently from checkout failures', () => {
    const message = mapPosHistoryError({ code: '42P01', message: 'relation "sales" does not exist' });
    expect(message).toBe('Gagal memuat riwayat nota karena kendala sistem. Silakan muat ulang.');
    expect(message).not.toMatch(/42P01|relation|sales/i);
  });

  it('never fabricates receipt identities and keeps a retry idempotency key', () => {
    const checkout = fs.readFileSync(path.resolve('src/components/pos/checkout-modal.tsx'), 'utf8');
    expect(checkout).toContain('idempotencyKeyRef');
    expect(checkout).toContain('parsePosSaleResponse(data)');
    expect(checkout).not.toContain('resultData?.sale_id || idempotencyKey');
    expect(checkout).not.toContain('`INV-${Date.now()}`');
    expect(checkout).toContain('mapPosOperationError(err)');
    const history = fs.readFileSync(path.resolve('src/app/history/page.tsx'), 'utf8');
    expect(history).toContain('mapPosHistoryError(err)');
  });
});
