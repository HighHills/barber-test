import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mapInventoryOperationError } from '../lib/inventory-operation-errors';

describe('inventory operation error sanitization', () => {
  it('sanitizes schema errors without leaking database identifiers', () => {
    const message = mapInventoryOperationError(
      { code: '42703', message: 'column products.type does not exist' },
      'load'
    );
    expect(message).toBe('Gagal memuat data persediaan. Silakan muat ulang halaman.');
    expect(message).not.toMatch(/products\.type|does not exist|42703/i);
  });

  it('maps safe business errors', () => {
    expect(
      mapInventoryOperationError({ code: '42501', message: 'permission denied' }, 'load')
    ).toBe('Akses ditolak. Anda tidak memiliki izin untuk mengelola persediaan pada cabang ini.');
    expect(
      mapInventoryOperationError({ code: 'P0002', message: 'Produk tidak ditemukan' }, 'transfer_save')
    ).toBe('Data produk atau cabang tidak ditemukan atau sudah tidak aktif.');
  });

  it('fails closed for internal PostgreSQL errors', () => {
    const errors = [
      { code: '42P01', message: 'relation "inventory_private" does not exist' },
      { code: '23503', message: 'violates foreign key constraint "inventory_product_id_fkey"' },
      { code: '57014', message: 'canceling statement due to statement timeout' },
      { code: '42601', message: 'syntax error at or near "inventory_movements"' },
    ];
    for (const error of errors) {
      const message = mapInventoryOperationError(error, 'adjustment_save');
      expect(message).not.toMatch(/inventory_private|inventory_product_id_fkey|statement timeout|syntax error/i);
    }
  });

  it('routes all Web inventory catches through the mapper', () => {
    const files = [
      'src/app/inventory/page.tsx',
      'src/components/inventory/stock-adjustment-modal.tsx',
      'src/components/inventory/stock-transfer-modal.tsx',
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.resolve(file), 'utf8');
      expect(source).not.toMatch(/err instanceof Error\s*\?\s*err\.message/);
      expect(source).toContain('mapInventoryOperationError');
    }
  });
});

