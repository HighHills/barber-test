import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
// @ts-ignore
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import * as fs from 'fs';
import * as path from 'path';

describe('Database, Security & Transaction Integrity Suite (Phase 0.5 Pass Verification)', () => {
  let db: PGlite;

  // Shared test entity IDs
  let outletAId: string;
  let outletBId: string;
  let ownerUserId: string;
  let ownerProfileId: string;
  let managerAUserId: string;
  let managerAProfileId: string;
  let managerBUserId: string;
  let managerBProfileId: string;
  let cashierAUserId: string;
  let cashierAProfileId: string;
  let barberAEmployeeId: string;
  let customerId: string;
  let cashPaymentMethodId: string;
  let serviceId: string;
  let consumableProductId: string;
  let retailProductId: string;

  beforeAll(async () => {
    db = new PGlite({
      extensions: {
        btree_gist,
      },
    });

    // 0. Bootstrap test-only auth mocks for PGlite
    await db.exec(`
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$ LANGUAGE sql STABLE;
    `);

    // 1. Run all tracked migrations in order
    const migDir = path.resolve(__dirname, '../../../../supabase/migrations');
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();

    for (const f of files) {
      let sql = fs.readFileSync(path.join(migDir, f), 'utf8');
      sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, '-- pgcrypto builtin in modern PG');
      await db.exec(sql);
    }

    // 2. Run seed.sql
    const seedFile = path.resolve(__dirname, '../../../../supabase/seed.sql');
    const seedSql = fs.readFileSync(seedFile, 'utf8');
    await db.exec(seedSql);

    // 3. Seed Base Operational Data
    // Outlets
    const outARes = await db.query<{ id: string }>(
      "INSERT INTO outlets (code, name, address) VALUES ('OUT-01', 'Downtown Branch', '123 Main St') RETURNING id"
    );
    outletAId = outARes.rows[0].id;

    const outBRes = await db.query<{ id: string }>(
      "INSERT INTO outlets (code, name, address) VALUES ('OUT-02', 'Uptown Branch', '456 High St') RETURNING id"
    );
    outletBId = outBRes.rows[0].id;

    // Roles
    const rolesRes = await db.query<{ id: string; code: string }>("SELECT id, code FROM roles");
    const roleMap = new Map(rolesRes.rows.map((r) => [r.code, r.id]));

    // Owner Profile & User
    ownerUserId = '11111111-1111-1111-1111-111111111111';
    const ownerProfRes = await db.query<{ id: string }>(
      `INSERT INTO profiles (auth_user_id, display_name) VALUES ('${ownerUserId}', 'Business Owner') RETURNING id`
    );
    ownerProfileId = ownerProfRes.rows[0].id;
    await db.query(
      `INSERT INTO user_roles (user_id, role_id, outlet_id) VALUES ('${ownerProfileId}', '${roleMap.get('OWNER')}', NULL)`
    );

    // Manager A (Outlet A only)
    managerAUserId = '22222222-2222-2222-2222-222222222222';
    const mgrAProfRes = await db.query<{ id: string }>(
      `INSERT INTO profiles (auth_user_id, display_name) VALUES ('${managerAUserId}', 'Manager Outlet A') RETURNING id`
    );
    managerAProfileId = mgrAProfRes.rows[0].id;
    await db.query(
      `INSERT INTO user_roles (user_id, role_id, outlet_id) VALUES ('${managerAProfileId}', '${roleMap.get('MANAGER')}', '${outletAId}')`
    );

    // Manager B (Outlet B only)
    managerBUserId = '33333333-3333-3333-3333-333333333333';
    const mgrBProfRes = await db.query<{ id: string }>(
      `INSERT INTO profiles (auth_user_id, display_name) VALUES ('${managerBUserId}', 'Manager Outlet B') RETURNING id`
    );
    managerBProfileId = mgrBProfRes.rows[0].id;
    await db.query(
      `INSERT INTO user_roles (user_id, role_id, outlet_id) VALUES ('${managerBProfileId}', '${roleMap.get('MANAGER')}', '${outletBId}')`
    );

    // Cashier A (Outlet A)
    cashierAUserId = '44444444-4444-4444-4444-444444444444';
    const cashAProfRes = await db.query<{ id: string }>(
      `INSERT INTO profiles (auth_user_id, display_name) VALUES ('${cashierAUserId}', 'Cashier Outlet A') RETURNING id`
    );
    cashierAProfileId = cashAProfRes.rows[0].id;
    await db.query(
      `INSERT INTO user_roles (user_id, role_id, outlet_id) VALUES ('${cashierAProfileId}', '${roleMap.get('CASHIER')}', '${outletAId}')`
    );

    // Barber Employee at Outlet A
    const barberEmpRes = await db.query<{ id: string }>(
      "INSERT INTO employees (employee_code, full_name, position) VALUES ('EMP-B01', 'Top Barber John', 'Barber') RETURNING id"
    );
    barberAEmployeeId = barberEmpRes.rows[0].id;
    await db.query(
      `INSERT INTO employee_outlets (employee_id, outlet_id, is_primary) VALUES ('${barberAEmployeeId}', '${outletAId}', true)`
    );

    // Customer
    const custRes = await db.query<{ id: string }>(
      "INSERT INTO customers (customer_code, full_name, phone) VALUES ('CUST-001', 'Alice Regular', '08123456789') RETURNING id"
    );
    customerId = custRes.rows[0].id;

    // Payment Method (CASH)
    const pmRes = await db.query<{ id: string }>("SELECT id FROM payment_methods WHERE code = 'CASH'");
    cashPaymentMethodId = pmRes.rows[0].id;

    // Service & Consumable Material
    const srvCatRes = await db.query<{ id: string }>(
      "INSERT INTO service_categories (name) VALUES ('Haircuts') RETURNING id"
    );
    const prodCatRes = await db.query<{ id: string }>(
      "INSERT INTO product_categories (name) VALUES ('Hair Care') RETURNING id"
    );

    const srvRes = await db.query<{ id: string }>(
      `INSERT INTO services (category_id, code, name, duration_minutes, default_cost_price)
       VALUES ('${srvCatRes.rows[0].id}', 'SRV-CUT', 'Classic Haircut', 30, 5000) RETURNING id`
    );
    serviceId = srvRes.rows[0].id;
    await db.query(
      `INSERT INTO service_outlets (service_id, outlet_id, selling_price) VALUES ('${serviceId}', '${outletAId}', 50000)`
    );

    // Consumable material (e.g. Neck Strip)
    const consRes = await db.query<{ id: string }>(
      `INSERT INTO products (category_id, sku, name, base_unit)
       VALUES ('${prodCatRes.rows[0].id}', 'MAT-NECK', 'Neck Paper Strip', 'PCS') RETURNING id`
    );
    consumableProductId = consRes.rows[0].id;
    // Recipe: 1 neck strip per haircut
    await db.query(
      `INSERT INTO service_consumptions (service_id, product_id, quantity) VALUES ('${serviceId}', '${consumableProductId}', 1.0000)`
    );

    // Retail Product (e.g. Pomade)
    const pomadeRes = await db.query<{ id: string }>(
      `INSERT INTO products (category_id, sku, name, base_unit)
       VALUES ('${prodCatRes.rows[0].id}', 'RET-POMADE', 'Matte Pomade', 'JAR') RETURNING id`
    );
    retailProductId = pomadeRes.rows[0].id;
    await db.query(
      `INSERT INTO product_outlets (product_id, outlet_id, selling_price) VALUES ('${retailProductId}', '${outletAId}', 100000)`
    );

    // Initial Inventory at Outlet A
    await db.query(
      `INSERT INTO outlet_inventory (outlet_id, product_id, quantity, average_cost)
       VALUES ('${outletAId}', '${consumableProductId}', 100.0000, 1000.00)`
    );
    await db.query(
      `INSERT INTO outlet_inventory (outlet_id, product_id, quantity, average_cost)
       VALUES ('${outletAId}', '${retailProductId}', 20.0000, 50000.00)`
    );
    // 4. Setup authenticated role (standard non-superuser role in Supabase)
    await db.exec(`
      DO $$ BEGIN
        CREATE ROLE authenticated;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
    `);
  });

  // Helper to switch simulated active session user
  async function asUser(userId: string | null) {
    if (userId) {
      await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userId}';`);
    } else {
      await db.exec('RESET ROLE; RESET "request.jwt.claim.sub";');
    }
  }

  describe('1. Schema Contract Invariants (SCH-01 & SCH-02)', () => {
    it('verifies that all 49 tables exist in public schema (including sale_refund_payments)', async () => {
      const res = await db.query<{ count: string }>(
        "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
      );
      expect(parseInt(res.rows[0].count, 10)).toBe(49);
    });

    it('SCH-01: Rejects negative tax_rate in business_settings', async () => {
      await expect(
        db.query(
          "INSERT INTO business_settings (business_name, tax_rate) VALUES ('Barbershop Invalid', -5.00)"
        )
      ).rejects.toThrow();
    });

    it('SCH-02: Rejects duplicate employee schedule on same day and outlet', async () => {
      await db.query(
        `INSERT INTO employee_schedules (employee_id, outlet_id, day_of_week, start_time, end_time)
         VALUES ('${barberAEmployeeId}', '${outletAId}', 1, '09:00:00', '17:00:00')`
      );

      // Duplicate schedule on day 1 for same barber & outlet
      await expect(
        db.query(
          `INSERT INTO employee_schedules (employee_id, outlet_id, day_of_week, start_time, end_time)
           VALUES ('${barberAEmployeeId}', '${outletAId}', 1, '10:00:00', '18:00:00')`
        )
      ).rejects.toThrow();
    });

    it('Booking Collision Guard: Rejects overlapping appointments for the same barber via btree_gist exclusion', async () => {
      const s1 = '2026-09-10 10:00:00+07';
      const e1 = '2026-09-10 10:45:00+07';
      await db.query(
        `INSERT INTO appointments (appointment_number, customer_id, outlet_id, service_id, barber_id, start_at, end_at, status)
         VALUES ('APT-001', '${customerId}', '${outletAId}', '${serviceId}', '${barberAEmployeeId}', '${s1}', '${e1}', 'CONFIRMED')`
      );

      // Attempt overlapping appointment (10:30 to 11:15)
      const s2 = '2026-09-10 10:30:00+07';
      const e2 = '2026-09-10 11:15:00+07';
      await expect(
        db.query(
          `INSERT INTO appointments (appointment_number, customer_id, outlet_id, service_id, barber_id, start_at, end_at, status)
           VALUES ('APT-002', '${customerId}', '${outletAId}', '${serviceId}', '${barberAEmployeeId}', '${s2}', '${e2}', 'CONFIRMED')`
        )
      ).rejects.toThrow();
    });
  });

  describe('2. Database Immutability Guards (AUD-01 & ACC-02)', () => {
    it('AUD-01: Blocks UPDATE and DELETE on audit_logs', async () => {
      const logRes = await db.query<{ id: string }>(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
         VALUES ('${ownerProfileId}', 'TEST_LOG', 'system', '${outletAId}') RETURNING id`
      );
      const logId = logRes.rows[0].id;

      // Attempt UPDATE
      await expect(
        db.query(`UPDATE audit_logs SET action = 'ALTERED' WHERE id = '${logId}'`)
      ).rejects.toThrow(/Audit logs are immutable/);

      // Attempt DELETE
      await expect(
        db.query(`DELETE FROM audit_logs WHERE id = '${logId}'`)
      ).rejects.toThrow(/Audit logs are immutable/);
    });

    it('AUD-01: Blocks UPDATE and DELETE on inventory_movements', async () => {
      const movRes = await db.query<{ id: string }>(
        `INSERT INTO inventory_movements (outlet_id, product_id, movement_type, quantity, unit_cost, quantity_before, quantity_after, reference_type, reference_id)
         VALUES ('${outletAId}', '${retailProductId}', 'OPENING', 10, 50000, 0, 10, 'OPENING', '${outletAId}') RETURNING id`
      );
      const movId = movRes.rows[0].id;

      await expect(
        db.query(`UPDATE inventory_movements SET quantity = 999 WHERE id = '${movId}'`)
      ).rejects.toThrow(/Inventory movements are immutable/);

      await expect(
        db.query(`DELETE FROM inventory_movements WHERE id = '${movId}'`)
      ).rejects.toThrow(/Inventory movements are immutable/);
    });

    it('ACC-02: Blocks UPDATE and DELETE on POSTED journal_entries and journal_lines', async () => {
      const jrnRes = await db.query<{ id: string }>(
        `INSERT INTO journal_entries (journal_number, journal_date, description, status)
         VALUES ('JRN-TEST-POSTED', CURRENT_DATE, 'Posted Test Entry', 'POSTED') RETURNING id`
      );
      const jrnId = jrnRes.rows[0].id;

      const accRes = await db.query<{ id: string }>("SELECT id FROM financial_accounts LIMIT 1");
      const accId = accRes.rows[0].id;

      // Adding line to posted entry
      const lineRes = await db.query<{ id: string }>(
        `INSERT INTO journal_lines (journal_entry_id, financial_account_id, outlet_id, debit, credit)
         VALUES ('${jrnId}', '${accId}', '${outletAId}', 100000, 0.00) RETURNING id`
      );
      const lineId = lineRes.rows[0].id;

      // Updating posted journal
      await expect(
        db.query(`UPDATE journal_entries SET description = 'TAMPERED' WHERE id = '${jrnId}'`)
      ).rejects.toThrow(/Posted journal entries are immutable/);

      // Deleting posted journal
      await expect(
        db.query(`DELETE FROM journal_entries WHERE id = '${jrnId}'`)
      ).rejects.toThrow(/Posted journal entries cannot be deleted/);

      // Updating line belonging to posted journal
      await expect(
        db.query(`UPDATE journal_lines SET debit = 500000 WHERE id = '${lineId}'`)
      ).rejects.toThrow(/Lines belonging to a POSTED journal entry cannot be updated or deleted/);

      // Deleting line belonging to posted journal
      await expect(
        db.query(`DELETE FROM journal_lines WHERE id = '${lineId}'`)
      ).rejects.toThrow(/Lines belonging to a POSTED journal entry cannot be updated or deleted/);
    });
  });

  describe('3. POS Checkout & Level 2 Double-Entry Journal (TX-01 & SEC-03)', () => {
    it('executes process_pos_sale with stock deduction, commission, and balanced posted journals', async () => {
      // Set session to Cashier A
      await asUser(cashierAUserId);

      const salePayload = {
        outlet_id: outletAId,
        idempotency_key: 'POS-TX-TEST-001',
        cashier_id: cashierAProfileId,
        customer_id: customerId,
        cash_session_id: null,
        items: [
          {
            item_type: 'SERVICE',
            service_id: serviceId,
            product_id: null,
            barber_id: barberAEmployeeId,
            description_snapshot: 'Classic Haircut',
            quantity: 1,
            unit_price: 50000,
            item_discount_amount: 0,
            allocated_discount_amount: 0,
            tax_amount: 0,
            total_amount: 50000,
            commission_type: 'PERCENTAGE',
            commission_rate: 20,
            commission_amount: 10000, // 20% of 50k
          },
          {
            item_type: 'PRODUCT',
            service_id: null,
            product_id: retailProductId,
            barber_id: null,
            description_snapshot: 'Matte Pomade',
            quantity: 2,
            unit_price: 100000,
            item_discount_amount: 0,
            allocated_discount_amount: 0,
            tax_amount: 0,
            total_amount: 200000,
            commission_type: null,
            commission_rate: 0,
            commission_amount: 0,
          },
        ],
        payments: [
          {
            payment_method_id: cashPaymentMethodId,
            amount: 250000,
            reference_number: null,
          },
        ],
        discount_amount: 0,
      };

      const res = await db.query<{ process_pos_sale: { success: boolean; sale_id: string; journal_id: string } }>(
        `SELECT process_pos_sale(
          '${salePayload.outlet_id}',
          '${salePayload.idempotency_key}',
          '${salePayload.cashier_id}',
          '${salePayload.customer_id}',
          NULL,
          '${JSON.stringify(salePayload.items)}'::jsonb,
          '${JSON.stringify(salePayload.payments)}'::jsonb,
          ${salePayload.discount_amount}
        ) as process_pos_sale`
      );

      const saleResult = res.rows[0].process_pos_sale;
      expect(saleResult.success).toBe(true);
      expect(saleResult.sale_id).toBeDefined();
      expect(saleResult.journal_id).toBeDefined();

      // 1. Verify Retail Stock was deducted (20 - 2 = 18)
      const stockRes = await db.query<{ quantity: string }>(
        `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${outletAId}' AND product_id = '${retailProductId}'`
      );
      expect(parseFloat(stockRes.rows[0].quantity)).toBe(18.0);

      // 2. Verify Consumable Material was deducted (100 - 1 = 99)
      const matRes = await db.query<{ quantity: string }>(
        `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${outletAId}' AND product_id = '${consumableProductId}'`
      );
      expect(parseFloat(matRes.rows[0].quantity)).toBe(99.0);

      // 3. Verify Barber Commission was recorded (10,000)
      const commRes = await db.query<{ commission_amount: string; status: string }>(
        `SELECT commission_amount, status FROM commissions WHERE sale_id = '${saleResult.sale_id}'`
      );
      expect(commRes.rows.length).toBe(1);
      expect(parseFloat(commRes.rows[0].commission_amount)).toBe(10000);
      expect(commRes.rows[0].status).toBe('EARNED');

      // 4. Verify Double-Entry Journal is Balanced and POSTED
      const jrnRes = await db.query<{ status: string; reference_type: string }>(
        `SELECT status, reference_type FROM journal_entries WHERE id = '${saleResult.journal_id}'`
      );
      expect(jrnRes.rows[0].status).toBe('POSTED');
      expect(jrnRes.rows[0].reference_type).toBe('SALE');

      const linesRes = await db.query<{ debit: string; credit: string }>(
        `SELECT debit, credit FROM journal_lines WHERE journal_entry_id = '${saleResult.journal_id}'`
      );
      expect(linesRes.rows.length).toBeGreaterThanOrEqual(4);

      let totalDebit = 0;
      let totalCredit = 0;
      for (const line of linesRes.rows) {
        const d = parseFloat(line.debit);
        const c = parseFloat(line.credit);
        expect((d > 0 && c === 0) || (d === 0 && c > 0)).toBe(true);
        totalDebit += d;
        totalCredit += c;
      }
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBeGreaterThanOrEqual(250000); // 250k sale + COGS + commission

      // 5. Verify Idempotency: Repeating call returns duplicate with same sale_id
      const idempRes = await db.query<{ process_pos_sale: { is_duplicate: boolean; sale_id: string } }>(
        `SELECT process_pos_sale(
          '${salePayload.outlet_id}',
          '${salePayload.idempotency_key}',
          '${salePayload.cashier_id}',
          '${salePayload.customer_id}',
          NULL,
          '${JSON.stringify(salePayload.items)}'::jsonb,
          '${JSON.stringify(salePayload.payments)}'::jsonb,
          ${salePayload.discount_amount}
        ) as process_pos_sale`
      );
      expect(idempRes.rows[0].process_pos_sale.is_duplicate).toBe(true);
      expect(idempRes.rows[0].process_pos_sale.sale_id).toBe(saleResult.sale_id);
    });

    it('SEC-03: Rejects process_pos_sale if caller is not authorized for cashier profile', async () => {
      // Impersonate Manager B trying to call as Cashier A
      await asUser(managerBUserId);

      const items = [{
        item_type: 'SERVICE',
        service_id: serviceId,
        quantity: 1,
        unit_price: 50000,
        total_amount: 50000
      }];
      const payments = [{ payment_method_id: cashPaymentMethodId, amount: 50000 }];

      await expect(
        db.query(
          `SELECT process_pos_sale(
            '${outletAId}',
            'UNAUTHORIZED-KEY-001',
            '${cashierAProfileId}',
            '${customerId}',
            NULL,
            '${JSON.stringify(items)}'::jsonb,
            '${JSON.stringify(payments)}'::jsonb,
            0
          )`
        )
      ).rejects.toThrow(/Caller is not authorized for cashier profile/);
    });
  });

  describe('4. Void, Refund & Stock Adjustment RPCs (TX-02)', () => {
    it('voids a sale, returning inventory and creating a reversing journal entry', async () => {
      await asUser(cashierAUserId);

      // Create a dedicated sale to void
      const saleRes = await db.query<{ process_pos_sale: { sale_id: string } }>(
        `SELECT process_pos_sale(
          '${outletAId}',
          'SALE-TO-VOID-001',
          '${cashierAProfileId}',
          '${customerId}',
          NULL,
          '[{"item_type":"PRODUCT","product_id":"${retailProductId}","quantity":1,"unit_price":100000,"total_amount":100000}]'::jsonb,
          '[{"payment_method_id":"${cashPaymentMethodId}","amount":100000}]'::jsonb,
          0
        ) as process_pos_sale`
      );
      const saleId = saleRes.rows[0].process_pos_sale.sale_id;

      // Check stock before void (18 - 1 = 17)
      const stockBefore = await db.query<{ quantity: string }>(
        `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${outletAId}' AND product_id = '${retailProductId}'`
      );
      expect(parseFloat(stockBefore.rows[0].quantity)).toBe(17.0);

      // Void the sale
      const voidRes = await db.query<{ void_sale: { success: boolean; status: string; reversed_journal_id: string } }>(
        `SELECT void_sale('${saleId}', '${cashierAProfileId}', 'Customer changed mind immediately') as void_sale`
      );
      expect(voidRes.rows[0].void_sale.success).toBe(true);
      expect(voidRes.rows[0].void_sale.status).toBe('VOIDED');

      // Check stock restored to 18
      const stockAfter = await db.query<{ quantity: string }>(
        `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${outletAId}' AND product_id = '${retailProductId}'`
      );
      expect(parseFloat(stockAfter.rows[0].quantity)).toBe(18.0);

      // Verify reversing journal was created
      const revJrnId = voidRes.rows[0].void_sale.reversed_journal_id;
      const revJrn = await db.query<{ status: string; reversed_journal_id: string }>(
        `SELECT status, reversed_journal_id FROM journal_entries WHERE id = '${revJrnId}'`
      );
      expect(revJrn.rows[0].status).toBe('POSTED');
      expect(revJrn.rows[0].reversed_journal_id).toBeDefined();
    });

    it('processes stock adjustment and posts inventory loss journal', async () => {
      await asUser(ownerUserId);

      // Create stock adjustment draft: reduce pomade stock from 18 to 15 (loss of 3)
      const adjRes = await db.query<{ id: string }>(
        `INSERT INTO stock_adjustments (adjustment_number, outlet_id, reason, created_by)
         VALUES ('ADJ-001', '${outletAId}', 'Damaged during delivery', '${ownerProfileId}') RETURNING id`
      );
      const adjId = adjRes.rows[0].id;

      await db.query(
        `INSERT INTO stock_adjustment_items (adjustment_id, product_id, quantity_before, quantity_after, quantity_delta, unit_cost)
         VALUES ('${adjId}', '${retailProductId}', 18.0, 15.0, -3.0, 50000.0)`
      );

      // Execute adjustment
      const procRes = await db.query<{ process_stock_adjustment: { success: boolean; status: string; journal_id: string } }>(
        `SELECT process_stock_adjustment('${adjId}', '${ownerProfileId}') as process_stock_adjustment`
      );
      expect(procRes.rows[0].process_stock_adjustment.success).toBe(true);
      expect(procRes.rows[0].process_stock_adjustment.status).toBe('APPLIED');

      // Check stock is now 15
      const stockRes = await db.query<{ quantity: string }>(
        `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${outletAId}' AND product_id = '${retailProductId}'`
      );
      expect(parseFloat(stockRes.rows[0].quantity)).toBe(15.0);

      // Check journal posted (Debit Loss, Credit Asset)
      const jrnId = procRes.rows[0].process_stock_adjustment.journal_id;
      expect(jrnId).toBeDefined();
      const lines = await db.query<{ debit: string; credit: string }>(
        `SELECT debit, credit FROM journal_lines WHERE journal_entry_id = '${jrnId}'`
      );
      expect(lines.rows.length).toBe(2);
      expect(parseFloat(lines.rows[0].debit) + parseFloat(lines.rows[1].debit)).toBe(150000); // 3 * 50,000
    });
  });

  describe('5. Row Level Security & Multi-Outlet Isolation (SEC-01)', () => {
    it('enforces strict cross-outlet isolation between Outlet A and Outlet B managers', async () => {
      // Create a sale at Outlet B by Owner
      await asUser(ownerUserId);
      await db.query<{ id: string }>(
        `INSERT INTO sales (invoice_number, outlet_id, subtotal, total_amount, idempotency_key, created_by)
         VALUES ('INV-OUTB-001', '${outletBId}', 50000, 50000, 'KEY-OUTB-001', '${ownerProfileId}') RETURNING id`
      );

      // Manager A queries sales (should see Outlet A sales, but ZERO Outlet B sales)
      await asUser(managerAUserId);
      const mgrASales = await db.query<{ invoice_number: string }>(
        "SELECT invoice_number FROM sales"
      );
      const sawOutletBSale = mgrASales.rows.some((s) => s.invoice_number === 'INV-OUTB-001');
      expect(sawOutletBSale).toBe(false);

      // Manager B queries sales (should see Outlet B sale, but ZERO Outlet A sales)
      await asUser(managerBUserId);
      const mgrBSales = await db.query<{ invoice_number: string }>(
        "SELECT invoice_number FROM sales"
      );
      const sawOutletBSaleAsB = mgrBSales.rows.some((s) => s.invoice_number === 'INV-OUTB-001');
      expect(sawOutletBSaleAsB).toBe(true);
      const sawOutletASaleAsB = mgrBSales.rows.some((s) => s.invoice_number.startsWith('INV-2026'));
      expect(sawOutletASaleAsB).toBe(false);
    });
  });
});
