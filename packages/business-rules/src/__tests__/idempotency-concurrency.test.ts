import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDbEnvironment, TestDbEnvironment } from './helpers/db-test-setup';

describe('Section 4: Idempotency & Concurrency Verification', () => {
  let env: TestDbEnvironment;

  beforeEach(async () => {
    env = await createTestDbEnvironment();
  });

  it('verifies concurrent executions with the same idempotency_key result in exactly 1 sale, 1 journal, and 1 inventory deduction', async () => {
    await env.asUser(env.cashierAUserId);

    const idempotencyKey = 'CONCURRENT-IDEM-001';
    const itemsPayload = JSON.stringify([
      {
        item_type: 'PRODUCT',
        product_id: env.retailPomadeId,
        quantity: 2,
        unit_price: 100000,
        total_amount: 200000,
      },
    ]);
    const paymentsPayload = JSON.stringify([
      {
        payment_method_id: env.cashMethodId,
        amount: 200000,
      },
    ]);

    // Initial stock is 50
    const stockBefore = (
      await env.db.query<{ quantity: string }>(
        `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.retailPomadeId}'`
      )
    ).rows[0].quantity;
    expect(parseFloat(stockBefore)).toBe(50.0);

    // Launch 5 concurrent calls with exact same idempotency_key
    const query = `
      SELECT process_pos_sale(
        '${env.outletAId}',
        '${idempotencyKey}',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '${itemsPayload}'::jsonb,
        '${paymentsPayload}'::jsonb,
        0
      ) as process_pos_sale
    `;

    const results = await Promise.all([
      env.db.query<{ process_pos_sale: { success: boolean; sale_id: string; is_duplicate?: boolean } }>(query),
      env.db.query<{ process_pos_sale: { success: boolean; sale_id: string; is_duplicate?: boolean } }>(query),
      env.db.query<{ process_pos_sale: { success: boolean; sale_id: string; is_duplicate?: boolean } }>(query),
      env.db.query<{ process_pos_sale: { success: boolean; sale_id: string; is_duplicate?: boolean } }>(query),
      env.db.query<{ process_pos_sale: { success: boolean; sale_id: string; is_duplicate?: boolean } }>(query),
    ]);

    // 1. All calls must succeed and return the exact same sale_id
    expect(results.length).toBe(5);
    const primarySaleId = results[0].rows[0].process_pos_sale.sale_id;
    expect(primarySaleId).toBeDefined();

    for (const res of results) {
      expect(res.rows[0].process_pos_sale.success).toBe(true);
      expect(res.rows[0].process_pos_sale.sale_id).toBe(primarySaleId);
    }

    // Exactly 4 out of 5 must be marked as duplicate
    const duplicateCount = results.filter((r) => r.rows[0].process_pos_sale.is_duplicate === true).length;
    expect(duplicateCount).toBe(4);

    // 2. Exactly 1 sale in database
    await env.resetUser();
    const saleCheck = await env.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM sales WHERE outlet_id = '${env.outletAId}' AND idempotency_key = '${idempotencyKey}'`
    );
    expect(parseInt(saleCheck.rows[0].count)).toBe(1);

    // 3. Exactly 1 journal entry in database
    const journalCheck = await env.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM journal_entries WHERE reference_type = 'SALE' AND reference_id = '${primarySaleId}'`
    );
    expect(parseInt(journalCheck.rows[0].count)).toBe(1);

    // 4. Inventory deducted exactly once (50 - 2 = 48)
    const stockAfter = (
      await env.db.query<{ quantity: string }>(
        `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.retailPomadeId}'`
      )
    ).rows[0].quantity;
    expect(parseFloat(stockAfter)).toBe(48.0);

    // 5. Exactly 1 inventory movement recorded
    const movementCheck = await env.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM inventory_movements WHERE reference_type = 'SALE' AND reference_id = '${primarySaleId}'`
    );
    expect(parseInt(movementCheck.rows[0].count)).toBe(1);
  });

  it('verifies sequential replay of same idempotency_key returns cached result without secondary effects', async () => {
    await env.asUser(env.cashierAUserId);

    const idempotencyKey = 'SEQUENTIAL-IDEM-002';
    const itemsPayload = JSON.stringify([
      {
        item_type: 'SERVICE',
        service_id: env.serviceCutId,
        barber_id: env.barberAEmployeeId,
        quantity: 1,
        unit_price: 50000,
        total_amount: 50000,
        commission_type: 'PERCENTAGE',
        commission_rate: 15,
        commission_amount: 7500,
      },
    ]);
    const paymentsPayload = JSON.stringify([
      {
        payment_method_id: env.cashMethodId,
        amount: 50000,
      },
    ]);

    const query = `
      SELECT process_pos_sale(
        '${env.outletAId}',
        '${idempotencyKey}',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '${itemsPayload}'::jsonb,
        '${paymentsPayload}'::jsonb,
        0
      ) as process_pos_sale
    `;

    // 1st Execution
    const firstRes = await env.db.query<{ process_pos_sale: { success: boolean; sale_id: string; is_duplicate?: boolean } }>(query);
    expect(firstRes.rows[0].process_pos_sale.success).toBe(true);
    expect(firstRes.rows[0].process_pos_sale.is_duplicate).toBeUndefined();
    const saleId = firstRes.rows[0].process_pos_sale.sale_id;

    // 2nd Execution (Replay)
    const secondRes = await env.db.query<{ process_pos_sale: { success: boolean; sale_id: string; is_duplicate?: boolean } }>(query);
    expect(secondRes.rows[0].process_pos_sale.success).toBe(true);
    expect(secondRes.rows[0].process_pos_sale.is_duplicate).toBe(true);
    expect(secondRes.rows[0].process_pos_sale.sale_id).toBe(saleId);

    // Verify commissions created exactly once
    await env.resetUser();
    const commCheck = await env.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM commissions WHERE outlet_id = '${env.outletAId}' AND employee_id = '${env.barberAEmployeeId}'`
    );
    expect(parseInt(commCheck.rows[0].count)).toBe(1);
  });
});
