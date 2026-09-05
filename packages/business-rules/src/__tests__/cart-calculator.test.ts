import { describe, it, expect } from 'vitest';
import { calculateCart } from '../cart-calculator.js';

describe('calculateCart', () => {
  it('correctly calculates single service with no tax and no discount', () => {
    const result = calculateCart({
      items: [
        {
          item_type: 'SERVICE',
          service_id: 'srv-1',
          description_snapshot: 'Haircut',
          quantity: 1,
          unit_price: 50000,
        },
      ],
      tax_enabled: false,
      tax_rate: 0,
      tax_inclusive: false,
    });

    expect(result.subtotal).toBe(50000);
    expect(result.total_discount).toBe(0);
    expect(result.tax_amount).toBe(0);
    expect(result.total_amount).toBe(50000);
    expect(result.items[0].net_amount).toBe(50000);
  });

  it('correctly allocates global sale-level discount pro-rated across items', () => {
    // Service 100k, Product 50k, global discount 30k
    // Expected: Service gets 20k discount (net 80k), Product gets 10k discount (net 40k)
    const result = calculateCart({
      items: [
        {
          item_type: 'SERVICE',
          service_id: 'srv-1',
          description_snapshot: 'Haircut & Styling',
          quantity: 1,
          unit_price: 100000,
        },
        {
          item_type: 'PRODUCT',
          product_id: 'prd-1',
          description_snapshot: 'Pomade Premium',
          quantity: 1,
          unit_price: 50000,
        },
      ],
      sale_discount: 30000,
      tax_enabled: false,
      tax_rate: 0,
      tax_inclusive: false,
    });

    expect(result.subtotal).toBe(150000);
    expect(result.sale_discount).toBe(30000);
    expect(result.total_amount).toBe(120000);

    const srv = result.items.find((i) => i.item_type === 'SERVICE');
    const prd = result.items.find((i) => i.item_type === 'PRODUCT');

    expect(srv?.allocated_discount_amount).toBe(20000);
    expect(srv?.net_amount).toBe(80000);

    expect(prd?.allocated_discount_amount).toBe(10000);
    expect(prd?.net_amount).toBe(40000);
  });

  it('correctly computes tax-inclusive pricing without changing total customer charge', () => {
    // 111,000 total with 11% tax inclusive
    // Expected net revenue: 100,000, tax: 11,000, customer pays 111,000
    const result = calculateCart({
      items: [
        {
          item_type: 'SERVICE',
          service_id: 'srv-1',
          description_snapshot: 'Full Grooming',
          quantity: 1,
          unit_price: 111000,
        },
      ],
      tax_enabled: true,
      tax_rate: 11,
      tax_inclusive: true,
    });

    expect(result.subtotal).toBe(111000);
    expect(result.tax_amount).toBe(11000);
    expect(result.total_amount).toBe(111000);
  });

  it('correctly computes tax-exclusive pricing adding tax on top', () => {
    // 100,000 net with 11% tax exclusive
    // Expected tax: 11,000, total: 111,000
    const result = calculateCart({
      items: [
        {
          item_type: 'SERVICE',
          service_id: 'srv-1',
          description_snapshot: 'Full Grooming',
          quantity: 1,
          unit_price: 100000,
        },
      ],
      tax_enabled: true,
      tax_rate: 11,
      tax_inclusive: false,
    });

    expect(result.subtotal).toBe(100000);
    expect(result.tax_amount).toBe(11000);
    expect(result.total_amount).toBe(111000);
  });
});
