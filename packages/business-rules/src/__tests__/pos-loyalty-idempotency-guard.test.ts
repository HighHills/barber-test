import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDbEnvironment, TestDbEnvironment } from './helpers/db-test-setup.js';
import { randomUUID } from 'crypto';

describe('Security Hardening: POS loyalty idempotency guard (Migration 34)', () => {
  let env: TestDbEnvironment;
  let activeSessionId: string;

  beforeAll(async () => {
    env = await createTestDbEnvironment();
    await env.resetUser();

    const regRes = await env.db.query<{ id: string }>(
      `INSERT INTO cash_registers (outlet_id, name)
       VALUES ('${env.outletAId}', 'Migration 34 Register')
       RETURNING id`
    );

    const sessionRes = await env.db.query<{ id: string }>(
      `INSERT INTO cash_sessions (cash_register_id, opened_by, opening_balance, status, opened_at)
       VALUES ('${regRes.rows[0].id}', '${env.cashierAProfileId}', 100000, 'OPEN', CURRENT_TIMESTAMP)
       RETURNING id`
    );
    activeSessionId = sessionRes.rows[0].id;
  });

  it('rejects a retry with a different effective discount', async () => {
    await env.resetUser();

    const custRes = await env.db.query<{ id: string }>(
      `INSERT INTO customers (customer_code, full_name, phone, current_loyalty_points, is_active)
       VALUES ('CUST-M34-DISCOUNT', 'Customer Migration 34 Discount', '081299991034', 100, true)
       RETURNING id`
    );
    const custId = custRes.rows[0].id;
    await env.asUser(env.cashierAUserId);

    const key = randomUUID();
    const items = JSON.stringify([{
      item_type: 'SERVICE',
      service_id: env.serviceCutId,
      barber_id: env.barberAEmployeeId,
      quantity: 1,
      item_discount_amount: 0,
    }]);
    const payments = JSON.stringify([{
      payment_method_id: env.cashMethodId,
      amount: 40000,
      reference_number: null,
    }]);

    const first = await env.db.query<{ process_pos_sale_with_loyalty: any }>(
      `SELECT process_pos_sale_with_loyalty(
        '${env.outletAId}', '${key}', '${env.cashierAProfileId}', '${custId}', '${activeSessionId}',
        '${items}'::jsonb, '${payments}'::jsonb, 0.00, 'migration-34', 100
      ) as process_pos_sale_with_loyalty`
    );

    expect(first.rows[0].process_pos_sale_with_loyalty.success).toBe(true);
    expect(first.rows[0].process_pos_sale_with_loyalty.points_redeemed).toBe(100);

    await expect(
      env.db.query(
        `SELECT process_pos_sale_with_loyalty(
          '${env.outletAId}', '${key}', '${env.cashierAProfileId}', '${custId}', '${activeSessionId}',
          '${items}'::jsonb, '${payments}'::jsonb, 1.00, 'migration-34', 100
        )`
      )
    ).rejects.toThrow(/Idempotency conflict/);
  });

  it('rejects a retry with a different checkout payload even when discount matches', async () => {
    await env.resetUser();

    const custRes = await env.db.query<{ id: string }>(
      `INSERT INTO customers (customer_code, full_name, phone, current_loyalty_points, is_active)
       VALUES ('CUST-M34-FINGERPRINT', 'Customer Migration 34 Fingerprint', '081299991035', 100, true)
       RETURNING id`
    );
    const custId = custRes.rows[0].id;
    await env.asUser(env.cashierAUserId);

    const key = randomUUID();
    const items1 = JSON.stringify([{
      item_type: 'SERVICE',
      service_id: env.serviceCutId,
      barber_id: env.barberAEmployeeId,
      quantity: 1,
      item_discount_amount: 0,
    }]);
    const items2 = JSON.stringify([{
      item_type: 'SERVICE',
      service_id: env.serviceCutId,
      barber_id: env.barberAEmployeeId,
      quantity: 2,
      item_discount_amount: 0,
    }]);
    const payments1 = JSON.stringify([{
      payment_method_id: env.cashMethodId,
      amount: 40000,
      reference_number: null,
    }]);
    const payments2 = JSON.stringify([{
      payment_method_id: env.cashMethodId,
      amount: 90000,
      reference_number: null,
    }]);

    await env.db.query(
      `SELECT process_pos_sale_with_loyalty(
        '${env.outletAId}', '${key}', '${env.cashierAProfileId}', '${custId}', '${activeSessionId}',
        '${items1}'::jsonb, '${payments1}'::jsonb, 0.00, 'migration-34-fingerprint', 100
      )`
    );

    await expect(
      env.db.query(
        `SELECT process_pos_sale_with_loyalty(
          '${env.outletAId}', '${key}', '${env.cashierAProfileId}', '${custId}', '${activeSessionId}',
          '${items2}'::jsonb, '${payments2}'::jsonb, 0.00, 'migration-34-fingerprint', 100
        )`
      )
    ).rejects.toThrow(/different checkout request|Idempotency conflict/);
  });
});
