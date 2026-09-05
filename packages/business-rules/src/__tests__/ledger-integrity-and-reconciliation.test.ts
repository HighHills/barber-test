import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDbEnvironment, TestDbEnvironment } from './helpers/db-test-setup';

describe('Sections 10, 11 & 12: Journal Immutability, Inventory Ledger Integrity & Accounting Cross-Check', () => {
  let env: TestDbEnvironment;

  beforeEach(async () => {
    env = await createTestDbEnvironment();
  });

  describe('Section 10: Journal Entry & Line Immutability Verification', () => {
    it('allows editing DRAFT journal entries but strictly blocks modification or deletion once POSTED', async () => {
      // 1. Create a DRAFT journal
      const cashAcc = (await env.db.query<{ id: string }>("SELECT id FROM financial_accounts WHERE account_code = '1000'")).rows[0].id;
      const revAcc = (await env.db.query<{ id: string }>("SELECT id FROM financial_accounts WHERE account_code = '4000'")).rows[0].id;

      const draftRes = await env.db.query<{ id: string }>(
        `INSERT INTO journal_entries (journal_number, journal_date, description, status, created_by)
         VALUES ('JRN-DRAFT-001', CURRENT_DATE, 'Initial draft', 'DRAFT', '${env.ownerProfileId}') RETURNING id`
      );
      const journalId = draftRes.rows[0].id;

      const lineRes = await env.db.query<{ id: string }>(
        `INSERT INTO journal_lines (journal_entry_id, financial_account_id, debit, credit, description)
         VALUES ('${journalId}', '${cashAcc}', 10000, 0, 'Draft Debit') RETURNING id`
      );
      const lineId = lineRes.rows[0].id;

      // Updating DRAFT header is allowed
      await env.db.query(
        `UPDATE journal_entries SET description = 'Updated draft description' WHERE id = '${journalId}'`
      );
      const draftDesc = (await env.db.query<{ description: string }>(`SELECT description FROM journal_entries WHERE id = '${journalId}'`)).rows[0].description;
      expect(draftDesc).toBe('Updated draft description');

      // Updating DRAFT line is allowed
      await env.db.query(`UPDATE journal_lines SET debit = 15000 WHERE id = '${lineId}'`);
      const draftDebit = (await env.db.query<{ debit: string }>(`SELECT debit FROM journal_lines WHERE id = '${lineId}'`)).rows[0].debit;
      expect(parseFloat(draftDebit)).toBe(15000);

      // Add matching credit line
      await env.db.query(
        `INSERT INTO journal_lines (journal_entry_id, financial_account_id, debit, credit, description)
         VALUES ('${journalId}', '${revAcc}', 0, 15000, 'Draft Credit')`
      );

      // 2. Post the journal entry
      await env.db.query(
        `UPDATE journal_entries SET status = 'POSTED', posted_by = '${env.ownerProfileId}', posted_at = CURRENT_TIMESTAMP WHERE id = '${journalId}'`
      );

      // 3. Immutability check: Attempting UPDATE on POSTED journal header must fail
      await expect(
        env.db.query(`UPDATE journal_entries SET description = 'Illegal change' WHERE id = '${journalId}'`)
      ).rejects.toThrow(/immutable/i);

      // 4. Immutability check: Attempting DELETE on POSTED journal header must fail
      await expect(
        env.db.query(`DELETE FROM journal_entries WHERE id = '${journalId}'`)
      ).rejects.toThrow(/cannot be deleted/i);

      // 5. Immutability check: Attempting UPDATE on lines of POSTED journal must fail
      await expect(
        env.db.query(`UPDATE journal_lines SET debit = 99999 WHERE id = '${lineId}'`)
      ).rejects.toThrow(/POSTED journal entry cannot be updated or deleted/);

      // 6. Immutability check: Attempting DELETE on lines of POSTED journal must fail
      await expect(
        env.db.query(`DELETE FROM journal_lines WHERE id = '${lineId}'`)
      ).rejects.toThrow(/POSTED journal entry cannot be updated or deleted/);
    });
  });

  describe('Section 11: Inventory Ledger Integrity (Full 10-Step Lifecycle & MAC)', () => {
    it('executes full 10-step inventory sequence and verifies exact balance between outlet_inventory and inventory_movements', async () => {
      // Setup Product with Initial Stock in Outlet A (50 units @ 50,000)
      const initialStock = (
        await env.db.query<{ quantity: string; average_cost: string }>(
          `SELECT quantity, average_cost FROM outlet_inventory WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.retailPomadeId}'`
        )
      ).rows[0];
      expect(parseFloat(initialStock.quantity)).toBe(50.0);
      expect(parseFloat(initialStock.average_cost)).toBe(50000.0);

      // Initial opening movement
      await env.db.query(
        `INSERT INTO inventory_movements (outlet_id, product_id, movement_type, quantity, unit_cost, quantity_before, quantity_after, reference_type, reference_id, created_by)
         VALUES ('${env.outletAId}', '${env.retailPomadeId}', 'OPENING', 50, 50000, 0, 50, 'OPENING', gen_random_uuid(), '${env.ownerProfileId}')`
      );

      // Step 2: PURCHASE (Add 20 units @ 60,000)
      // New Qty = 70. New MAC = ((50*50000) + (20*60000)) / 70 = (2,500,000 + 1,200,000) / 70 = 3,700,000 / 70 = 52,857.14
      const poId = randomUUID();
      await env.db.query(
        `UPDATE outlet_inventory
         SET quantity = quantity + 20, average_cost = ROUND((50 * 50000 + 20 * 60000) / 70.0, 2)
         WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.retailPomadeId}'`
      );
      await env.db.query(
        `INSERT INTO inventory_movements (outlet_id, product_id, movement_type, quantity, unit_cost, quantity_before, quantity_after, reference_type, reference_id, created_by)
         VALUES ('${env.outletAId}', '${env.retailPomadeId}', 'PURCHASE', 20, 60000, 50, 70, 'PURCHASE', '${poId}', '${env.ownerProfileId}')`
      );

      // Step 3: SALE via POS (Sell 5 units)
      await env.asUser(env.cashierAUserId);
      const sale1Res = await env.db.query<{ process_pos_sale: { sale_id: string } }>(
        `SELECT process_pos_sale(
          '${env.outletAId}',
          'LEDGER-SALE-001',
          '${env.cashierAProfileId}',
          '${env.customerId}',
          NULL,
          '[{"item_type":"PRODUCT","product_id":"${env.retailPomadeId}","quantity":5,"unit_price":100000,"total_amount":500000}]'::jsonb,
          '[{"payment_method_id":"${env.cashMethodId}","amount":500000}]'::jsonb,
          0
        ) as process_pos_sale`
      );
      const sale1Id = sale1Res.rows[0].process_pos_sale.sale_id;
      // Qty now: 70 - 5 = 65

      // Step 4: SERVICE CONSUMPTION via POS (Sell service that consumes 2 units of pomade via service_consumptions)
      // Connect retailPomade to serviceCut with 2 units consumption
      await env.resetUser();
      await env.db.query(
        `INSERT INTO service_consumptions (service_id, product_id, quantity, is_active)
         VALUES ('${env.serviceCutId}', '${env.retailPomadeId}', 2.0, TRUE)
         ON CONFLICT (service_id, product_id) DO UPDATE SET quantity = 2.0`
      );

      await env.asUser(env.cashierAUserId);
      await env.db.query<{ process_pos_sale: { sale_id: string } }>(
        `SELECT process_pos_sale(
          '${env.outletAId}',
          'LEDGER-SALE-002',
          '${env.cashierAProfileId}',
          '${env.customerId}',
          NULL,
          '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","quantity":1,"unit_price":50000,"total_amount":50000}]'::jsonb,
          '[{"payment_method_id":"${env.cashMethodId}","amount":50000}]'::jsonb,
          0
        ) as process_pos_sale`
      );
      // Qty now: 65 - 2 = 63

      // Step 5 & 6: Inter-Outlet TRANSFER (Transfer 10 units from Outlet A to Outlet B)
      await env.asUser(env.ownerUserId);
      const trfRes = await env.db.query<{ id: string }>(
        `INSERT INTO stock_transfers (transfer_number, from_outlet_id, to_outlet_id, status, requested_by)
         VALUES ('TRF-LIFECYCLE-001', '${env.outletAId}', '${env.outletBId}', 'REQUESTED', '${env.ownerProfileId}') RETURNING id`
      );
      const trfId = trfRes.rows[0].id;
      await env.db.query(
        `INSERT INTO stock_transfer_items (transfer_id, product_id, quantity)
         VALUES ('${trfId}', '${env.retailPomadeId}', 10)`
      );
      // Process transfer RPC
      await env.db.query(`SELECT process_stock_transfer('${trfId}', '${env.ownerProfileId}')`);
      // Qty Outlet A: 63 - 10 = 53
      // Qty Outlet B: 0 + 10 = 10

      // Step 7: POSITIVE ADJUSTMENT (Stock Opname gain: +3 units in Outlet A)
      const adjGainRes = await env.db.query<{ id: string }>(
        `INSERT INTO stock_adjustments (adjustment_number, outlet_id, reason, status, created_by)
         VALUES ('ADJ-GAIN-001', '${env.outletAId}', 'Opname surplus', 'DRAFT', '${env.ownerProfileId}') RETURNING id`
      );
      const adjGainId = adjGainRes.rows[0].id;
      await env.db.query(
        `INSERT INTO stock_adjustment_items (adjustment_id, product_id, quantity_before, quantity_after, quantity_delta, unit_cost)
         VALUES ('${adjGainId}', '${env.retailPomadeId}', 53, 56, 3, 50000)`
      );
      await env.db.query(`SELECT process_stock_adjustment('${adjGainId}', '${env.ownerProfileId}')`);
      // Qty Outlet A: 53 + 3 = 56

      // Step 8: NEGATIVE ADJUSTMENT (Stock Opname loss/shrinkage: -1 unit in Outlet A)
      const adjLossRes = await env.db.query<{ id: string }>(
        `INSERT INTO stock_adjustments (adjustment_number, outlet_id, reason, status, created_by)
         VALUES ('ADJ-LOSS-001', '${env.outletAId}', 'Broken jar', 'DRAFT', '${env.ownerProfileId}') RETURNING id`
      );
      const adjLossId = adjLossRes.rows[0].id;
      await env.db.query(
        `INSERT INTO stock_adjustment_items (adjustment_id, product_id, quantity_before, quantity_after, quantity_delta, unit_cost)
         VALUES ('${adjLossId}', '${env.retailPomadeId}', 56, 55, -1, 50000)`
      );
      await env.db.query(`SELECT process_stock_adjustment('${adjLossId}', '${env.ownerProfileId}')`);
      // Qty Outlet A: 56 - 1 = 55

      // Step 9: RETURN_IN via Refund (Customer returns 2 units from sale 1)
      const sale1Item = (await env.db.query<{ id: string }>(`SELECT id FROM sale_items WHERE sale_id = '${sale1Id}'`)).rows[0].id;
      const refRes = await env.db.query<{ id: string }>(
        `INSERT INTO sale_refunds (refund_number, sale_id, outlet_id, refund_type, subtotal, total_amount, reason, created_by)
         VALUES ('REF-LIFECYCLE-001', '${sale1Id}', '${env.outletAId}', 'PARTIAL', 200000, 200000, 'Returned 2 units', '${env.ownerProfileId}') RETURNING id`
      );
      const refId = refRes.rows[0].id;
      await env.db.query(
        `INSERT INTO sale_refund_items (refund_id, sale_item_id, quantity, refund_amount, cost_price, return_to_inventory)
         VALUES ('${refId}', '${sale1Item}', 2, 200000, 50000, TRUE)`
      );
      await env.db.query(`SELECT process_sale_refund('${refId}', '${env.ownerProfileId}')`);
      // Qty Outlet A: 55 + 2 = 57

      // Step 10: RETURN_IN via Void Sale (Void a 1-unit sale)
      await env.asUser(env.cashierAUserId);
      const sale3Res = await env.db.query<{ process_pos_sale: { sale_id: string } }>(
        `SELECT process_pos_sale(
          '${env.outletAId}',
          'LEDGER-SALE-003',
          '${env.cashierAProfileId}',
          '${env.customerId}',
          NULL,
          '[{"item_type":"PRODUCT","product_id":"${env.retailPomadeId}","quantity":1,"unit_price":100000,"total_amount":100000}]'::jsonb,
          '[{"payment_method_id":"${env.cashMethodId}","amount":100000}]'::jsonb,
          0
        ) as process_pos_sale`
      );
      const sale3Id = sale3Res.rows[0].process_pos_sale.sale_id;
      // Qty Outlet A: 57 - 1 = 56
      // Void sale 3 -> restores 1 unit
      await env.asUser(env.ownerUserId);
      await env.db.query(`SELECT void_sale('${sale3Id}', '${env.ownerProfileId}', 'Cashier wrong ring')`);
      // Qty Outlet A: 56 + 1 = 57

      // RECONCILIATION:
      // 1. Verify outlet_inventory quantity matches exact lifecycle math (57 units)
      const currentStockA = (
        await env.db.query<{ quantity: string }>(
          `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.retailPomadeId}'`
        )
      ).rows[0].quantity;
      expect(parseFloat(currentStockA)).toBe(57.0);

      // 2. Verify SUM of inventory_movements equals outlet_inventory quantity
      // Movements are natively signed (positive for IN, negative for OUT):
      // Total = 50 (OPENING) + 20 (PURCHASE) - 5 (SALE) - 2 (CONSUMPTION) - 10 (TRANSFER_OUT) + 3 (ADJ_IN) - 1 (ADJ_OUT) + 2 (REFUND) - 1 (SALE) + 1 (VOID) = 57
      const sumMovementsA = (
        await env.db.query<{ total_qty: string }>(
          `SELECT SUM(quantity) as total_qty
           FROM inventory_movements
           WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.retailPomadeId}'`
        )
      ).rows[0].total_qty;

      expect(parseFloat(sumMovementsA)).toBe(57.0);
      expect(parseFloat(currentStockA)).toBe(parseFloat(sumMovementsA));

      // 3. Verify Outlet B stock reconciliation (Initial 30 + 10 transferred in = 40)
      const currentStockB = (
        await env.db.query<{ quantity: string }>(
          `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${env.outletBId}' AND product_id = '${env.retailPomadeId}'`
        )
      ).rows[0].quantity;
      expect(parseFloat(currentStockB)).toBe(40.0);

      const sumMovementsB = (
        await env.db.query<{ total_qty: string }>(
          `SELECT SUM(quantity) as total_qty
           FROM inventory_movements
           WHERE outlet_id = '${env.outletBId}' AND product_id = '${env.retailPomadeId}'`
        )
      ).rows[0].total_qty;
      expect(parseFloat(sumMovementsB)).toBe(10.0);

      // 4. Verify inventory_movements immutability triggers
      await env.resetUser();
      const movId = (await env.db.query<{ id: string }>('SELECT id FROM inventory_movements LIMIT 1')).rows[0].id;
      await expect(
        env.db.query(`UPDATE inventory_movements SET quantity = 999 WHERE id = '${movId}'`)
      ).rejects.toThrow(/Inventory movements are immutable/);

      await expect(
        env.db.query(`DELETE FROM inventory_movements WHERE id = '${movId}'`)
      ).rejects.toThrow(/Inventory movements are immutable/);
    });
  });

  describe('Section 12: Accounting Cross-Check & Ledger Balance Audit', () => {
    it('verifies that across ALL posted journal entries, Sum(Debit) equals Sum(Credit) with zero orphaned lines', async () => {
      // 1. Check all individual journal entries balance:
      const imbalancedEntries = await env.db.query<{
        id: string;
        journal_number: string;
        tot_debit: string;
        tot_credit: string;
      }>(`
        SELECT
          je.id,
          je.journal_number,
          COALESCE(SUM(jl.debit), 0.00) as tot_debit,
          COALESCE(SUM(jl.credit), 0.00) as tot_credit
        FROM journal_entries je
        LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
        WHERE je.status = 'POSTED'
        GROUP BY je.id, je.journal_number
        HAVING ABS(COALESCE(SUM(jl.debit), 0.00) - COALESCE(SUM(jl.credit), 0.00)) > 0.01;
      `);

      expect(imbalancedEntries.rows.length).toBe(0);

      // 2. Global Trial Balance: Total Debit across entire ledger == Total Credit
      const globalBalance = (
        await env.db.query<{ total_debit: string; total_credit: string }>(`
          SELECT
            COALESCE(SUM(jl.debit), 0.00) as total_debit,
            COALESCE(SUM(jl.credit), 0.00) as total_credit
          FROM journal_lines jl
          JOIN journal_entries je ON je.id = jl.journal_entry_id
          WHERE je.status = 'POSTED';
        `)
      ).rows[0];

      expect(parseFloat(globalBalance.total_debit)).toBe(parseFloat(globalBalance.total_credit));

      // 3. Zero orphaned journal lines check
      const orphanedLines = await env.db.query(`
        SELECT jl.id
        FROM journal_lines jl
        LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
        LEFT JOIN financial_accounts fa ON fa.id = jl.financial_account_id
        WHERE je.id IS NULL OR fa.id IS NULL;
      `);
      expect(orphanedLines.rows.length).toBe(0);
    });
  });
});
