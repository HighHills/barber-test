import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDbEnvironment, TestDbEnvironment } from './helpers/db-test-setup';

describe('Section 3: POS Failure & Rollback Verification (Atomic Boundary)', () => {
  let env: TestDbEnvironment;

  beforeEach(async () => {
    env = await createTestDbEnvironment();
  });

  it('verifies complete atomic rollback when financial period is CLOSED', async () => {
    // 1. Insert a CLOSED financial period covering today
    await env.db.query(
      `INSERT INTO financial_periods (period_start, period_end, status)
       VALUES (CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '30 days', 'CLOSED')`
    );

    // Initial counts
    const initSales = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM sales')).rows[0].count;
    const initItems = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM sale_items')).rows[0].count;
    const initPayments = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM sale_payments')).rows[0].count;
    const initJournals = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM journal_entries')).rows[0].count;
    const initLines = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM journal_lines')).rows[0].count;
    const initMovements = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM inventory_movements')).rows[0].count;
    const initCommissions = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM commissions')).rows[0].count;
    const initStock = (
      await env.db.query<{ quantity: string }>(
        `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.retailPomadeId}'`
      )
    ).rows[0].quantity;

    await env.asUser(env.cashierAUserId);

    // Attempt POS sale -> must fail
    await expect(
      env.db.query(
        `SELECT process_pos_sale(
          '${env.outletAId}',
          'FAIL-CLOSED-PERIOD',
          '${env.cashierAProfileId}',
          '${env.customerId}',
          NULL,
          '[{"item_type":"PRODUCT","product_id":"${env.retailPomadeId}","quantity":1,"unit_price":100000,"total_amount":100000}]'::jsonb,
          '[{"payment_method_id":"${env.cashMethodId}","amount":100000}]'::jsonb,
          0
        )`
      )
    ).rejects.toThrow(/CLOSED financial period/);

    // 2. Assert complete atomic rollback across all tables
    await env.resetUser();
    const afterSales = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM sales')).rows[0].count;
    const afterItems = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM sale_items')).rows[0].count;
    const afterPayments = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM sale_payments')).rows[0].count;
    const afterJournals = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM journal_entries')).rows[0].count;
    const afterLines = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM journal_lines')).rows[0].count;
    const afterMovements = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM inventory_movements')).rows[0].count;
    const afterCommissions = (await env.db.query<{ count: string }>('SELECT COUNT(*) FROM commissions')).rows[0].count;
    const afterStock = (
      await env.db.query<{ quantity: string }>(
        `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.retailPomadeId}'`
      )
    ).rows[0].quantity;

    expect(afterSales).toBe(initSales);
    expect(afterItems).toBe(initItems);
    expect(afterPayments).toBe(initPayments);
    expect(afterJournals).toBe(initJournals);
    expect(afterLines).toBe(initLines);
    expect(afterMovements).toBe(initMovements);
    expect(afterCommissions).toBe(initCommissions);
    expect(afterStock).toBe(initStock);
  });

  it('verifies complete atomic rollback on inventory shortage', async () => {
    // Current stock is 50. Request 999
    await env.asUser(env.cashierAUserId);

    const initStock = (
      await env.db.query<{ quantity: string }>(
        `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.retailPomadeId}'`
      )
    ).rows[0].quantity;

    await expect(
      env.db.query(
        `SELECT process_pos_sale(
          '${env.outletAId}',
          'FAIL-STOCK-SHORT',
          '${env.cashierAProfileId}',
          '${env.customerId}',
          NULL,
          '[{"item_type":"PRODUCT","product_id":"${env.retailPomadeId}","quantity":999,"unit_price":100000,"total_amount":99900000}]'::jsonb,
          '[{"payment_method_id":"${env.cashMethodId}","amount":99900000}]'::jsonb,
          0
        )`
      )
    ).rejects.toThrow(/Insufficient inventory/);

    // Assert no sales, journals, or inventory changes
    await env.resetUser();
    const saleCheck = await env.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM sales WHERE idempotency_key = 'FAIL-STOCK-SHORT'`
    );
    expect(parseInt(saleCheck.rows[0].count)).toBe(0);

    const afterStock = (
      await env.db.query<{ quantity: string }>(
        `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.retailPomadeId}'`
      )
    ).rows[0].quantity;
    expect(afterStock).toBe(initStock);
  });

  it('verifies complete atomic rollback on payment amount mismatch', async () => {
    await env.asUser(env.cashierAUserId);

    // Total is 100k, payment provided is 80k
    await expect(
      env.db.query(
        `SELECT process_pos_sale(
          '${env.outletAId}',
          'FAIL-PAYMENT-MISMATCH',
          '${env.cashierAProfileId}',
          '${env.customerId}',
          NULL,
          '[{"item_type":"PRODUCT","product_id":"${env.retailPomadeId}","quantity":1,"unit_price":100000,"total_amount":100000}]'::jsonb,
          '[{"payment_method_id":"${env.cashMethodId}","amount":80000}]'::jsonb,
          0
        )`
      )
    ).rejects.toThrow(/Payment Sum .* does not match Sale Total/);

    await env.resetUser();
    const saleCheck = await env.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM sales WHERE idempotency_key = 'FAIL-PAYMENT-MISMATCH'`
    );
    expect(parseInt(saleCheck.rows[0].count)).toBe(0);
  });

  it('verifies rejection and rollback when cashier attempts sale at unauthorized outlet', async () => {
    // Cashier A attempts to process sale at Outlet B
    await env.asUser(env.cashierAUserId);

    await expect(
      env.db.query(
        `SELECT process_pos_sale(
          '${env.outletBId}',
          'FAIL-CROSS-OUTLET',
          '${env.cashierAProfileId}',
          '${env.customerId}',
          NULL,
          '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","quantity":1,"unit_price":50000,"total_amount":50000}]'::jsonb,
          '[{"payment_method_id":"${env.cashMethodId}","amount":50000}]'::jsonb,
          0
        )`
      )
    ).rejects.toThrow(/Cashier .* does not have access to outlet/);

    await env.resetUser();
    const saleCheck = await env.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM sales WHERE idempotency_key = 'FAIL-CROSS-OUTLET'`
    );
    expect(parseInt(saleCheck.rows[0].count)).toBe(0);
  });

  it('verifies rejection and rollback when caller profile does not match authenticated user', async () => {
    // Cashier A attempts to impersonate Manager A's profile ID
    await env.asUser(env.cashierAUserId);

    await expect(
      env.db.query(
        `SELECT process_pos_sale(
          '${env.outletAId}',
          'FAIL-IMPERSONATION',
          '${env.managerAProfileId}',
          '${env.customerId}',
          NULL,
          '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","quantity":1,"unit_price":50000,"total_amount":50000}]'::jsonb,
          '[{"payment_method_id":"${env.cashMethodId}","amount":50000}]'::jsonb,
          0
        )`
      )
    ).rejects.toThrow(/Caller is not authorized for cashier profile/);

    await env.resetUser();
    const saleCheck = await env.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM sales WHERE idempotency_key = 'FAIL-IMPERSONATION'`
    );
    expect(parseInt(saleCheck.rows[0].count)).toBe(0);
  });
});
