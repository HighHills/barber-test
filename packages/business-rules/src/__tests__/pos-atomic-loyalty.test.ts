import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDbEnvironment, TestDbEnvironment } from './helpers/db-test-setup.js';
import { randomUUID } from 'crypto';

describe('Security Hardening: Atomic POS Checkout & Loyalty Redemption (Migration 33)', () => {
  let env: TestDbEnvironment;
  let activeSessionId: string;

  beforeAll(async () => {
    env = await createTestDbEnvironment();
    await env.resetUser();

    // Setup an active cash register and cash session for outletA
    const regRes = await env.db.query<{ id: string }>(
      `INSERT INTO cash_registers (outlet_id, name)
       VALUES ('${env.outletAId}', 'Main Register')
       RETURNING id`
    );
    const registerId = regRes.rows[0].id;

    const sessionRes = await env.db.query<{ id: string }>(
      `INSERT INTO cash_sessions (cash_register_id, opened_by, opening_balance, status, opened_at)
       VALUES ('${registerId}', '${env.cashierAProfileId}', 100000, 'OPEN', CURRENT_TIMESTAMP)
       RETURNING id`
    );
    activeSessionId = sessionRes.rows[0].id;
  });

  // ==========================================================================
  // TEST A: Normal Checkout Without Loyalty
  // ==========================================================================
  describe('Test A: Normal POS checkout without loyalty', () => {
    it('successfully processes sale and awards loyalty points based on server total', async () => {
      await env.resetUser();

      // Create a dedicated customer with 0 initial points
      const custRes = await env.db.query<{ id: string }>(
        `INSERT INTO customers (customer_code, full_name, phone, current_loyalty_points, is_active)
         VALUES ('CUST-TEST-A', 'Customer Test A', '081299990001', 0, true)
         RETURNING id`
      );
      const custId = custRes.rows[0].id;

      await env.asUser(env.cashierAUserId);

      const idempotencyKey = randomUUID();
      const itemsPayload = JSON.stringify([
        {
          item_type: 'SERVICE',
          service_id: env.serviceCutId,
          barber_id: env.barberAEmployeeId,
          quantity: 1,
          item_discount_amount: 0,
        },
      ]);
      const paymentsPayload = JSON.stringify([
        {
          payment_method_id: env.cashMethodId,
          amount: 50000,
          reference_number: null,
        },
      ]);

      const res = await env.db.query<{ process_pos_sale_with_loyalty: any }>(
        `SELECT process_pos_sale_with_loyalty(
          '${env.outletAId}',
          '${idempotencyKey}',
          '${env.cashierAProfileId}',
          '${custId}',
          '${activeSessionId}',
          '${itemsPayload}'::jsonb,
          '${paymentsPayload}'::jsonb,
          0.00,
          'Test A checkout',
          0
        ) as process_pos_sale_with_loyalty`
      );

      const saleResult = res.rows[0].process_pos_sale_with_loyalty;
      expect(saleResult.success).toBe(true);
      expect(saleResult.points_redeemed).toBe(0);
      expect(parseFloat(saleResult.total_amount)).toBe(50000);
      expect(saleResult.points_earned).toBe(5); // 50000 / 10000 = 5 points

      // Verify no REDEEM ledger entry
      const redeemCheck = await env.db.query(
        `SELECT * FROM customer_loyalty_ledger WHERE sale_id = '${saleResult.sale_id}' AND transaction_type = 'REDEEM'`
      );
      expect(redeemCheck.rows.length).toBe(0);

      // Verify EARN ledger entry
      const earnCheck = await env.db.query<{ points_change: number }>(
        `SELECT * FROM customer_loyalty_ledger WHERE sale_id = '${saleResult.sale_id}' AND transaction_type = 'EARN'`
      );
      expect(earnCheck.rows.length).toBe(1);
      expect(earnCheck.rows[0].points_change).toBe(5);

      // Verify customer current_loyalty_points
      const custCheck = await env.db.query<{ current_loyalty_points: number }>(
        `SELECT current_loyalty_points FROM customers WHERE id = '${custId}'`
      );
      expect(custCheck.rows[0].current_loyalty_points).toBe(5);
    });
  });

  // ==========================================================================
  // TEST B: Checkout With Loyalty Points
  // ==========================================================================
  describe('Test B: Checkout with loyalty redemption', () => {
    it('atomically completes sale, applies discount, records REDEEM and EARN', async () => {
      await env.resetUser();

      // Customer with 100 points
      const custRes = await env.db.query<{ id: string }>(
        `INSERT INTO customers (customer_code, full_name, phone, current_loyalty_points, is_active)
         VALUES ('CUST-TEST-B', 'Customer Test B', '081299990002', 100, true)
         RETURNING id`
      );
      const custId = custRes.rows[0].id;

      await env.asUser(env.cashierAUserId);

      // Service price = 50000. Redeem 50 points = Rp 5000 discount. Net payable = 45000.
      const idempotencyKey = randomUUID();
      const itemsPayload = JSON.stringify([
        {
          item_type: 'SERVICE',
          service_id: env.serviceCutId,
          barber_id: env.barberAEmployeeId,
          quantity: 1,
          item_discount_amount: 0,
        },
      ]);
      const paymentsPayload = JSON.stringify([
        {
          payment_method_id: env.cashMethodId,
          amount: 45000,
          reference_number: null,
        },
      ]);

      const res = await env.db.query<{ process_pos_sale_with_loyalty: any }>(
        `SELECT process_pos_sale_with_loyalty(
          '${env.outletAId}',
          '${idempotencyKey}',
          '${env.cashierAProfileId}',
          '${custId}',
          '${activeSessionId}',
          '${itemsPayload}'::jsonb,
          '${paymentsPayload}'::jsonb,
          0.00,
          'Test B checkout with points',
          50
        ) as process_pos_sale_with_loyalty`
      );

      const saleResult = res.rows[0].process_pos_sale_with_loyalty;
      expect(saleResult.success).toBe(true);
      expect(saleResult.points_redeemed).toBe(50);
      expect(parseFloat(saleResult.loyalty_discount)).toBe(5000);
      expect(parseFloat(saleResult.total_amount)).toBe(45000);

      // Verify sales table columns and constraints
      const saleRow = await env.db.query<{
        loyalty_points_redeemed: number;
        loyalty_discount_amount: string;
        discount_amount: string;
      }>(`SELECT loyalty_points_redeemed, loyalty_discount_amount, discount_amount FROM sales WHERE id = '${saleResult.sale_id}'`);
      expect(saleRow.rows[0].loyalty_points_redeemed).toBe(50);
      expect(parseFloat(saleRow.rows[0].loyalty_discount_amount)).toBe(5000);
      expect(parseFloat(saleRow.rows[0].discount_amount)).toBe(5000);

      // Exactly 1 REDEEM entry (-50)
      const redeemCheck = await env.db.query<{ points_change: number }>(
        `SELECT points_change FROM customer_loyalty_ledger WHERE sale_id = '${saleResult.sale_id}' AND transaction_type = 'REDEEM'`
      );
      expect(redeemCheck.rows.length).toBe(1);
      expect(redeemCheck.rows[0].points_change).toBe(-50);

      // Exactly 1 EARN entry (45000 / 10000 = 4 points)
      const earnCheck = await env.db.query<{ points_change: number }>(
        `SELECT points_change FROM customer_loyalty_ledger WHERE sale_id = '${saleResult.sale_id}' AND transaction_type = 'EARN'`
      );
      expect(earnCheck.rows.length).toBe(1);
      expect(earnCheck.rows[0].points_change).toBe(4);

      // Customer balance: 100 - 50 + 4 = 54 points
      const custCheck = await env.db.query<{ current_loyalty_points: number }>(
        `SELECT current_loyalty_points FROM customers WHERE id = '${custId}'`
      );
      expect(custCheck.rows[0].current_loyalty_points).toBe(54);
    });
  });

  // ==========================================================================
  // TEST C: Retry Checkout & Idempotency Misuse Guard
  // ==========================================================================
  describe('Test C: Retry checkout and idempotency misuse protection', () => {
    it('identical retry returns existing sale without double EARN or double REDEEM', async () => {
      await env.resetUser();

      const custRes = await env.db.query<{ id: string }>(
        `INSERT INTO customers (customer_code, full_name, phone, current_loyalty_points, is_active)
         VALUES ('CUST-TEST-C', 'Customer Test C', '081299990003', 100, true)
         RETURNING id`
      );
      const custId = custRes.rows[0].id;

      await env.asUser(env.cashierAUserId);

      const idempotencyKey = randomUUID();
      const itemsPayload = JSON.stringify([
        {
          item_type: 'SERVICE',
          service_id: env.serviceCutId,
          barber_id: env.barberAEmployeeId,
          quantity: 1,
          item_discount_amount: 0,
        },
      ]);
      const paymentsPayload = JSON.stringify([
        {
          payment_method_id: env.cashMethodId,
          amount: 45000,
          reference_number: null,
        },
      ]);

      // Call 1
      const res1 = await env.db.query<{ process_pos_sale_with_loyalty: any }>(
        `SELECT process_pos_sale_with_loyalty(
          '${env.outletAId}',
          '${idempotencyKey}',
          '${env.cashierAProfileId}',
          '${custId}',
          '${activeSessionId}',
          '${itemsPayload}'::jsonb,
          '${paymentsPayload}'::jsonb,
          0.00,
          'Test C idempotency 1',
          50
        ) as process_pos_sale_with_loyalty`
      );
      const saleId = res1.rows[0].process_pos_sale_with_loyalty.sale_id;

      // Call 2 (identical retry)
      const res2 = await env.db.query<{ process_pos_sale_with_loyalty: any }>(
        `SELECT process_pos_sale_with_loyalty(
          '${env.outletAId}',
          '${idempotencyKey}',
          '${env.cashierAProfileId}',
          '${custId}',
          '${activeSessionId}',
          '${itemsPayload}'::jsonb,
          '${paymentsPayload}'::jsonb,
          0.00,
          'Test C idempotency 1',
          50
        ) as process_pos_sale_with_loyalty`
      );
      expect(res2.rows[0].process_pos_sale_with_loyalty.is_duplicate).toBe(true);
      expect(res2.rows[0].process_pos_sale_with_loyalty.sale_id).toBe(saleId);

      // Assert still exactly 1 REDEEM and 1 EARN in ledger
      const redeemCount = await env.db.query(
        `SELECT * FROM customer_loyalty_ledger WHERE sale_id = '${saleId}' AND transaction_type = 'REDEEM'`
      );
      expect(redeemCount.rows.length).toBe(1);

      const earnCount = await env.db.query(
        `SELECT * FROM customer_loyalty_ledger WHERE sale_id = '${saleId}' AND transaction_type = 'EARN'`
      );
      expect(earnCount.rows.length).toBe(1);

      // Customer balance remains 100 - 50 + 4 = 54
      const custCheck = await env.db.query<{ current_loyalty_points: number }>(
        `SELECT current_loyalty_points FROM customers WHERE id = '${custId}'`
      );
      expect(custCheck.rows[0].current_loyalty_points).toBe(54);
    });

    it('rejects retrying same idempotency key with different customer or points', async () => {
      await env.asUser(env.cashierAUserId);

      const idempotencyKey = randomUUID();
      const itemsPayload = JSON.stringify([
        {
          item_type: 'SERVICE',
          service_id: env.serviceCutId,
          barber_id: env.barberAEmployeeId,
          quantity: 1,
          item_discount_amount: 0,
        },
      ]);
      const paymentsPayload = JSON.stringify([
        {
          payment_method_id: env.cashMethodId,
          amount: 50000,
          reference_number: null,
        },
      ]);

      // Execute initial sale with customer A
      await env.db.query(
        `SELECT process_pos_sale_with_loyalty(
          '${env.outletAId}',
          '${idempotencyKey}',
          '${env.cashierAProfileId}',
          '${env.customerId}',
          '${activeSessionId}',
          '${itemsPayload}'::jsonb,
          '${paymentsPayload}'::jsonb,
          0.00,
          'Initial sale',
          0
        )`
      );

      // Retry with DIFFERENT customer -> must reject
      const fakeCustomer = randomUUID();
      await expect(
        env.db.query(
          `SELECT process_pos_sale_with_loyalty(
            '${env.outletAId}',
            '${idempotencyKey}',
            '${env.cashierAProfileId}',
            '${fakeCustomer}',
            '${activeSessionId}',
            '${itemsPayload}'::jsonb,
            '${paymentsPayload}'::jsonb,
            0.00,
            'Different customer',
            0
          )`
        )
      ).rejects.toThrow(/Idempotency conflict/);

      // Retry with DIFFERENT loyalty points -> must reject
      await expect(
        env.db.query(
          `SELECT process_pos_sale_with_loyalty(
            '${env.outletAId}',
            '${idempotencyKey}',
            '${env.cashierAProfileId}',
            '${env.customerId}',
            '${activeSessionId}',
            '${itemsPayload}'::jsonb,
            '${paymentsPayload}'::jsonb,
            0.00,
            'Different points',
            10
          )`
        )
      ).rejects.toThrow(/Idempotency conflict/);
    });
  });

  // ==========================================================================
  // TEST D: Cross-Customer / Sale Mismatch
  // ==========================================================================
  describe('Test D: Customer mismatch or invalid customer on points redemption', () => {
    it('rejects loyalty redemption without a customer', async () => {
      await env.asUser(env.cashierAUserId);

      const idempotencyKey = randomUUID();
      const itemsPayload = JSON.stringify([
        {
          item_type: 'SERVICE',
          service_id: env.serviceCutId,
          barber_id: env.barberAEmployeeId,
          quantity: 1,
          item_discount_amount: 0,
        },
      ]);
      const paymentsPayload = JSON.stringify([
        {
          payment_method_id: env.cashMethodId,
          amount: 40000,
          reference_number: null,
        },
      ]);

      await expect(
        env.db.query(
          `SELECT process_pos_sale_with_loyalty(
            '${env.outletAId}',
            '${idempotencyKey}',
            '${env.cashierAProfileId}',
            NULL,
            '${activeSessionId}',
            '${itemsPayload}'::jsonb,
            '${paymentsPayload}'::jsonb,
            0.00,
            'No customer with points',
            50
          )`
        )
      ).rejects.toThrow(/Customer wajib diisi saat menukarkan loyalty points/);
    });
  });

  // ==========================================================================
  // TEST E: Redemption Exceeding Customer Balance
  // ==========================================================================
  describe('Test E: Redemption exceeding customer balance', () => {
    it('rejects transaction and creates no sale if points requested exceed customer balance', async () => {
      await env.resetUser();

      // Customer with only 20 points
      const custRes = await env.db.query<{ id: string }>(
        `INSERT INTO customers (customer_code, full_name, phone, current_loyalty_points, is_active)
         VALUES ('CUST-TEST-E', 'Customer Test E', '081299990005', 20, true)
         RETURNING id`
      );
      const custId = custRes.rows[0].id;

      await env.asUser(env.cashierAUserId);

      const idempotencyKey = randomUUID();
      const itemsPayload = JSON.stringify([
        {
          item_type: 'SERVICE',
          service_id: env.serviceCutId,
          barber_id: env.barberAEmployeeId,
          quantity: 1,
          item_discount_amount: 0,
        },
      ]);
      const paymentsPayload = JSON.stringify([
        {
          payment_method_id: env.cashMethodId,
          amount: 40000,
          reference_number: null,
        },
      ]);

      // Request 100 points when balance is only 20
      await expect(
        env.db.query(
          `SELECT process_pos_sale_with_loyalty(
            '${env.outletAId}',
            '${idempotencyKey}',
            '${env.cashierAProfileId}',
            '${custId}',
            '${activeSessionId}',
            '${itemsPayload}'::jsonb,
            '${paymentsPayload}'::jsonb,
            0.00,
            'Excessive points',
            100
          )`
        )
      ).rejects.toThrow(/Saldo poin tidak mencukupi/);

      // Ensure no sale record was created (full rollback)
      const saleCheck = await env.db.query(
        `SELECT * FROM sales WHERE outlet_id = '${env.outletAId}' AND idempotency_key = '${idempotencyKey}'`
      );
      expect(saleCheck.rows.length).toBe(0);

      // Customer balance remains untouched
      const custCheck = await env.db.query<{ current_loyalty_points: number }>(
        `SELECT current_loyalty_points FROM customers WHERE id = '${custId}'`
      );
      expect(custCheck.rows[0].current_loyalty_points).toBe(20);
    });
  });

  // ==========================================================================
  // TEST F: Malicious Direct RPC Calls
  // ==========================================================================
  describe('Test F: Standalone RPC privilege lockdown', () => {
    it('denies authenticated direct execution of redeem_loyalty_points', async () => {
      await env.asUser(env.cashierAUserId);

      const privCheck = await env.db.query<{ has_priv: boolean }>(
        `SELECT has_function_privilege(
          'authenticated',
          'public.redeem_loyalty_points(UUID,UUID,UUID,INTEGER,UUID)',
          'EXECUTE'
        ) as has_priv`
      );
      expect(privCheck.rows[0].has_priv).toBe(false);
    });

    it('denies authenticated direct execution of award_loyalty_points', async () => {
      await env.asUser(env.cashierAUserId);

      const privCheck = await env.db.query<{ has_priv: boolean }>(
        `SELECT has_function_privilege(
          'authenticated',
          'public.award_loyalty_points(UUID,UUID,UUID,NUMERIC,UUID)',
          'EXECUTE'
        ) as has_priv`
      );
      expect(privCheck.rows[0].has_priv).toBe(false);
    });

    it('denies anonymous execution of process_pos_sale_with_loyalty', async () => {
      await env.resetUser();

      const privCheck = await env.db.query<{ has_priv: boolean }>(
        `SELECT has_function_privilege(
          'anon',
          'public.process_pos_sale_with_loyalty(UUID,VARCHAR,UUID,UUID,UUID,JSONB,JSONB,NUMERIC,TEXT,INTEGER)',
          'EXECUTE'
        ) as has_priv`
      );
      expect(privCheck.rows[0].has_priv).toBe(false);
    });
  });

  // ==========================================================================
  // TEST G: Malicious Direct Table Mutations
  // ==========================================================================
  describe('Test G: Table privilege revocation on loyalty and history ledgers', () => {
    it('strictly denies authenticated direct INSERT/UPDATE/DELETE on customer_loyalty_ledger', async () => {
      const insPriv = await env.db.query<{ can_ins: boolean }>(
        `SELECT has_table_privilege('authenticated', 'public.customer_loyalty_ledger', 'INSERT') as can_ins`
      );
      expect(insPriv.rows[0].can_ins).toBe(false);

      const updPriv = await env.db.query<{ can_upd: boolean }>(
        `SELECT has_table_privilege('authenticated', 'public.customer_loyalty_ledger', 'UPDATE') as can_upd`
      );
      expect(updPriv.rows[0].can_upd).toBe(false);

      const delPriv = await env.db.query<{ can_del: boolean }>(
        `SELECT has_table_privilege('authenticated', 'public.customer_loyalty_ledger', 'DELETE') as can_del`
      );
      expect(delPriv.rows[0].can_del).toBe(false);
    });

    it('strictly denies authenticated direct INSERT/UPDATE/DELETE on customer_haircut_history', async () => {
      const insPriv = await env.db.query<{ can_ins: boolean }>(
        `SELECT has_table_privilege('authenticated', 'public.customer_haircut_history', 'INSERT') as can_ins`
      );
      expect(insPriv.rows[0].can_ins).toBe(false);

      const updPriv = await env.db.query<{ can_upd: boolean }>(
        `SELECT has_table_privilege('authenticated', 'public.customer_haircut_history', 'UPDATE') as can_upd`
      );
      expect(updPriv.rows[0].can_upd).toBe(false);

      const delPriv = await env.db.query<{ can_del: boolean }>(
        `SELECT has_table_privilege('authenticated', 'public.customer_haircut_history', 'DELETE') as can_del`
      );
      expect(delPriv.rows[0].can_del).toBe(false);
    });
  });

  // ==========================================================================
  // TEST H: Direct Tier Recalculation Lockdown
  // ==========================================================================
  describe('Test H: Direct recalculate_customer_tier lockdown', () => {
    it('denies authenticated direct execution of recalculate_customer_tier', async () => {
      const privCheck = await env.db.query<{ has_priv: boolean }>(
        `SELECT has_function_privilege(
          'authenticated',
          'public.recalculate_customer_tier(UUID)',
          'EXECUTE'
        ) as has_priv`
      );
      expect(privCheck.rows[0].has_priv).toBe(false);
    });
  });

  // ==========================================================================
  // TEST I: Normal CRM Actions Continue Functioning
  // ==========================================================================
  describe('Test I: Normal CRM manual adjustment and haircut history', () => {
    it('allows authorized staff to manually adjust loyalty points', async () => {
      await env.resetUser();

      const custRes = await env.db.query<{ id: string }>(
        `INSERT INTO customers (customer_code, full_name, phone, current_loyalty_points, is_active)
         VALUES ('CUST-TEST-I1', 'Customer CRM Test', '081299990009', 10, true)
         RETURNING id`
      );
      const custId = custRes.rows[0].id;

      await env.asUser(env.ownerUserId);

      const adjRes = await env.db.query<{ adjust_customer_loyalty_points: number }>(
        `SELECT adjust_customer_loyalty_points(
          '${custId}',
          '${env.outletAId}',
          25,
          'Bonus promo ulang tahun',
          '${env.ownerProfileId}'
        ) as adjust_customer_loyalty_points`
      );

      expect(adjRes.rows[0].adjust_customer_loyalty_points).toBe(35);

      const custCheck = await env.db.query<{ current_loyalty_points: number }>(
        `SELECT current_loyalty_points FROM customers WHERE id = '${custId}'`
      );
      expect(custCheck.rows[0].current_loyalty_points).toBe(35);
    });

    it('allows authorized staff to add customer haircut history record', async () => {
      await env.resetUser();

      const custRes = await env.db.query<{ id: string }>(
        `INSERT INTO customers (customer_code, full_name, phone, is_active)
         VALUES ('CUST-TEST-I2', 'Customer Haircut Test', '081299990010', true)
         RETURNING id`
      );
      const custId = custRes.rows[0].id;

      await env.asUser(env.cashierAUserId);

      const recordRes = await env.db.query<{ add_customer_haircut_record: string }>(
        `SELECT add_customer_haircut_record(
          '${custId}',
          '${env.outletAId}',
          '${env.barberAEmployeeId}',
          'Skin Fade Undercut',
          '0.5',
          '2.0',
          'Water-based Pomade',
          'Garis rambut natural',
          NULL,
          NULL,
          '${env.cashierAProfileId}'
        ) as add_customer_haircut_record`
      );

      expect(recordRes.rows[0].add_customer_haircut_record).toBeDefined();

      const historyCheck = await env.db.query(
        `SELECT * FROM customer_haircut_history WHERE id = '${recordRes.rows[0].add_customer_haircut_record}'`
      );
      expect(historyCheck.rows.length).toBe(1);
    });
  });
});
