import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDbEnvironment, TestDbEnvironment } from './helpers/db-test-setup.js';

describe('Section 2 & 12: POS Accounting 12-Scenario Matrix (process_pos_sale)', () => {
  let env: TestDbEnvironment;

  beforeAll(async () => {
    env = await createTestDbEnvironment();
    await env.asUser(env.cashierAUserId);
  });

  // Helper to assert double-entry balance and fetch lines
  async function assertJournalBalanced(journalId: string) {
    const lines = await env.db.query<{
      account_code: string;
      account_name: string;
      debit: string;
      credit: string;
    }>(
      `SELECT fa.account_code, fa.account_name, jl.debit, jl.credit
       FROM journal_lines jl
       JOIN financial_accounts fa ON fa.id = jl.financial_account_id
       WHERE jl.journal_entry_id = '${journalId}'`
    );

    expect(lines.rows.length).toBeGreaterThanOrEqual(2);

    let sumDebit = 0;
    let sumCredit = 0;
    for (const line of lines.rows) {
      const d = parseFloat(line.debit);
      const c = parseFloat(line.credit);
      expect((d > 0 && c === 0) || (d === 0 && c > 0)).toBe(true); // XOR
      sumDebit += d;
      sumCredit += c;
    }

    expect(sumDebit).toBe(sumCredit);
    return lines.rows;
  }

  // 1. Service-only sale
  it('Scenario 1: Service-only sale records Service Revenue (4000) and Cash (1000)', async () => {
    const res = await env.db.query<{ process_pos_sale: { success: boolean; journal_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'SCENARIO-01',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"SERVICE","service_id":"${env.serviceColorId}","quantity":1,"unit_price":150000,"total_amount":150000}]'::jsonb,
        '[{"payment_method_id":"${env.cashMethodId}","amount":150000}]'::jsonb,
        0
      ) as process_pos_sale`
    );

    const jId = res.rows[0].process_pos_sale.journal_id;
    const lines = await assertJournalBalanced(jId);

    const cashLine = lines.find((l) => l.account_code === '1000')!;
    const srvLine = lines.find((l) => l.account_code === '4000')!;

    expect(parseFloat(cashLine.debit)).toBe(150000);
    expect(parseFloat(srvLine.credit)).toBe(150000);
  });

  // 2. Product-only sale
  it('Scenario 2: Product-only sale records Product Revenue (4100), Cash, and COGS (5000) / Inventory (1300)', async () => {
    const res = await env.db.query<{ process_pos_sale: { success: boolean; journal_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'SCENARIO-02',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"PRODUCT","product_id":"${env.retailPomadeId}","quantity":1,"unit_price":100000,"total_amount":100000}]'::jsonb,
        '[{"payment_method_id":"${env.cashMethodId}","amount":100000}]'::jsonb,
        0
      ) as process_pos_sale`
    );

    const jId = res.rows[0].process_pos_sale.journal_id;
    const lines = await assertJournalBalanced(jId);

    const prodRevLine = lines.find((l) => l.account_code === '4100')!;
    const cogsLine = lines.find((l) => l.account_code === '5000')!;
    const invLine = lines.find((l) => l.account_code === '1300')!;

    expect(parseFloat(prodRevLine.credit)).toBe(100000);
    expect(parseFloat(cogsLine.debit)).toBe(50000); // 1 pomade @ 50k cost
    expect(parseFloat(invLine.credit)).toBe(50000);
  });

  // 3. Mixed service + product sale
  it('Scenario 3: Mixed sale balances both Service Revenue and Product Revenue', async () => {
    const res = await env.db.query<{ process_pos_sale: { success: boolean; journal_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'SCENARIO-03',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[
          {"item_type":"SERVICE","service_id":"${env.serviceColorId}","quantity":1,"unit_price":150000,"total_amount":150000},
          {"item_type":"PRODUCT","product_id":"${env.retailPomadeId}","quantity":1,"unit_price":100000,"total_amount":100000}
        ]'::jsonb,
        '[{"payment_method_id":"${env.cashMethodId}","amount":250000}]'::jsonb,
        0
      ) as process_pos_sale`
    );

    const jId = res.rows[0].process_pos_sale.journal_id;
    const lines = await assertJournalBalanced(jId);

    const srvLine = lines.find((l) => l.account_code === '4000')!;
    const prdLine = lines.find((l) => l.account_code === '4100')!;
    expect(parseFloat(srvLine.credit)).toBe(150000);
    expect(parseFloat(prdLine.credit)).toBe(100000);
  });

  // 4. Cash payment
  it('Scenario 4: Cash payment correctly debits Cash on Hand (1000)', async () => {
    const res = await env.db.query<{ process_pos_sale: { success: boolean; journal_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'SCENARIO-04',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","quantity":1,"unit_price":50000,"total_amount":50000}]'::jsonb,
        '[{"payment_method_id":"${env.cashMethodId}","amount":50000}]'::jsonb,
        0
      ) as process_pos_sale`
    );

    const lines = await assertJournalBalanced(res.rows[0].process_pos_sale.journal_id);
    const cashLine = lines.find((l) => l.account_code === '1000')!;
    expect(parseFloat(cashLine.debit)).toBe(50000);
  });

  // 5. Bank transfer payment
  it('Scenario 5: Bank transfer payment correctly debits Bank Account (1100)', async () => {
    const res = await env.db.query<{ process_pos_sale: { success: boolean; journal_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'SCENARIO-05',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","quantity":1,"unit_price":50000,"total_amount":50000}]'::jsonb,
        '[{"payment_method_id":"${env.bankMethodId}","amount":50000,"reference_number":"TRF-9876"}]'::jsonb,
        0
      ) as process_pos_sale`
    );

    const lines = await assertJournalBalanced(res.rows[0].process_pos_sale.journal_id);
    const bankLine = lines.find((l) => l.account_code === '1100')!;
    expect(parseFloat(bankLine.debit)).toBe(50000);
  });

  // 6. QRIS payment
  it('Scenario 6: QRIS payment correctly debits QRIS Receivable (1200)', async () => {
    const res = await env.db.query<{ process_pos_sale: { success: boolean; journal_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'SCENARIO-06',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","quantity":1,"unit_price":50000,"total_amount":50000}]'::jsonb,
        '[{"payment_method_id":"${env.qrisMethodId}","amount":50000,"reference_number":"NMID-1234"}]'::jsonb,
        0
      ) as process_pos_sale`
    );

    const lines = await assertJournalBalanced(res.rows[0].process_pos_sale.journal_id);
    const qrisLine = lines.find((l) => l.account_code === '1200')!;
    expect(parseFloat(qrisLine.debit)).toBe(50000);
  });

  // 7. Split payment (Cash 30k + QRIS 70k = 100k)
  it('Scenario 7: Split payment debits both Cash (1000) and QRIS (1200) proportionally', async () => {
    const res = await env.db.query<{ process_pos_sale: { success: boolean; journal_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'SCENARIO-07',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"PRODUCT","product_id":"${env.retailPomadeId}","quantity":1,"unit_price":100000,"total_amount":100000}]'::jsonb,
        '[
          {"payment_method_id":"${env.cashMethodId}","amount":30000},
          {"payment_method_id":"${env.qrisMethodId}","amount":70000}
        ]'::jsonb,
        0
      ) as process_pos_sale`
    );

    const lines = await assertJournalBalanced(res.rows[0].process_pos_sale.journal_id);
    const cashLine = lines.find((l) => l.account_code === '1000')!;
    const qrisLine = lines.find((l) => l.account_code === '1200')!;
    expect(parseFloat(cashLine.debit)).toBe(30000);
    expect(parseFloat(qrisLine.debit)).toBe(70000);
  });

  // 8. Tax
  it('Scenario 8: Sale with tax credits Tax Payable (2200) and separates net revenue', async () => {
    // Total = 111,000 (Net revenue: 100,000, Tax: 11,000)
    await env.asUser(env.ownerUserId);
    await env.db.query(`UPDATE business_settings SET tax_enabled = true, tax_rate = 11, tax_inclusive = true`);
    await env.db.query(`UPDATE service_outlets SET selling_price = 111000 WHERE service_id = '${env.serviceColorId}' AND outlet_id = '${env.outletAId}'`);
    await env.asUser(env.cashierAUserId);

    const res = await env.db.query<{ process_pos_sale: { success: boolean; journal_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'SCENARIO-08',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"SERVICE","service_id":"${env.serviceColorId}","quantity":1}]'::jsonb,
        '[{"payment_method_id":"${env.cashMethodId}","amount":111000}]'::jsonb,
        0
      ) as process_pos_sale`
    );

    await env.asUser(env.ownerUserId);
    await env.db.query(`UPDATE business_settings SET tax_enabled = false, tax_rate = 0`);
    await env.db.query(`UPDATE service_outlets SET selling_price = 150000 WHERE service_id = '${env.serviceColorId}' AND outlet_id = '${env.outletAId}'`);
    await env.asUser(env.cashierAUserId);

    const lines = await assertJournalBalanced(res.rows[0].process_pos_sale.journal_id);
    const taxLine = lines.find((l) => l.account_code === '2200')!;
    const revLine = lines.find((l) => l.account_code === '4000')!;

    expect(taxLine).toBeDefined();
    expect(parseFloat(taxLine.credit)).toBe(11000);
    expect(parseFloat(revLine.credit)).toBe(100000);
  });

  // 9. Product COGS
  it('Scenario 9: Product COGS debits COGS (5000) and credits Inventory Asset (1300)', async () => {
    const res = await env.db.query<{ process_pos_sale: { success: boolean; journal_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'SCENARIO-09',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"PRODUCT","product_id":"${env.retailShampooId}","quantity":2,"unit_price":80000,"total_amount":160000}]'::jsonb,
        '[{"payment_method_id":"${env.cashMethodId}","amount":160000}]'::jsonb,
        0
      ) as process_pos_sale`
    );

    const lines = await assertJournalBalanced(res.rows[0].process_pos_sale.journal_id);
    const cogsLine = lines.find((l) => l.account_code === '5000')!;
    const invLine = lines.find((l) => l.account_code === '1300')!;

    // 2 Shampoos @ 40k cost = 80,000 COGS
    expect(parseFloat(cogsLine.debit)).toBe(80000);
    expect(parseFloat(invLine.credit)).toBe(80000);
  });

  // 10. Service consumable COGS
  it('Scenario 10: Service consumable recipe auto-deducts material and debits COGS (5000)', async () => {
    // 1 Classic Haircut consumes 1 Neck Strip (Cost: 1,000)
    const res = await env.db.query<{ process_pos_sale: { success: boolean; journal_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'SCENARIO-10',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","quantity":1,"unit_price":50000,"total_amount":50000}]'::jsonb,
        '[{"payment_method_id":"${env.cashMethodId}","amount":50000}]'::jsonb,
        0
      ) as process_pos_sale`
    );

    const lines = await assertJournalBalanced(res.rows[0].process_pos_sale.journal_id);
    const cogsLine = lines.find((l) => l.account_code === '5000')!;
    const invLine = lines.find((l) => l.account_code === '1300')!;

    expect(cogsLine).toBeDefined();
    expect(parseFloat(cogsLine.debit)).toBe(1000); // 1 neck strip @ 1000 cost
    expect(parseFloat(invLine.credit)).toBe(1000);
  });

  // 11. Commission
  it('Scenario 11: Barber commission debits Commission Expense (5100) and credits Commission Payable (2100)', async () => {
    const res = await env.db.query<{ process_pos_sale: { success: boolean; journal_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'SCENARIO-11',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"SERVICE","service_id":"${env.serviceCutId}","barber_id":"${env.barberAEmployeeId}","quantity":1,"unit_price":50000,"total_amount":50000,"commission_type":"PERCENTAGE","commission_rate":30,"commission_amount":15000}]'::jsonb,
        '[{"payment_method_id":"${env.cashMethodId}","amount":50000}]'::jsonb,
        0
      ) as process_pos_sale`
    );

    const lines = await assertJournalBalanced(res.rows[0].process_pos_sale.journal_id);
    const expLine = lines.find((l) => l.account_code === '5100')!;
    const payLine = lines.find((l) => l.account_code === '2100')!;

    expect(expLine).toBeDefined();
    expect(parseFloat(expLine.debit)).toBe(15000);
    expect(parseFloat(payLine.credit)).toBe(15000);
  });

  // 12. Zero-commission sale
  it('Scenario 12: Zero-commission sale produces zero commission journal lines', async () => {
    const res = await env.db.query<{ process_pos_sale: { success: boolean; journal_id: string } }>(
      `SELECT process_pos_sale(
        '${env.outletAId}',
        'SCENARIO-12',
        '${env.cashierAProfileId}',
        '${env.customerId}',
        NULL,
        '[{"item_type":"SERVICE","service_id":"${env.serviceColorId}","quantity":1,"unit_price":150000,"total_amount":150000,"commission_amount":0}]'::jsonb,
        '[{"payment_method_id":"${env.cashMethodId}","amount":150000}]'::jsonb,
        0
      ) as process_pos_sale`
    );

    const lines = await assertJournalBalanced(res.rows[0].process_pos_sale.journal_id);
    const expLine = lines.find((l) => l.account_code === '5100');
    const payLine = lines.find((l) => l.account_code === '2100');

    expect(expLine).toBeUndefined();
    expect(payLine).toBeUndefined();
  });
});
