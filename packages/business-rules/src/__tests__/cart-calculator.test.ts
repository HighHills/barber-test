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

  // ==========================================================================
  // POS MEMBERSHIP DISCOUNT REGRESSION & INTEGRATION TESTS
  // ==========================================================================
  describe('Membership Tier Discount Integration', () => {
    it('1. Guest service: Rp55.000 -> Rp55.000 (no discount applied)', () => {
      const result = calculateCart({
        items: [
          {
            item_type: 'SERVICE',
            service_id: 'srv-1',
            description_snapshot: 'Gentlemen Classic Haircut',
            quantity: 1,
            unit_price: 55000,
          },
        ],
        customer_tier: null,
        tax_enabled: false,
        tax_rate: 0,
        tax_inclusive: false,
      });

      expect(result.subtotal).toBe(55000);
      expect(result.total_membership_discount).toBe(0);
      expect(result.total_discount).toBe(0);
      expect(result.total_amount).toBe(55000);
    });

    it('2. Silver service 5%: Rp55.000 -> membership discount Rp2.750 -> total Rp52.250', () => {
      const result = calculateCart({
        items: [
          {
            item_type: 'SERVICE',
            service_id: 'srv-1',
            description_snapshot: 'Gentlemen Classic Haircut',
            quantity: 1,
            unit_price: 55000,
          },
        ],
        customer_tier: {
          discount_percent_service: 5,
          discount_percent_product: 0,
        },
        tax_enabled: false,
        tax_rate: 0,
        tax_inclusive: false,
      });

      expect(result.subtotal).toBe(55000);
      expect(result.total_item_discount).toBe(0);
      expect(result.total_membership_discount).toBe(2750);
      expect(result.total_discount).toBe(2750);
      expect(result.total_amount).toBe(52250);
      expect(result.items[0].membership_discount_amount).toBe(2750);
      expect(result.items[0].net_amount).toBe(52250);
    });

    it('3. Silver product 0%: Rp60.000 -> membership discount Rp0 -> total Rp60.000', () => {
      const result = calculateCart({
        items: [
          {
            item_type: 'PRODUCT',
            product_id: 'prd-1',
            description_snapshot: 'Hair Clay Pomade',
            quantity: 1,
            unit_price: 60000,
          },
        ],
        customer_tier: {
          discount_percent_service: 5,
          discount_percent_product: 0,
        },
        tax_enabled: false,
        tax_rate: 0,
        tax_inclusive: false,
      });

      expect(result.subtotal).toBe(60000);
      expect(result.total_membership_discount).toBe(0);
      expect(result.total_amount).toBe(60000);
      expect(result.items[0].membership_discount_amount).toBe(0);
    });

    it('4. Mixed Cart: SERVICE Rp55.000 (5%) + PRODUCT Rp60.000 (0%) -> discount Rp2.750 -> total Rp112.250', () => {
      const result = calculateCart({
        items: [
          {
            item_type: 'SERVICE',
            service_id: 'srv-1',
            description_snapshot: 'Gentlemen Classic Haircut',
            quantity: 1,
            unit_price: 55000,
          },
          {
            item_type: 'PRODUCT',
            product_id: 'prd-1',
            description_snapshot: 'Hair Clay Pomade',
            quantity: 1,
            unit_price: 60000,
          },
        ],
        customer_tier: {
          discount_percent_service: 5,
          discount_percent_product: 0,
        },
        tax_enabled: false,
        tax_rate: 0,
        tax_inclusive: false,
      });

      expect(result.subtotal).toBe(115000);
      expect(result.total_membership_discount).toBe(2750);
      expect(result.total_discount).toBe(2750);
      expect(result.total_amount).toBe(112250);

      const srvItem = result.items.find((i) => i.item_type === 'SERVICE');
      const prdItem = result.items.find((i) => i.item_type === 'PRODUCT');

      expect(srvItem?.membership_discount_amount).toBe(2750);
      expect(srvItem?.net_amount).toBe(52250);
      expect(prdItem?.membership_discount_amount).toBe(0);
      expect(prdItem?.net_amount).toBe(60000);
    });

    it('5. Item discount + Membership discount: Rp55.000 - Rp5.000 promo = Rp50.000 -> 5% member = Rp2.500 -> total Rp47.500', () => {
      const result = calculateCart({
        items: [
          {
            item_type: 'SERVICE',
            service_id: 'srv-1',
            description_snapshot: 'Gentlemen Classic Haircut',
            quantity: 1,
            unit_price: 55000,
            item_discount_amount: 5000,
          },
        ],
        customer_tier: {
          discount_percent_service: 5,
          discount_percent_product: 0,
        },
        tax_enabled: false,
        tax_rate: 0,
        tax_inclusive: false,
      });

      expect(result.subtotal).toBe(55000);
      expect(result.total_item_discount).toBe(5000);
      expect(result.total_membership_discount).toBe(2500);
      expect(result.total_discount).toBe(7500);
      expect(result.total_amount).toBe(47500);
      expect(result.items[0].net_amount).toBe(47500);
    });

    it('6. Membership discount + Global sale discount: Rp55.000 - 5% (Rp2.750) = Rp52.250 - Rp2.250 global = Rp50.000', () => {
      const result = calculateCart({
        items: [
          {
            item_type: 'SERVICE',
            service_id: 'srv-1',
            description_snapshot: 'Gentlemen Classic Haircut',
            quantity: 1,
            unit_price: 55000,
          },
        ],
        customer_tier: {
          discount_percent_service: 5,
          discount_percent_product: 0,
        },
        sale_discount: 2250,
        tax_enabled: false,
        tax_rate: 0,
        tax_inclusive: false,
      });

      expect(result.subtotal).toBe(55000);
      expect(result.total_membership_discount).toBe(2750);
      expect(result.sale_discount).toBe(2250);
      expect(result.total_discount).toBe(5000);
      expect(result.total_amount).toBe(50000);
      expect(result.items[0].allocated_discount_amount).toBe(2250);
      expect(result.items[0].net_amount).toBe(50000);
    });

    it('7. Membership discount + Loyalty redemption simulation: Rp55.000 - 5% (Rp2.750) = Rp52.250; 2 pts (Rp200) -> Rp52.050', () => {
      const result = calculateCart({
        items: [
          {
            item_type: 'SERVICE',
            service_id: 'srv-1',
            description_snapshot: 'Gentlemen Classic Haircut',
            quantity: 1,
            unit_price: 55000,
          },
        ],
        customer_tier: {
          discount_percent_service: 5,
          discount_percent_product: 0,
        },
        tax_enabled: false,
        tax_rate: 0,
        tax_inclusive: false,
      });

      expect(result.total_amount).toBe(52250);

      // In checkout modal, loyalty points redeem at 1 pt = Rp100
      const loyaltyPoints = 2;
      const loyaltyDiscount = loyaltyPoints * 100;
      const finalPayable = Math.max(0, result.total_amount - loyaltyDiscount);

      expect(loyaltyDiscount).toBe(200);
      expect(finalPayable).toBe(52050);
    });

    it('8. Rounding cases: Service Rp33.333 with 5% discount -> roundMoney(1.666,65) = Rp1666.65 -> total Rp31666.35', () => {
      const result = calculateCart({
        items: [
          {
            item_type: 'SERVICE',
            service_id: 'srv-1',
            description_snapshot: 'Special Trim',
            quantity: 1,
            unit_price: 33333,
          },
        ],
        customer_tier: {
          discount_percent_service: 5,
          discount_percent_product: 0,
        },
        tax_enabled: false,
        tax_rate: 0,
        tax_inclusive: false,
      });

      expect(result.total_membership_discount).toBe(1666.65);
      expect(result.total_amount).toBe(31666.35);
    });

    it('9. Customer without tier: discount_percent undefined/0 -> discount 0', () => {
      const result = calculateCart({
        items: [
          {
            item_type: 'SERVICE',
            service_id: 'srv-1',
            description_snapshot: 'Haircut',
            quantity: 1,
            unit_price: 55000,
          },
        ],
        customer_tier: {
          discount_percent_service: 0,
          discount_percent_product: 0,
        },
        tax_enabled: false,
        tax_rate: 0,
        tax_inclusive: false,
      });

      expect(result.total_membership_discount).toBe(0);
      expect(result.total_amount).toBe(55000);
    });

    it('10. Null / undefined customer_tier parameter -> discount 0', () => {
      const result = calculateCart({
        items: [
          {
            item_type: 'SERVICE',
            service_id: 'srv-1',
            description_snapshot: 'Haircut',
            quantity: 1,
            unit_price: 55000,
          },
        ],
        customer_tier: undefined,
        tax_enabled: false,
        tax_rate: 0,
        tax_inclusive: false,
      });

      expect(result.total_membership_discount).toBe(0);
      expect(result.total_amount).toBe(55000);
    });

    it('11. Invalid membership data: negative rates, > 100%, NaN clamped gracefully', () => {
      const resultNegative = calculateCart({
        items: [
          {
            item_type: 'SERVICE',
            service_id: 'srv-1',
            description_snapshot: 'Haircut',
            quantity: 1,
            unit_price: 55000,
          },
        ],
        customer_tier: {
          discount_percent_service: -20,
          discount_percent_product: NaN,
        },
        tax_enabled: false,
        tax_rate: 0,
        tax_inclusive: false,
      });
      expect(resultNegative.total_membership_discount).toBe(0);
      expect(resultNegative.total_amount).toBe(55000);

      const resultOver100 = calculateCart({
        items: [
          {
            item_type: 'SERVICE',
            service_id: 'srv-1',
            description_snapshot: 'Haircut',
            quantity: 1,
            unit_price: 55000,
          },
        ],
        customer_tier: {
          discount_percent_service: 150, // clamped to 100%
        },
        tax_enabled: false,
        tax_rate: 0,
        tax_inclusive: false,
      });
      expect(resultOver100.total_membership_discount).toBe(55000);
      expect(resultOver100.total_amount).toBe(0);
    });

    it('12. Tier with both service and product discounts: Gold 10% service, 5% product', () => {
      const result = calculateCart({
        items: [
          {
            item_type: 'SERVICE',
            service_id: 'srv-1',
            description_snapshot: 'Haircut',
            quantity: 1,
            unit_price: 100000, // 10% = 10.000 -> net 90.000
          },
          {
            item_type: 'PRODUCT',
            product_id: 'prd-1',
            description_snapshot: 'Pomade',
            quantity: 1,
            unit_price: 100000, // 5% = 5.000 -> net 95.000
          },
        ],
        customer_tier: {
          discount_percent_service: 10,
          discount_percent_product: 5,
        },
        tax_enabled: false,
        tax_rate: 0,
        tax_inclusive: false,
      });

      expect(result.subtotal).toBe(200000);
      expect(result.total_membership_discount).toBe(15000);
      expect(result.total_amount).toBe(185000);

      const srv = result.items.find((i) => i.item_type === 'SERVICE');
      const prd = result.items.find((i) => i.item_type === 'PRODUCT');

      expect(srv?.membership_discount_amount).toBe(10000);
      expect(srv?.net_amount).toBe(90000);
      expect(prd?.membership_discount_amount).toBe(5000);
      expect(prd?.net_amount).toBe(95000);
    });
  });
});
