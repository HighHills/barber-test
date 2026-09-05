import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDbEnvironment, TestDbEnvironment } from './helpers/db-test-setup';

describe('Sections 5, 6 & 7: RLS Cross-Outlet Matrix, Role Hierarchy & NULL Outlet Isolation', () => {
  let env: TestDbEnvironment;
  let outletBSaleId: string;

  beforeEach(async () => {
    env = await createTestDbEnvironment();

    // Seed test data in Outlet B using superuser
    // 1. Sale in Outlet B
    const saleRes = await env.db.query<{ id: string }>(
      `INSERT INTO sales (invoice_number, outlet_id, customer_id, subtotal, discount_amount, tax_amount, total_amount, status, idempotency_key, created_by)
       VALUES ('INV-OUTLET-B-001', '${env.outletBId}', '${env.customerId}', 50000, 0, 0, 50000, 'COMPLETED', 'IDEM-SEED-OUTLET-B', '${env.ownerProfileId}') RETURNING id`
    );
    outletBSaleId = saleRes.rows[0].id;

    // 2. Queue in Outlet B
    await env.db.query(
      `INSERT INTO queues (queue_number, outlet_id, status)
       VALUES (1, '${env.outletBId}', 'WAITING')`
    );

    // 3. Appointment in Outlet B
    await env.db.query(
      `INSERT INTO appointments (appointment_number, outlet_id, customer_id, service_id, barber_id, start_at, end_at, status)
       VALUES ('BK-B-001', '${env.outletBId}', '${env.customerId}', '${env.serviceCutId}', '${env.barberBEmployeeId}', CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP + INTERVAL '1 day 1 hour', 'CONFIRMED')`
    );

    // 4. Purchase in Outlet B
    const supRes = await env.db.query<{ id: string }>(
      `INSERT INTO suppliers (code, name) VALUES ('SUP-001', 'Default Supplier') RETURNING id`
    );
    await env.db.query(
      `INSERT INTO purchases (purchase_number, outlet_id, supplier_id, subtotal, total_amount, payment_status, created_by)
       VALUES ('PO-B-001', '${env.outletBId}', '${supRes.rows[0].id}', 100000, 100000, 'PAID', '${env.ownerProfileId}')`
    );

    // 5. Stock Transfer between Outlet B and a 3rd outlet dummy ID
    const dummyOutletId = '11111111-2222-3333-4444-555555555555';
    await env.db.query(
      `INSERT INTO outlets (id, name, code, is_active) VALUES ('${dummyOutletId}', 'Dummy Outlet', 'OUT-DUMMY', TRUE) ON CONFLICT DO NOTHING`
    );
    await env.db.query(
      `INSERT INTO stock_transfers (transfer_number, from_outlet_id, to_outlet_id, status, requested_by)
       VALUES ('TRF-B-001', '${env.outletBId}', '${dummyOutletId}', 'REQUESTED', '${env.ownerProfileId}')`
    );

    // 6. Stock adjustment in Outlet B
    await env.db.query(
      `INSERT INTO stock_adjustments (adjustment_number, outlet_id, reason, status, created_by)
       VALUES ('ADJ-B-001', '${env.outletBId}', 'Damage opname', 'DRAFT', '${env.ownerProfileId}')`
    );

    // 7. Inventory movement & Commission in Outlet B
    await env.db.query(
      `INSERT INTO inventory_movements (outlet_id, product_id, movement_type, quantity, unit_cost, quantity_before, quantity_after, reference_type, reference_id, occurred_at, created_by)
       VALUES ('${env.outletBId}', '${env.retailPomadeId}', 'ADJUSTMENT_IN', 10, 50000, 0, 10, 'MANUAL', gen_random_uuid(), CURRENT_TIMESTAMP, '${env.ownerProfileId}')`
    );
    const itemRes = await env.db.query<{ id: string }>(
      `INSERT INTO sale_items (sale_id, item_type, service_id, barber_id, description_snapshot, quantity, unit_price, total_amount)
       VALUES ('${outletBSaleId}', 'SERVICE', '${env.serviceCutId}', '${env.barberBEmployeeId}', 'Haircut B', 1, 50000, 50000) RETURNING id`
    );
    await env.db.query(
      `INSERT INTO commissions (sale_id, sale_item_id, outlet_id, employee_id, commission_type, commission_rate, commission_amount, status)
       VALUES ('${outletBSaleId}', '${itemRes.rows[0].id}', '${env.outletBId}', '${env.barberBEmployeeId}', 'PERCENTAGE', 20, 10000, 'EARNED')`
    );

    // 8. Journal line in Outlet B
    const jrnRes = await env.db.query<{ id: string }>(
      `INSERT INTO journal_entries (journal_number, journal_date, description, status, created_by)
       VALUES ('JRN-B-001', CURRENT_DATE, 'Outlet B Journal', 'POSTED', '${env.ownerProfileId}') RETURNING id`
    );
    const accRes = await env.db.query<{ id: string }>('SELECT id FROM financial_accounts LIMIT 1');
    await env.db.query(
      `INSERT INTO journal_lines (journal_entry_id, financial_account_id, outlet_id, debit, credit, description)
       VALUES ('${jrnRes.rows[0].id}', '${accRes.rows[0].id}', '${env.outletBId}', 50000, 0, 'Outlet B Debit')`
    );
  });

  describe('Section 5: RLS Cross-Outlet CRUD Isolation Matrix (Cashier A vs Outlet B)', () => {
    it('prohibits Cashier A from reading any Outlet B operational records', async () => {
      await env.asUser(env.cashierAUserId);

      // 1. Sales
      const sales = await env.db.query(`SELECT id FROM sales WHERE outlet_id = '${env.outletBId}'`);
      expect(sales.rows.length).toBe(0);

      // 2. Outlet Inventory
      const inventory = await env.db.query(`SELECT id FROM outlet_inventory WHERE outlet_id = '${env.outletBId}'`);
      expect(inventory.rows.length).toBe(0);

      // 3. Inventory Movements
      const movements = await env.db.query(`SELECT id FROM inventory_movements WHERE outlet_id = '${env.outletBId}'`);
      expect(movements.rows.length).toBe(0);

      // 4. Appointments
      const appts = await env.db.query(`SELECT id FROM appointments WHERE outlet_id = '${env.outletBId}'`);
      expect(appts.rows.length).toBe(0);

      // 5. Queues
      const queues = await env.db.query(`SELECT id FROM queues WHERE outlet_id = '${env.outletBId}'`);
      expect(queues.rows.length).toBe(0);

      // 6. Commissions
      const comms = await env.db.query(`SELECT id FROM commissions WHERE outlet_id = '${env.outletBId}'`);
      expect(comms.rows.length).toBe(0);

      // 7. Purchases
      const purchases = await env.db.query(`SELECT id FROM purchases WHERE outlet_id = '${env.outletBId}'`);
      expect(purchases.rows.length).toBe(0);

      // 8. Stock Transfers
      const transfers = await env.db.query(`SELECT id FROM stock_transfers WHERE from_outlet_id = '${env.outletBId}'`);
      expect(transfers.rows.length).toBe(0);

      // 9. Stock Adjustments
      const adjustments = await env.db.query(`SELECT id FROM stock_adjustments WHERE outlet_id = '${env.outletBId}'`);
      expect(adjustments.rows.length).toBe(0);

      // 10. Journal Lines
      const lines = await env.db.query(`SELECT id FROM journal_lines WHERE outlet_id = '${env.outletBId}'`);
      expect(lines.rows.length).toBe(0);
    });

    it('prohibits Cashier A from mutating (INSERT/UPDATE/DELETE) Outlet B data', async () => {
      await env.asUser(env.cashierAUserId);

      // Prohibit INSERT sale into Outlet B
      await expect(
        env.db.query(
          `INSERT INTO sales (invoice_number, outlet_id, customer_id, subtotal, discount_amount, tax_amount, total_amount, status, idempotency_key, created_by)
           VALUES ('INV-HACK-001', '${env.outletBId}', '${env.customerId}', 50000, 0, 0, 50000, 'COMPLETED', 'IDEM-HACK-001', '${env.cashierAProfileId}')`
        )
      ).rejects.toThrow(/violates row-level security policy/);

      // Prohibit UPDATE sale in Outlet B (RLS filters it out, 0 rows updated)
      const updateRes = await env.db.query(
        `UPDATE sales SET status = 'VOIDED' WHERE id = '${outletBSaleId}'`
      );
      expect(updateRes.affectedRows).toBe(0);

      // Prohibit DELETE sale in Outlet B
      const deleteRes = await env.db.query(
        `DELETE FROM sales WHERE id = '${outletBSaleId}'`
      );
      expect(deleteRes.affectedRows).toBe(0);
    });
  });

  describe('Section 6: Role & Permission Matrix Verification', () => {
    it('verifies Owner / Admin has full visibility across all outlets', async () => {
      await env.asUser(env.ownerUserId);

      // Owner sees Outlet A and Outlet B sales
      const salesA = await env.db.query(`SELECT id FROM sales WHERE outlet_id = '${env.outletAId}'`);
      expect(salesA.rows).toBeDefined();
      const salesB = await env.db.query(`SELECT id FROM sales WHERE outlet_id = '${env.outletBId}'`);
      expect(salesB.rows.length).toBeGreaterThanOrEqual(1);

      // Owner sees all inventory
      const inv = await env.db.query('SELECT id FROM outlet_inventory');
      expect(inv.rows.length).toBeGreaterThanOrEqual(2);

      // Owner sees all audit logs
      const audit = await env.db.query('SELECT id FROM audit_logs');
      expect(audit.rows).toBeDefined();
    });

    it('verifies Manager A has visibility ONLY to Outlet A', async () => {
      await env.asUser(env.managerAUserId);

      // Manager A sees Outlet A data
      const invA = await env.db.query(`SELECT id FROM outlet_inventory WHERE outlet_id = '${env.outletAId}'`);
      expect(invA.rows.length).toBeGreaterThanOrEqual(1);

      // Manager A CANNOT see Outlet B data
      const invB = await env.db.query(`SELECT id FROM outlet_inventory WHERE outlet_id = '${env.outletBId}'`);
      expect(invB.rows.length).toBe(0);

      const salesB = await env.db.query(`SELECT id FROM sales WHERE outlet_id = '${env.outletBId}'`);
      expect(salesB.rows.length).toBe(0);
    });

    it('verifies Barber B can view own commissions but not Outlet A commissions', async () => {
      // Create Barber B user with barber role at Outlet B
      const barberAuthId = '88888888-bbbb-cccc-dddd-888888888888';
      const barberProfileRes = await env.db.query<{ id: string }>(
        `INSERT INTO profiles (auth_user_id, display_name, employee_id, is_active)
         VALUES ('${barberAuthId}', 'Barber B', '${env.barberBEmployeeId}', TRUE) RETURNING id`
      );
      const barberRoleId = env.roleMap.get('BARBER')!;
      await env.db.query(
        `INSERT INTO user_roles (user_id, role_id, outlet_id)
         VALUES ('${barberProfileRes.rows[0].id}', '${barberRoleId}', '${env.outletBId}')`
      );

      await env.asUser(barberAuthId);

      // Barber B sees own commission
      const myComms = await env.db.query(
        `SELECT id FROM commissions WHERE employee_id = '${env.barberBEmployeeId}'`
      );
      expect(myComms.rows.length).toBe(1);

      // Barber B CANNOT see Outlet A commissions
      const otherComms = await env.db.query(
        `SELECT id FROM commissions WHERE outlet_id = '${env.outletAId}'`
      );
      expect(otherComms.rows.length).toBe(0);
    });

    it('verifies Unauthenticated (Anonymous) user is blocked from operational tables', async () => {
      await env.resetUser();
      // Switch to unauthenticated role
      await env.db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '';`);

      const sales = await env.db.query('SELECT id FROM sales');
      expect(sales.rows.length).toBe(0);

      const inventory = await env.db.query('SELECT id FROM outlet_inventory');
      expect(inventory.rows.length).toBe(0);

      const journals = await env.db.query('SELECT id FROM journal_entries');
      expect(journals.rows.length).toBe(0);
    });
  });

  describe('Section 7: NULL Outlet Role Restriction Invariant', () => {
    it('strictly denies global outlet access to operational roles (CASHIER) when outlet_id IS NULL', async () => {
      // Create a rogue Cashier with outlet_id IS NULL
      const rogueAuthId = '99999999-aaaa-bbbb-cccc-999999999999';
      const rogueProfRes = await env.db.query<{ id: string }>(
        `INSERT INTO profiles (auth_user_id, display_name, is_active)
         VALUES ('${rogueAuthId}', 'Rogue Cashier', TRUE) RETURNING id`
      );
      const cashierRoleId = env.roleMap.get('CASHIER')!;
      await env.db.query(
        `INSERT INTO user_roles (user_id, role_id, outlet_id)
         VALUES ('${rogueProfRes.rows[0].id}', '${cashierRoleId}', NULL)`
      );

      await env.asUser(rogueAuthId);

      // Must NOT have access to Outlet A
      const accessA = await env.db.query<{ has_access: boolean }>(
        `SELECT current_user_has_outlet_access('${env.outletAId}') as has_access`
      );
      expect(accessA.rows[0].has_access).toBe(false);

      // Must NOT have access to Outlet B
      const accessB = await env.db.query<{ has_access: boolean }>(
        `SELECT current_user_has_outlet_access('${env.outletBId}') as has_access`
      );
      expect(accessB.rows[0].has_access).toBe(false);

      // Cannot read sales from any outlet
      const sales = await env.db.query('SELECT id FROM sales');
      expect(sales.rows.length).toBe(0);
    });

    it('grants global outlet access to OWNER even when outlet_id IS NULL', async () => {
      // Owner in seed has outlet_id IS NULL
      await env.asUser(env.ownerUserId);

      const accessA = await env.db.query<{ has_access: boolean }>(
        `SELECT current_user_has_outlet_access('${env.outletAId}') as has_access`
      );
      expect(accessA.rows[0].has_access).toBe(true);

      const accessB = await env.db.query<{ has_access: boolean }>(
        `SELECT current_user_has_outlet_access('${env.outletBId}') as has_access`
      );
      expect(accessB.rows[0].has_access).toBe(true);
    });
  });
});
