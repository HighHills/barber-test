import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDbEnvironment, TestDbEnvironment } from './helpers/db-test-setup.js';

describe('Section 1: Refund RPC Comprehensive Verification (process_sale_refund)', () => {
  let env: TestDbEnvironment;

  beforeAll(async () => {
    env = await createTestDbEnvironment();
  });

  it('verifies full product refund with inventory restock and contra-revenue journal', async () => {
    await env.asUser(env.cashierAUserId);

    // 1. Checkout product sale: 2 Pomades @ 100k = 200k
    const saleRes = await env.db.query<{ process_pos_sale: { sale_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'REF-SALE-001',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"PRODUCT","product_id":"${env.retailPomadeId}","quantity":2,"unit_price":100000,"total_amount":200000}]'::jsonb,
        '[{"payment_method_id":"${env.cashMethodId}","amount":200000}]'::jsonb,
        0
      ) as process_pos_sale`
    );
    const saleId = saleRes.rows[0].process_pos_sale.sale_id;

    // Fetch sale item
    const itemRes = await env.db.query<{ id: string; cost_price: string }>(
      `SELECT id, cost_price FROM sale_items WHERE sale_id = '${saleId}'`
    );
    const saleItemId = itemRes.rows[0].id;
    const costPrice = parseFloat(itemRes.rows[0].cost_price);

    // Initial stock after sale = 50 - 2 = 48
    const stockAfterSale = await env.db.query<{ quantity: string }>(
      `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.retailPomadeId}'`
    );
    expect(parseFloat(stockAfterSale.rows[0].quantity)).toBe(48.0);

    // 2. Create Full Refund Header & Item
    const refRes = await env.db.query<{ id: string }>(
      `INSERT INTO sale_refunds (refund_number, sale_id, outlet_id, refund_type, subtotal, total_amount, reason, created_by)
       VALUES ('REF-NUM-001', '${saleId}', '${env.outletAId}', 'FULL', 200000, 200000, 'Defective packaging', '${env.cashierAProfileId}') RETURNING id`
    );
    const refundId = refRes.rows[0].id;

    await env.db.query(
      `INSERT INTO sale_refund_items (refund_id, sale_item_id, quantity, refund_amount, cost_price, return_to_inventory, reason)
       VALUES ('${refundId}', '${saleItemId}', 2.0, 200000, ${costPrice}, TRUE, 'Full item return')`
    );

    // 3. Execute process_sale_refund()
    console.log('--- Executing process_sale_refund (Full Product Refund) ---');
    const procRes = await env.db.query<{ process_sale_refund: { success: boolean; status: string; journal_id: string } }>(
      `SELECT process_sale_refund('${refundId}', '${env.cashierAProfileId}') as process_sale_refund`
    );
    console.log('Result:', procRes.rows[0].process_sale_refund);

    expect(procRes.rows[0].process_sale_refund.success).toBe(true);
    expect(procRes.rows[0].process_sale_refund.status).toBe('COMPLETED');
    const journalId = procRes.rows[0].process_sale_refund.journal_id;
    expect(journalId).toBeDefined();

    // 4. Verify inventory restock (48 + 2 = 50)
    const stockAfterRefund = await env.db.query<{ quantity: string }>(
      `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.retailPomadeId}'`
    );
    expect(parseFloat(stockAfterRefund.rows[0].quantity)).toBe(50.0);

    // Verify RETURN_IN movement
    const movRes = await env.db.query<{ movement_type: string; quantity: string }>(
      `SELECT movement_type, quantity FROM inventory_movements WHERE reference_type = 'REFUND' AND reference_id = '${refundId}'`
    );
    expect(movRes.rows.length).toBe(1);
    expect(movRes.rows[0].movement_type).toBe('RETURN_IN');
    expect(parseFloat(movRes.rows[0].quantity)).toBe(2.0);

    // 5. Verify contra-revenue double-entry journal
    const lines = await env.db.query<{ account_code: string; debit: string; credit: string }>(
      `SELECT fa.account_code, jl.debit, jl.credit
       FROM journal_lines jl
       JOIN financial_accounts fa ON fa.id = jl.financial_account_id
       WHERE jl.journal_entry_id = '${journalId}'`
    );

    let totDebit = 0;
    let totCredit = 0;
    for (const l of lines.rows) {
      totDebit += parseFloat(l.debit);
      totCredit += parseFloat(l.credit);
    }
    expect(totDebit).toBe(totCredit);

    // Contra-revenue debit (5600), Cash credit (1000), Inventory Asset debit (1300), COGS credit (5000)
    const contraLine = lines.rows.find((l) => l.account_code === '5600');
    expect(contraLine).toBeDefined();
    expect(parseFloat(contraLine!.debit)).toBe(200000);

    const cashLine = lines.rows.find((l) => l.account_code === '1000');
    expect(cashLine).toBeDefined();
    expect(parseFloat(cashLine!.credit)).toBe(200000);

    // 6. Verify audit log created (as Owner since audit_logs has strict RLS)
    await env.asUser(env.ownerUserId);
    const auditRes = await env.db.query<{ action: string; entity_id: string }>(
      `SELECT action, entity_id FROM audit_logs WHERE entity_type = 'sale_refunds' AND entity_id = '${refundId}'`
    );
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0].action).toBe('PROCESS_REFUND');
    await env.asUser(env.cashierAUserId);

    // 7. Verify original sale is intact and status updated to REFUNDED
    const saleCheck = await env.db.query<{ status: string; total_amount: string }>(
      `SELECT status, total_amount FROM sales WHERE id = '${saleId}'`
    );
    expect(saleCheck.rows[0].status).toBe('REFUNDED');
    expect(parseFloat(saleCheck.rows[0].total_amount)).toBe(200000); // Intact
  });

  it('verifies partial product refund with partial restock and no commission effect', async () => {
    await env.asUser(env.cashierAUserId);

    // 1. Sale of 4 Shampoos @ 80k = 320k
    const saleRes = await env.db.query<{ process_pos_sale: { sale_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'REF-SALE-002',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"PRODUCT","product_id":"${env.retailShampooId}","quantity":4,"unit_price":80000,"total_amount":320000}]'::jsonb,
        '[{"payment_method_id":"${env.cashMethodId}","amount":320000}]'::jsonb,
        0
      ) as process_pos_sale`
    );
    const saleId = saleRes.rows[0].process_pos_sale.sale_id;
    const saleItemId = (await env.db.query<{ id: string }>(`SELECT id FROM sale_items WHERE sale_id = '${saleId}'`)).rows[0].id;

    // Stock was 40 - 4 = 36
    // 2. Partial refund of 1 shampoo without restock (damaged/discarded, return_to_inventory = false)
    const refRes = await env.db.query<{ id: string }>(
      `INSERT INTO sale_refunds (refund_number, sale_id, outlet_id, refund_type, subtotal, total_amount, reason, created_by)
       VALUES ('REF-NUM-002', '${saleId}', '${env.outletAId}', 'PARTIAL', 80000, 80000, 'Customer dropped bottle', '${env.cashierAProfileId}') RETURNING id`
    );
    const refundId = refRes.rows[0].id;

    await env.db.query(
      `INSERT INTO sale_refund_items (refund_id, sale_item_id, quantity, refund_amount, cost_price, return_to_inventory, reason)
       VALUES ('${refundId}', '${saleItemId}', 1.0, 80000, 40000, FALSE, 'Damaged - do not restock')`
    );

    const procRes = await env.db.query<{ process_sale_refund: { success: boolean } }>(
      `SELECT process_sale_refund('${refundId}', '${env.cashierAProfileId}') as process_sale_refund`
    );
    expect(procRes.rows[0].process_sale_refund.success).toBe(true);

    // Stock should remain 36 (not restocked!)
    const stockAfter = await env.db.query<{ quantity: string }>(
      `SELECT quantity FROM outlet_inventory WHERE outlet_id = '${env.outletAId}' AND product_id = '${env.retailShampooId}'`
    );
    expect(parseFloat(stockAfter.rows[0].quantity)).toBe(36.0);

    // No inventory movement recorded because return_to_inventory was FALSE
    const movRes = await env.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM inventory_movements WHERE reference_type = 'REFUND' AND reference_id = '${refundId}'`
    );
    expect(parseInt(movRes.rows[0].count, 10)).toBe(0);
  });

  it('verifies service refund with barber commission reversal', async () => {
    await env.asUser(env.cashierAUserId);

    // 1. Sale: Classic Haircut (50k) with 20% barber commission (10k)
    const saleRes = await env.db.query<{ process_pos_sale: { sale_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'REF-SALE-003',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","barber_id":"${env.barberAEmployeeId}","quantity":1,"unit_price":50000,"total_amount":50000,"commission_type":"PERCENTAGE","commission_rate":20,"commission_amount":10000}]'::jsonb,
        '[{"payment_method_id":"${env.cashMethodId}","amount":50000}]'::jsonb,
        0
      ) as process_pos_sale`
    );
    const saleId = saleRes.rows[0].process_pos_sale.sale_id;
    const saleItemId = (await env.db.query<{ id: string }>(`SELECT id FROM sale_items WHERE sale_id = '${saleId}'`)).rows[0].id;

    // Verify commission is EARNED
    const commBefore = await env.db.query<{ status: string }>(
      `SELECT status FROM commissions WHERE sale_item_id = '${saleItemId}'`
    );
    expect(commBefore.rows[0].status).toBe('EARNED');

    // 2. Refund service
    const refRes = await env.db.query<{ id: string }>(
      `INSERT INTO sale_refunds (refund_number, sale_id, outlet_id, refund_type, subtotal, total_amount, reason, created_by)
       VALUES ('REF-NUM-003', '${saleId}', '${env.outletAId}', 'FULL', 50000, 50000, 'Customer unsatisfied with cut', '${env.cashierAProfileId}') RETURNING id`
    );
    const refundId = refRes.rows[0].id;

    await env.db.query(
      `INSERT INTO sale_refund_items (refund_id, sale_item_id, quantity, refund_amount, cost_price, return_to_inventory, reason)
       VALUES ('${refundId}', '${saleItemId}', 1.0, 50000, 0, FALSE, 'Service haircut refund')`
    );

    const procRes = await env.db.query<{ process_sale_refund: { success: boolean } }>(
      `SELECT process_sale_refund('${refundId}', '${env.cashierAProfileId}') as process_sale_refund`
    );
    expect(procRes.rows[0].process_sale_refund.success).toBe(true);

    // 3. Verify commission was VOIDED
    const commAfter = await env.db.query<{ status: string }>(
      `SELECT status FROM commissions WHERE sale_item_id = '${saleItemId}'`
    );
    expect(commAfter.rows[0].status).toBe('VOIDED');
  });

  it('verifies mixed refund containing both product and service', async () => {
    await env.asUser(env.cashierAUserId);

    // Sale: 1 Haircut (50k) + 1 Pomade (100k) = 150k
    const saleRes = await env.db.query<{ process_pos_sale: { sale_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'REF-SALE-004',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[
          {"item_type":"SERVICE","service_id":"${env.serviceCutId}","barber_id":"${env.barberAEmployeeId}","quantity":1,"unit_price":50000,"total_amount":50000,"commission_type":"PERCENTAGE","commission_rate":10,"commission_amount":5000},
          {"item_type":"PRODUCT","product_id":"${env.retailPomadeId}","quantity":1,"unit_price":100000,"total_amount":100000}
        ]'::jsonb,
        '[{"payment_method_id":"${env.cashMethodId}","amount":150000}]'::jsonb,
        0
      ) as process_pos_sale`
    );
    const saleId = saleRes.rows[0].process_pos_sale.sale_id;
    const items = (await env.db.query<{ id: string; item_type: string }>(`SELECT id, item_type FROM sale_items WHERE sale_id = '${saleId}'`)).rows;

    const srvItem = items.find((i) => i.item_type === 'SERVICE')!;
    const prdItem = items.find((i) => i.item_type === 'PRODUCT')!;

    // Refund both items
    const refRes = await env.db.query<{ id: string }>(
      `INSERT INTO sale_refunds (refund_number, sale_id, outlet_id, refund_type, subtotal, total_amount, reason, created_by)
       VALUES ('REF-NUM-004', '${saleId}', '${env.outletAId}', 'FULL', 150000, 150000, 'Full combo refund', '${env.cashierAProfileId}') RETURNING id`
    );
    const refundId = refRes.rows[0].id;

    await env.db.query(
      `INSERT INTO sale_refund_items (refund_id, sale_item_id, quantity, refund_amount, cost_price, return_to_inventory)
       VALUES
       ('${refundId}', '${srvItem.id}', 1.0, 50000, 0, FALSE),
       ('${refundId}', '${prdItem.id}', 1.0, 100000, 50000, TRUE)`
    );

    const procRes = await env.db.query<{ process_sale_refund: { success: boolean; journal_id: string } }>(
      `SELECT process_sale_refund('${refundId}', '${env.cashierAProfileId}') as process_sale_refund`
    );
    expect(procRes.rows[0].process_sale_refund.success).toBe(true);

    // Verify journal balance
    const jrnId = procRes.rows[0].process_sale_refund.journal_id;
    const lines = await env.db.query<{ debit: string; credit: string }>(
      `SELECT debit, credit FROM journal_lines WHERE journal_entry_id = '${jrnId}'`
    );
    let totD = 0;
    let totC = 0;
    lines.rows.forEach((l) => {
      totD += parseFloat(l.debit);
      totC += parseFloat(l.credit);
    });
    expect(totD).toBe(totC);
  });

  it('rejects duplicate execution of already completed refund and invalid refund ID', async () => {
    await env.asUser(env.cashierAUserId);

    // Non-existent refund
    await expect(
      env.db.query("SELECT process_sale_refund('99999999-9999-9999-9999-999999999999', '" + env.cashierAProfileId + "')")
    ).rejects.toThrow(/Refund .* not found/);

    // Re-executing already completed refund REF-NUM-001
    const existingRef = (await env.db.query<{ id: string }>("SELECT id FROM sale_refunds WHERE refund_number = 'REF-NUM-001'")).rows[0].id;
    const dupRes = await env.db.query<{ process_sale_refund: { success: boolean; message?: string } }>(
      `SELECT process_sale_refund('${existingRef}', '${env.cashierAProfileId}') as process_sale_refund`
    );
    expect(dupRes.rows[0].process_sale_refund.success).toBe(true);
    expect(dupRes.rows[0].process_sale_refund.message).toContain('already completed');
  });
});
