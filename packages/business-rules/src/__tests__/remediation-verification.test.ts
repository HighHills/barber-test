import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDbEnvironment, TestDbEnvironment } from './helpers/db-test-setup.js';
import { randomUUID } from 'crypto';

describe('Phase 0.5 Remediation Verification Suite (16-Blocker Audit & Hardening)', () => {
  let env: TestDbEnvironment;

  beforeAll(async () => {
    env = await createTestDbEnvironment();
  });

  // ==========================================================================
  // BLOCKER 1: Authentication Requirement on Privileged RPCs
  // ==========================================================================
  describe('Blocker 1: Authentication Guard on Privileged RPCs', () => {
    it('strictly denies anonymous (unauthenticated) execution on all 6 privileged RPCs', async () => {
      await env.resetUser(); // auth.uid() is NULL

      const dummyUuid = randomUUID();

      // 1. process_pos_sale
      await expect(
        env.db.query(
          `SELECT process_pos_sale(
            '${env.outletAId}', 'ANON-KEY-1', '${env.cashierAProfileId}', '${env.customerId}', NULL,
            '[]'::jsonb, '[]'::jsonb, 0
          )`
        )
      ).rejects.toThrow(/Authentication required/);

      // 2. void_sale
      await expect(
        env.db.query(`SELECT void_sale('${dummyUuid}', '${env.cashierAProfileId}', 'Reason')`)
      ).rejects.toThrow(/Authentication required/);

      // 3. process_sale_refund
      await expect(
        env.db.query(`SELECT process_sale_refund('${dummyUuid}', '${env.cashierAProfileId}')`)
      ).rejects.toThrow(/Authentication required/);

      // 4. process_stock_adjustment
      await expect(
        env.db.query(`SELECT process_stock_adjustment('${dummyUuid}', '${env.cashierAProfileId}')`)
      ).rejects.toThrow(/Authentication required/);

      // 5. process_stock_transfer
      await expect(
        env.db.query(`SELECT process_stock_transfer('${dummyUuid}', '${env.cashierAProfileId}')`)
      ).rejects.toThrow(/Authentication required/);

      // 6. post_journal_entry
      await expect(
        env.db.query(`SELECT post_journal_entry('${dummyUuid}', '${env.cashierAProfileId}')`)
      ).rejects.toThrow(/Authentication required/);
    });
  });

  // ==========================================================================
  // BLOCKER 2 & 3: Role-Permission Mapping and Authorization Enforcement
  // ==========================================================================
  describe('Blockers 2 & 3: Granular RPC Permission & Profile Authorization', () => {
    it('prohibits Cashier from executing post_journal_entry (requires finance.post)', async () => {
      await env.asUser(env.cashierAUserId);

      const dummyJrnId = randomUUID();
      await expect(
        env.db.query(`SELECT post_journal_entry('${dummyJrnId}', '${env.cashierAProfileId}')`)
      ).rejects.toThrow(/User lacks permission finance\.post/);
    });

    it('prohibits Cashier at Outlet A from processing sales at Outlet B', async () => {
      await env.asUser(env.cashierAUserId);

      await expect(
        env.db.query(
          `SELECT process_pos_sale(
            '${env.outletBId}', 'POS-AUTH-CROSS', '${env.cashierAProfileId}', '${env.customerId}', NULL,
            '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","quantity":1,"unit_price":55000,"total_amount":55000}]'::jsonb,
            '[{"payment_method_id":"${env.cashMethodId}","amount":55000}]'::jsonb,
            0
          )`
        )
      ).rejects.toThrow(/Cashier .* does not have access to outlet/);
    });

    it('prohibits Caller from forging another cashier profile ID', async () => {
      await env.asUser(env.cashierAUserId);

      await expect(
        env.db.query(
          `SELECT process_pos_sale(
            '${env.outletAId}', 'POS-FORGED-PROFILE', '${env.managerAProfileId}', '${env.customerId}', NULL,
            '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","quantity":1,"unit_price":50000,"total_amount":50000}]'::jsonb,
            '[{"payment_method_id":"${env.cashMethodId}","amount":50000}]'::jsonb,
            0
          )`
        )
      ).rejects.toThrow(/Caller is not authorized for cashier profile/);
    });
  });

  // ==========================================================================
  // BLOCKER 4: Server-Authoritative POS Pricing & Calculations
  // ==========================================================================
  describe('Blocker 4: Server-Authoritative POS Pricing & Calculation Enforcement', () => {
    it('rejects sale when client sends manipulated unit_price or total that does not match server catalog', async () => {
      await env.asUser(env.cashierAUserId);

      await expect(
        env.db.query(
          `SELECT process_pos_sale(
            '${env.outletAId}', 'POS-PRICE-TAMPER-1', '${env.cashierAProfileId}', '${env.customerId}', NULL,
            '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","quantity":1,"unit_price":100,"total_amount":100}]'::jsonb,
            '[{"payment_method_id":"${env.cashMethodId}","amount":100}]'::jsonb,
            0
          )`
        )
      ).rejects.toThrow(/Payment Sum \(100\.00\) does not match/);
    });

    it('calculates total from catalog prices authoritatively and ignores client calculation bugs', async () => {
      await env.asUser(env.cashierAUserId);

      const res = await env.db.query<{ process_pos_sale: { success: boolean; total_amount: string } }>(
        `SELECT process_pos_sale(
          '${env.outletAId}', 'POS-AUTH-PRICE-OK', '${env.cashierAProfileId}', '${env.customerId}', NULL,
          '[
            {"item_type":"SERVICE","service_id":"${env.serviceCutId}","quantity":1},
            {"item_type":"PRODUCT","product_id":"${env.retailPomadeId}","quantity":1}
          ]'::jsonb,
          '[{"payment_method_id":"${env.cashMethodId}","amount":150000}]'::jsonb,
          0
        ) as process_pos_sale`
      );

      expect(res.rows[0].process_pos_sale.success).toBe(true);
      expect(parseFloat(res.rows[0].process_pos_sale.total_amount)).toBe(150000);
    });
  });

  // ==========================================================================
  // BLOCKER 5: Server-Authoritative 8-Tier Commission Resolution
  // ==========================================================================
  describe('Blocker 5: Server-Authoritative 8-Tier Commission Hierarchy', () => {
    it('authoritatively overrides client commission rate using the highest-priority rule (Tier 1)', async () => {
      await env.asUser(env.ownerUserId);
      await env.db.query(
        `INSERT INTO commission_rules (
          employee_id, service_id, outlet_id, commission_type, commission_rate, priority, effective_from, is_active
        ) VALUES (
          '${env.barberAEmployeeId}', '${env.serviceCutId}', '${env.outletAId}',
          'PERCENTAGE', 35.00, 1, '2026-01-01', TRUE
        )`
      );

      await env.asUser(env.cashierAUserId);
      const res = await env.db.query<{ process_pos_sale: { sale_id: string } }>(
        `SELECT process_pos_sale(
          '${env.outletAId}', 'POS-COMM-TIER1', '${env.cashierAProfileId}', '${env.customerId}', NULL,
          '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","barber_id":"${env.barberAEmployeeId}","quantity":1,"commission_rate":10.00,"commission_amount":5000}]'::jsonb,
          '[{"payment_method_id":"${env.cashMethodId}","amount":50000}]'::jsonb,
          0
        ) as process_pos_sale`
      );

      const saleId = res.rows[0].process_pos_sale.sale_id;

      const comm = (
        await env.db.query<{ commission_rate: string; commission_amount: string }>(
          `SELECT commission_rate, commission_amount FROM commissions WHERE sale_id = '${saleId}'`
        )
      ).rows[0];

      expect(parseFloat(comm.commission_rate)).toBe(35.00);
      expect(parseFloat(comm.commission_amount)).toBe(17500.00);

      await env.asUser(env.ownerUserId);
      await env.db.query(`DELETE FROM commission_rules WHERE employee_id = '${env.barberAEmployeeId}'`);
    });
  });

  // ==========================================================================
  // BLOCKER 6: Fail-Closed Service Consumables Validation
  // ==========================================================================
  describe('Blocker 6: Fail-Closed Service Consumables Validation', () => {
    it('rolls back atomic POS transaction immediately if consumable material stock is insufficient', async () => {
      await env.asUser(env.ownerUserId);

      await env.db.query(
        `UPDATE outlet_inventory SET quantity = 0 WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.consumableProductId}'`
      );

      await env.asUser(env.cashierAUserId);
      await expect(
        env.db.query(
          `SELECT process_pos_sale(
            '${env.outletAId}', 'POS-CONSUMABLE-SHORTAGE', '${env.cashierAProfileId}', '${env.customerId}', NULL,
            '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","quantity":1}]'::jsonb,
            '[{"payment_method_id":"${env.cashMethodId}","amount":50000}]'::jsonb,
            0
          )`
        )
      ).rejects.toThrow(/Insufficient stock for service consumable material/);

      const check = await env.db.query<{ count: string }>(
        `SELECT COUNT(*) FROM sales WHERE idempotency_key = 'POS-CONSUMABLE-SHORTAGE'`
      );
      expect(parseInt(check.rows[0].count)).toBe(0);

      await env.asUser(env.ownerUserId);
      await env.db.query(
        `UPDATE outlet_inventory SET quantity = 100 WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.consumableProductId}'`
      );
    });
  });

  // ==========================================================================
  // BLOCKER 7: Cash Session Register Outlet Matching
  // ==========================================================================
  describe('Blocker 7: Cash Session Register Outlet Isolation', () => {
    it('strictly prevents using a cash session from Outlet B for a sale at Outlet A', async () => {
      await env.asUser(env.ownerUserId);

      const regB = (
        await env.db.query<{ id: string }>(
          `INSERT INTO cash_registers (outlet_id, name) VALUES ('${env.outletBId}', 'Front Desk Reg B') RETURNING id`
        )
      ).rows[0].id;

      const sessB = (
        await env.db.query<{ id: string }>(
          `INSERT INTO cash_sessions (cash_register_id, opened_by, opening_balance, status)
           VALUES ('${regB}', '${env.ownerProfileId}', 100000, 'OPEN') RETURNING id`
        )
      ).rows[0].id;

      await env.asUser(env.cashierAUserId);
      await expect(
        env.db.query(
          `SELECT process_pos_sale(
            '${env.outletAId}', 'POS-CROSS-SESSION', '${env.cashierAProfileId}', '${env.customerId}', '${sessB}',
            '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","quantity":1}]'::jsonb,
            '[{"payment_method_id":"${env.cashMethodId}","amount":50000}]'::jsonb,
            0
          )`
        )
      ).rejects.toThrow(/belongs to outlet .* and cannot be used for outlet/);
    });
  });

  // ==========================================================================
  // BLOCKER 8 & 9: Central Posting Gate & Journal Immutability
  // ==========================================================================
  describe('Blockers 8 & 9: Central Posting Gate & Strict Journal Immutability', () => {
    it('central posting gate enforces at least 2 lines and exact Debit = Credit balance', async () => {
      await env.asUser(env.ownerUserId);

      const jrnId = randomUUID();
      await env.db.query(
        `INSERT INTO journal_entries (id, journal_number, journal_date, reference_type, description, status, created_by)
         VALUES ('${jrnId}', 'JRN-GATE-TEST-1', CURRENT_DATE, 'MANUAL', 'Unbalanced test', 'DRAFT', '${env.ownerProfileId}')`
      );

      await env.db.query(
        `INSERT INTO journal_lines (journal_entry_id, financial_account_id, debit, credit)
         VALUES ('${jrnId}', (SELECT id FROM financial_accounts WHERE account_code = '1000' LIMIT 1), 10000, 0)`
      );

      await expect(
        env.db.query(`SELECT post_journal_entry('${jrnId}', '${env.ownerProfileId}')`)
      ).rejects.toThrow(/must have at least 2 lines/);

      await env.db.query(
        `INSERT INTO journal_lines (journal_entry_id, financial_account_id, debit, credit)
         VALUES ('${jrnId}', (SELECT id FROM financial_accounts WHERE account_code = '4000' LIMIT 1), 0, 5000)`
      );

      await expect(
        env.db.query(`SELECT post_journal_entry('${jrnId}', '${env.ownerProfileId}')`)
      ).rejects.toThrow(/Total Debit .* != Total Credit/);

      await env.db.query(
        `UPDATE journal_lines SET credit = 10000 WHERE journal_entry_id = '${jrnId}' AND credit = 5000`
      );

      const postRes = await env.db.query<{ post_journal_entry: { success: boolean; status: string } }>(
        `SELECT post_journal_entry('${jrnId}', '${env.ownerProfileId}') as post_journal_entry`
      );
      expect(postRes.rows[0].post_journal_entry.success).toBe(true);
      expect(postRes.rows[0].post_journal_entry.status).toBe('POSTED');
    });

    it('strictly prevents modifying description, date, or lines on a POSTED journal', async () => {
      await env.asUser(env.ownerUserId);

      const jrn = (
        await env.db.query<{ id: string }>(
          `SELECT id FROM journal_entries WHERE status = 'POSTED' LIMIT 1`
        )
      ).rows[0];

      await expect(
        env.db.query(`UPDATE journal_entries SET description = 'Tampered description' WHERE id = '${jrn.id}'`)
      ).rejects.toThrow(/Posted journal entries are immutable/);

      await expect(
        env.db.query(`DELETE FROM journal_lines WHERE journal_entry_id = '${jrn.id}'`)
      ).rejects.toThrow(/POSTED journal entry cannot be updated or deleted/);
    });
  });

  // ==========================================================================
  // BLOCKERS 10, 11 & 12: Refund Payments, Partial Refund & Proportional Commission
  // ==========================================================================
  describe('Blockers 10, 11 & 12: Refund Payments Allocation, Partial Status & Proportional Commission', () => {
    it('executes partial refund: marks PARTIALLY_REFUNDED, allocates refund payments, and reverses commission proportionally', async () => {
      await env.asUser(env.cashierAUserId);
      const saleRes = await env.db.query<{ process_pos_sale: { sale_id: string } }>(
        `SELECT process_pos_sale(
          '${env.outletAId}', 'POS-REFUND-PARTIAL-1', '${env.cashierAProfileId}', '${env.customerId}', NULL,
          '[
            {
              "item_type":"PRODUCT",
              "product_id":"${env.retailPomadeId}",
              "barber_id":"${env.barberAEmployeeId}",
              "quantity":2,
              "commission_type":"PERCENTAGE",
              "commission_rate":20.00,
              "commission_amount":40000.00
            }
          ]'::jsonb,
          '[{"payment_method_id":"${env.cashMethodId}","amount":200000}]'::jsonb,
          0
        ) as process_pos_sale`
      );
      const saleId = saleRes.rows[0].process_pos_sale.sale_id;

      const saleItem = (
        await env.db.query<{ id: string }>(`SELECT id FROM sale_items WHERE sale_id = '${saleId}'`)
      ).rows[0].id;

      await env.asUser(env.ownerUserId);
      const refRes = await env.db.query<{ id: string }>(
        `INSERT INTO sale_refunds (refund_number, sale_id, outlet_id, refund_type, subtotal, total_amount, reason, created_by)
         VALUES ('REF-PARTIAL-001', '${saleId}', '${env.outletAId}', 'PARTIAL', 100000, 100000, 'Customer returned 1 jar', '${env.ownerProfileId}')
         RETURNING id`
      );
      const refundId = refRes.rows[0].id;

      await env.db.query(
        `INSERT INTO sale_refund_items (refund_id, sale_item_id, quantity, refund_amount, cost_price, return_to_inventory)
         VALUES ('${refundId}', '${saleItem}', 1, 100000, 50000, TRUE)`
      );

      const procRef = await env.db.query<{ process_sale_refund: { success: boolean; sale_status: string } }>(
        `SELECT process_sale_refund('${refundId}', '${env.ownerProfileId}') as process_sale_refund`
      );

      expect(procRef.rows[0].process_sale_refund.success).toBe(true);
      expect(procRef.rows[0].process_sale_refund.sale_status).toBe('PARTIALLY_REFUNDED');

      const refPayments = await env.db.query<{ amount: string }>(
        `SELECT amount FROM sale_refund_payments WHERE refund_id = '${refundId}'`
      );
      expect(refPayments.rows.length).toBe(1);
      expect(parseFloat(refPayments.rows[0].amount)).toBe(100000);

      const commCheck = await env.db.query<{ commission_amount: string; status: string }>(
        `SELECT commission_amount, status FROM commissions WHERE sale_id = '${saleId}'`
      );
      expect(commCheck.rows.length).toBe(1);
      expect(parseFloat(commCheck.rows[0].commission_amount)).toBe(20000);
      expect(commCheck.rows[0].status).toBe('EARNED');
    });
  });

  // ==========================================================================
  // BLOCKERS 13 & 16: Public Booking RPC & Business Settings View
  // ==========================================================================
  describe('Blockers 13 & 16: Safe Public Booking & Business Settings View', () => {
    it('allows anonymous guests to execute create_public_booking but blocks direct table mutations', async () => {
      await env.db.exec(`SET ROLE anon; RESET "request.jwt.claim.sub";`);

      // 1. Direct table SELECT is denied at table privilege level (permission denied)
      await expect(
        env.db.query('SELECT COUNT(*) FROM appointments')
      ).rejects.toThrow(/permission denied for table appointments/i);

      // 2. Direct table INSERT is denied at table privilege level (permission denied)
      await expect(
        env.db.query(
          `INSERT INTO appointments (appointment_number, outlet_id, customer_id, barber_id, service_id, start_at, end_at)
           VALUES ('APT-DIRECT', '${env.outletAId}', '${env.customerId}', '${env.barberAEmployeeId}', '${env.serviceCutId}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 min')`
        )
      ).rejects.toThrow(/permission denied for table appointments/i);

      // 3. Authorized public booking RPC succeeds seamlessly
      const bookingStart = new Date(Date.now() + 86400000).toISOString();
      const res = await env.db.query<{ create_public_booking: { success: boolean; appointment_id: string } }>(
        `SELECT create_public_booking(
          '${env.outletAId}',
          '${env.serviceCutId}',
          '${env.barberAEmployeeId}',
          'Guest John',
          '08999999999',
          '${bookingStart}',
          'First time guest'
        ) as create_public_booking`
      );

      expect(res.rows[0].create_public_booking.success).toBe(true);
      expect(res.rows[0].create_public_booking.appointment_id).toBeDefined();

      await env.resetUser();
    });

    it('allows anonymous guests to view public business settings via get_public_business_settings()', async () => {
      await env.db.exec(`SET ROLE anon; RESET "request.jwt.claim.sub";`);

      const res = await env.db.query<{ get_public_business_settings: any }>(
        `SELECT get_public_business_settings() as get_public_business_settings`
      );

      const settings = res.rows[0].get_public_business_settings;
      expect(settings.business_name).toBe('Gentlemen Barber Operating System');
      expect(settings.currency).toBe('IDR');
      expect(settings.timezone).toBe('Asia/Jakarta');

      await env.resetUser();
    });
  });

  // ==========================================================================
  // BLOCKERS 14 & 15: Explicit WITH CHECK Mutation Guards on Outlet Scopes
  // ==========================================================================
  describe('Blockers 14 & 15: Cross-Outlet WITH CHECK Mutation Protection', () => {
    it('strictly prevents Cashier A from updating or inserting into Outlet B scope', async () => {
      await env.asUser(env.cashierAUserId);

      await expect(
        env.db.query(
          `INSERT INTO appointments (appointment_number, outlet_id, customer_id, barber_id, service_id, start_at, end_at)
           VALUES ('APT-CROSS', '${env.outletBId}', '${env.customerId}', '${env.barberBEmployeeId}', '${env.serviceCutId}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 min')`
        )
      ).rejects.toThrow();

      await env.resetUser();
    });
  });

  // ==========================================================================
  // SECTION 20: AUDIT TESTS A THROUGH F (EXPLICIT CATALOG & INTEGRITY CHECKS)
  // ==========================================================================
  describe('Section 20 Verification: Tests A through F', () => {
    // TEST A: Anonymous table privileges
    it('Test A: strictly denies anonymous role direct table queries on core operational tables', async () => {
      await env.db.exec(`SET ROLE anon; RESET "request.jwt.claim.sub";`);

      await expect(env.db.query('SELECT * FROM appointments LIMIT 1'))
        .rejects.toThrow(/permission denied for table appointments/i);

      await expect(env.db.query('SELECT * FROM sales LIMIT 1'))
        .rejects.toThrow(/permission denied for table sales/i);

      await expect(env.db.query('SELECT * FROM journal_entries LIMIT 1'))
        .rejects.toThrow(/permission denied for table journal_entries/i);

      await expect(env.db.query('SELECT * FROM inventory_movements LIMIT 1'))
        .rejects.toThrow(/permission denied for table inventory_movements/i);

      await env.resetUser();
    });

    // TEST B: Privileged RPC anonymous execution guards
    it('Test B: strictly rejects anonymous callers across all 6 privileged transactional RPCs', async () => {
      await env.resetUser(); // Unauthenticated: auth.uid() is NULL

      const dummyId = randomUUID();

      await expect(
        env.db.query(`SELECT process_pos_sale('${env.outletAId}', 'ANON-B-1', '${env.cashierAProfileId}', '${env.customerId}', NULL, '[]'::jsonb, '[]'::jsonb, 0)`)
      ).rejects.toThrow(/Authentication required/);

      await expect(
        env.db.query(`SELECT void_sale('${dummyId}', '${env.cashierAProfileId}', 'Reason')`)
      ).rejects.toThrow(/Authentication required/);

      await expect(
        env.db.query(`SELECT process_sale_refund('${dummyId}', '${env.cashierAProfileId}')`)
      ).rejects.toThrow(/Authentication required/);

      await expect(
        env.db.query(`SELECT process_stock_adjustment('${dummyId}', '${env.cashierAProfileId}')`)
      ).rejects.toThrow(/Authentication required/);

      await expect(
        env.db.query(`SELECT process_stock_transfer('${dummyId}', '${env.cashierAProfileId}')`)
      ).rejects.toThrow(/Authentication required/);

      await expect(
        env.db.query(`SELECT post_journal_entry('${dummyId}', '${env.cashierAProfileId}')`)
      ).rejects.toThrow(/Authentication required/);
    });

    // TEST C: Role-Permission Matrix Verification
    it('Test C: strictly enforces the role and permission matrix across all 7 operational roles', async () => {
      // 1. CASHIER: Has pos.sale.create at Outlet A; Denied at Outlet B; Denied finance.post & user.manage
      await env.asUser(env.cashierAUserId);
      const cashierPosA = await env.db.query<{ allowed: boolean }>(`SELECT current_user_has_permission('pos.sale.create', '${env.outletAId}') as allowed`);
      expect(cashierPosA.rows[0].allowed).toBe(true);
      const cashierPosB = await env.db.query<{ allowed: boolean }>(`SELECT current_user_has_permission('pos.sale.create', '${env.outletBId}') as allowed`);
      expect(cashierPosB.rows[0].allowed).toBe(false);
      const cashierFin = await env.db.query<{ allowed: boolean }>(`SELECT current_user_has_permission('finance.post', '${env.outletAId}') as allowed`);
      expect(cashierFin.rows[0].allowed).toBe(false);
      const cashierUser = await env.db.query<{ allowed: boolean }>(`SELECT current_user_has_permission('user.manage', '${env.outletAId}') as allowed`);
      expect(cashierUser.rows[0].allowed).toBe(false);

      // 2. BARBER: Has booking.view & commission.view; Denied inventory.adjust & pos.sale.create
      await env.asUser(env.barberAUserId);
      const barberBook = await env.db.query<{ allowed: boolean }>(`SELECT current_user_has_permission('booking.view', '${env.outletAId}') as allowed`);
      expect(barberBook.rows[0].allowed).toBe(true);
      const barberInv = await env.db.query<{ allowed: boolean }>(`SELECT current_user_has_permission('inventory.adjust', '${env.outletAId}') as allowed`);
      expect(barberInv.rows[0].allowed).toBe(false);
      const barberPos = await env.db.query<{ allowed: boolean }>(`SELECT current_user_has_permission('pos.sale.create', '${env.outletAId}') as allowed`);
      expect(barberPos.rows[0].allowed).toBe(false);

      // 3. INVENTORY: Has inventory.adjust & inventory.transfer; Denied pos.sale.create
      await env.asUser(env.inventoryAUserId);
      const invAdjust = await env.db.query<{ allowed: boolean }>(`SELECT current_user_has_permission('inventory.adjust', '${env.outletAId}') as allowed`);
      expect(invAdjust.rows[0].allowed).toBe(true);
      const invPos = await env.db.query<{ allowed: boolean }>(`SELECT current_user_has_permission('pos.sale.create', '${env.outletAId}') as allowed`);
      expect(invPos.rows[0].allowed).toBe(false);

      // 4. ACCOUNTING: Has finance.post & finance.view; Denied catalog.manage
      await env.asUser(env.accountingUserId);
      const accPost = await env.db.query<{ allowed: boolean }>("SELECT current_user_has_permission('finance.post') as allowed");
      expect(accPost.rows[0].allowed).toBe(true);
      const accCat = await env.db.query<{ allowed: boolean }>("SELECT current_user_has_permission('catalog.manage') as allowed");
      expect(accCat.rows[0].allowed).toBe(false);

      // 5. MANAGER: Has outlet access to own outlet; Denied access to other outlets
      await env.asUser(env.managerAUserId);
      const mgrAOutA = await env.db.query<{ allowed: boolean }>(`SELECT current_user_has_outlet_access('${env.outletAId}') as allowed`);
      expect(mgrAOutA.rows[0].allowed).toBe(true);
      const mgrAOutB = await env.db.query<{ allowed: boolean }>(`SELECT current_user_has_outlet_access('${env.outletBId}') as allowed`);
      expect(mgrAOutB.rows[0].allowed).toBe(false);

      // 6. OWNER / ADMIN: Has global access across all outlets
      await env.asUser(env.ownerUserId);
      const ownerOutA = await env.db.query<{ allowed: boolean }>(`SELECT current_user_has_outlet_access('${env.outletAId}') as allowed`);
      expect(ownerOutA.rows[0].allowed).toBe(true);
      const ownerOutB = await env.db.query<{ allowed: boolean }>(`SELECT current_user_has_outlet_access('${env.outletBId}') as allowed`);
      expect(ownerOutB.rows[0].allowed).toBe(true);

      await env.resetUser();
    });

    // TEST D: Cross-outlet mutation and outlet_id hijacking denial via WITH CHECK
    it('Test D: strictly blocks cross-outlet mutation and outlet_id hijacking via RLS WITH CHECK', async () => {
      // Cashier A creates a valid appointment in Outlet A
      await env.asUser(env.cashierAUserId);

      const aptRes = await env.db.query<{ id: string }>(
        `INSERT INTO appointments (appointment_number, outlet_id, customer_id, barber_id, service_id, start_at, end_at)
         VALUES ('APT-TEST-D1', '${env.outletAId}', '${env.customerId}', '${env.barberAEmployeeId}', '${env.serviceCutId}', CURRENT_TIMESTAMP + INTERVAL '2 hour', CURRENT_TIMESTAMP + INTERVAL '2 hour 30 min')
         RETURNING id`
      );
      const aptId = aptRes.rows[0].id;

      // Attempt to mutate outlet_id to Outlet B (which Cashier A has no access to)
      await expect(
        env.db.query(`UPDATE appointments SET outlet_id = '${env.outletBId}' WHERE id = '${aptId}'`)
      ).rejects.toThrow();

      await env.resetUser();
    });

    // TEST E: Programmatic SECURITY DEFINER search_path Audit
    it('Test E: verifies all public SECURITY DEFINER routines strictly lock search_path to "public, pg_temp"', async () => {
      const secDefRes = await env.db.query<{ proname: string; proconfig: string[] | null }>(`
        SELECT p.proname, p.proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prosecdef = TRUE AND n.nspname = 'public';
      `);

      expect(secDefRes.rows.length).toBeGreaterThan(0);

      for (const row of secDefRes.rows) {
        expect(row.proconfig).toBeDefined();
        expect(row.proconfig).not.toBeNull();
        const hasSearchPath = row.proconfig!.some((cfg) => cfg.includes('search_path=public, pg_temp'));
        expect(
          hasSearchPath,
          `Function ${row.proname} is SECURITY DEFINER but lacks explicit search_path=public, pg_temp`
        ).toBe(true);
      }
    });

    // TEST F: Comprehensive Least Privilege Verification (Static Source Scan + Database Catalog Inspection)
    it('Test F: verifies that anon has 0 table grants via static source audit AND live database inspection', async () => {
      // Part A: Static Source Code Scan on Migration 13 and Export
      const fs = await import('fs');
      const path = await import('path');

      const mig13Path = path.resolve(__dirname, '../../../../supabase/migrations/20260904000013_security_transaction_hardening.sql');
      const mig13Sql = fs.readFileSync(mig13Path, 'utf8');

      // 1. Assert NO table CRUD grant to anon exists in source SQL
      const forbiddenGrantPattern = /GRANT\s+(ALL|SELECT|INSERT|UPDATE|DELETE)(\s*,\s*(SELECT|INSERT|UPDATE|DELETE))*\s+ON\s+.*TO\s+([^;]*\b)?anon\b/i;
      expect(forbiddenGrantPattern.test(mig13Sql), 'Static scan failed: Migration 13 contains a table grant to anon').toBe(false);

      // 2. Assert explicit defense-in-depth REVOKE exists in source SQL
      expect(
        /REVOKE\s+ALL\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM\s+anon;/i.test(mig13Sql),
        'Static scan failed: Migration 13 must include explicit REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon'
      ).toBe(true);

      // Part B: Database Catalog Inspection via information_schema.role_table_grants
      const grantsRes = await env.db.query<{ count: string }>(`
        SELECT count(*) as count
        FROM information_schema.role_table_grants
        WHERE grantee = 'anon' AND table_schema = 'public';
      `);

      expect(parseInt(grantsRes.rows[0].count)).toBe(0);
    });
  });
});
