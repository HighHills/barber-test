import { describe, expect, it } from 'vitest';
import { mapPurchaseOperationError } from '../lib/purchase-operation-errors';

describe('purchase operation error mapping', () => {
  it('fails closed for raw PostgreSQL internals', () => {
    const message = mapPurchaseOperationError(
      { code: '42P01', message: 'relation "purchase_items_private" does not exist' },
      'payment'
    );
    expect(message).toBe('Gagal mencatat pembayaran supplier karena kendala sistem.');
    expect(message).not.toMatch(/purchase_items_private|42P01|does not exist/i);
  });

  it('preserves safe business mappings', () => {
    expect(
      mapPurchaseOperationError({ code: '42501', message: 'permission denied' }, 'supplier_save')
    ).toBe('Akses ditolak. Pastikan akun Anda memiliki hak pengadaan/inventori yang sesuai.');
    expect(
      mapPurchaseOperationError({ message: 'Nominal pembayaran melebihi sisa hutang' }, 'payment')
    ).toBe('Nominal pembayaran melebihi sisa hutang supplier.');
  });

  it('keeps purchase UI on strict response validation and safe boundaries', async () => {
    const page = await import('node:fs/promises').then((fs) => fs.readFile('src/app/purchases/page.tsx', 'utf8'));
    const poModal = await import('node:fs/promises').then((fs) => fs.readFile('src/components/purchases/purchase-order-modal.tsx', 'utf8'));
    const paymentModal = await import('node:fs/promises').then((fs) => fs.readFile('src/components/purchases/supplier-payment-modal.tsx', 'utf8'));
    expect(page).toContain('res?.success !== true');
    expect(page).toContain("res.purchase_id !== po.id");
    expect(poModal).toContain('res?.success !== true');
    expect(paymentModal).toContain('res.purchase_id !== purchase.id');
    expect(paymentModal).toContain('mapPurchaseOperationError');
  });
});
