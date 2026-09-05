import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Blocker 5: Static Security & Source Migration Audit', () => {
  const migrationsDir = path.resolve(__dirname, '../../../../supabase/migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const exportPath = path.resolve(__dirname, '../../../../phase-0.5-migration-export.sql');
  const exportSql = fs.readFileSync(exportPath, 'utf8');

  // Load all individual migration SQL strings
  const fileContents = migrationFiles.map((f) => ({
    fileName: f,
    sql: fs.readFileSync(path.join(migrationsDir, f), 'utf8'),
  }));

  // 1. Audit: No fake auth schema
  it('strictly prohibits "CREATE SCHEMA auth" across all production migrations and export', () => {
    const pattern = /CREATE\s+SCHEMA\s+(IF\s+NOT\s+EXISTS\s+)?auth/i;

    for (const { fileName, sql } of fileContents) {
      expect(pattern.test(sql), `Forbidden "CREATE SCHEMA auth" found in ${fileName}`).toBe(false);
    }
    expect(pattern.test(exportSql), 'Forbidden "CREATE SCHEMA auth" found in phase-0.5-migration-export.sql').toBe(false);
  });

  // 2. Audit: No fake auth.uid() definition
  it('strictly prohibits "CREATE ... FUNCTION auth.uid" across all production migrations and export', () => {
    const pattern = /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+auth\.uid/i;

    for (const { fileName, sql } of fileContents) {
      expect(pattern.test(sql), `Forbidden "CREATE FUNCTION auth.uid" found in ${fileName}`).toBe(false);
    }
    expect(pattern.test(exportSql), 'Forbidden "CREATE FUNCTION auth.uid" found in phase-0.5-migration-export.sql').toBe(false);
  });

  // 3. Audit: Zero table CRUD grants to anon
  it('strictly prohibits "GRANT SELECT/INSERT/UPDATE/DELETE ... TO anon" across all migrations and export', () => {
    const pattern = /GRANT\s+(ALL|SELECT|INSERT|UPDATE|DELETE)(\s*,\s*(SELECT|INSERT|UPDATE|DELETE))*\s+ON\s+.*TO\s+([^;]*\b)?anon\b/i;

    for (const { fileName, sql } of fileContents) {
      expect(pattern.test(sql), `Forbidden table CRUD grant to anon found in ${fileName}`).toBe(false);
    }
    expect(pattern.test(exportSql), 'Forbidden table CRUD grant to anon found in phase-0.5-migration-export.sql').toBe(false);
  });

  // 4. Audit: All SECURITY DEFINER functions have locked search_path
  it('strictly verifies every SECURITY DEFINER function sets "search_path = public, pg_temp"', () => {
    for (const { fileName, sql } of fileContents) {
      const funcBlocks = sql.split(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+/i).slice(1);

      for (const block of funcBlocks) {
        const funcDecl = block.split(/\$\$/)[0] || '';
        if (/SECURITY\s+DEFINER/i.test(funcDecl)) {
          const hasSearchPath = /SET\s+search_path\s*=\s*public\s*,\s*pg_temp/i.test(funcDecl);
          const funcName = funcDecl.split('(')[0]?.trim();
          expect(
            hasSearchPath,
            `Function "${funcName}" in ${fileName} has SECURITY DEFINER but lacks "SET search_path = public, pg_temp"`
          ).toBe(true);
        }
      }
    }
  });

  // 5. Audit: Privileged RPCs have auth.uid() IS NULL guard
  it('strictly verifies all 6 privileged transactional RPCs require authenticated callers', () => {
    const privilegedRPCs = [
      'process_pos_sale',
      'void_sale',
      'process_sale_refund',
      'process_stock_adjustment',
      'process_stock_transfer',
      'post_journal_entry',
    ];

    const mig13 = fileContents.find((f) => f.fileName.includes('20260904000013'))?.sql || '';

    for (const rpc of privilegedRPCs) {
      const rpcIdx = mig13.indexOf(`FUNCTION ${rpc}`);
      expect(rpcIdx, `Function ${rpc} must be defined in Migration 13`).toBeGreaterThan(-1);

      const rpcBody = mig13.substring(rpcIdx, rpcIdx + 8000);
      const hasAuthGuard = /IF\s+auth\.uid\(\)\s+IS\s+NULL\s+THEN\s+RAISE\s+EXCEPTION\s+'Authentication required'/i.test(rpcBody);
      expect(hasAuthGuard, `RPC ${rpc} lacks "IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'" guard`).toBe(true);
    }
  });

  // 6. Audit: Privileged RPCs verify permissions
  it('strictly verifies all 6 privileged transactional RPCs verify granular permissions', () => {
    const rpcPermMap: Record<string, string> = {
      process_pos_sale: 'pos.sale.create',
      void_sale: 'pos.sale.void',
      process_sale_refund: 'pos.sale.refund',
      process_stock_adjustment: 'inventory.adjust',
      process_stock_transfer: 'inventory.transfer',
      post_journal_entry: 'finance.post',
    };

    const mig13 = fileContents.find((f) => f.fileName.includes('20260904000013'))?.sql || '';

    for (const [rpc, perm] of Object.entries(rpcPermMap)) {
      const rpcIdx = mig13.indexOf(`FUNCTION ${rpc}`);
      const rpcBody = mig13.substring(rpcIdx, rpcIdx + 8000);
      const hasPermCheck = new RegExp(`current_user_has_permission\\s*\\(\\s*'${perm}'`, 'i').test(rpcBody);
      expect(hasPermCheck, `RPC ${rpc} lacks permission check for '${perm}'`).toBe(true);
    }
  });

  // 7. Audit: Operational table RLS mutations enforce WITH CHECK
  it('strictly verifies outlet-scoped mutation policies enforce WITH CHECK', () => {
    const mig13 = fileContents.find((f) => f.fileName.includes('20260904000013'))?.sql || '';

    const operationalTables = [
      'sales',
      'appointments',
      'cash_registers',
      'outlet_inventory',
      'stock_adjustments',
      'stock_transfers',
    ];

    for (const tbl of operationalTables) {
      const insertPolicyRegex = new RegExp(`CREATE\\s+POLICY\\s+"${tbl}_insert"\\s+ON\\s+${tbl}\\s+FOR\\s+INSERT[\\s\\S]*?WITH\\s+CHECK`, 'i');
      const updatePolicyRegex = new RegExp(`CREATE\\s+POLICY\\s+"${tbl}_update"\\s+ON\\s+${tbl}\\s+FOR\\s+UPDATE[\\s\\S]*?WITH\\s+CHECK`, 'i');

      expect(insertPolicyRegex.test(mig13), `Table ${tbl} missing INSERT WITH CHECK policy in Migration 13`).toBe(true);
      expect(updatePolicyRegex.test(mig13), `Table ${tbl} missing UPDATE WITH CHECK policy in Migration 13`).toBe(true);
    }
  });

  // 8. Audit: Posted journal immutability
  it('strictly verifies prevent_posted_journal_modification prevents direct POSTED journal updates', () => {
    const mig13 = fileContents.find((f) => f.fileName.includes('20260904000013'))?.sql || '';

    expect(/prevent_posted_journal_modification\(\)/i.test(mig13)).toBe(true);
    expect(/Posted journal entries are immutable/i.test(mig13)).toBe(true);
    expect(/NEW\.status\s*=\s*'REVERSED'/i.test(mig13)).toBe(true);
    expect(/NEW\.reversed_journal_id\s+IS\s+NULL/i.test(mig13)).toBe(true);
  });

  // 9. Audit: Runtime transactions resolve financial_account_id dynamically
  it('strictly verifies POS & refund transactions resolve payment accounts dynamically, not hardcoded', () => {
    const mig13 = fileContents.find((f) => f.fileName.includes('20260904000013'))?.sql || '';

    // Verify dynamic resolution from payment_methods
    expect(
      /payment_methods[\s\S]*?financial_account_id/i.test(mig13),
      'process_pos_sale must dynamically resolve payment_methods.financial_account_id'
    ).toBe(true);

    // Verify neither process_pos_sale nor process_sale_refund contains hardcoded fallbacks to account 1000 or 1200
    const posStart = mig13.indexOf('FUNCTION process_pos_sale');
    const posEnd = mig13.indexOf('FUNCTION void_sale');
    const posBody = mig13.substring(posStart, posEnd);
    expect(/account_code\s*=\s*'1000'/i.test(posBody), 'process_pos_sale must not hardcode account 1000').toBe(false);
    expect(/account_code\s*=\s*'1200'/i.test(posBody), 'process_pos_sale must not hardcode account 1200').toBe(false);

    const refStart = mig13.indexOf('FUNCTION process_sale_refund');
    const refEnd = mig13.indexOf('FUNCTION process_stock_adjustment');
    const refBody = mig13.substring(refStart, refEnd);
    expect(/account_code\s*=\s*'1000'/i.test(refBody), 'process_sale_refund must not hardcode account 1000').toBe(false);
    expect(/account_code\s*=\s*'1200'/i.test(refBody), 'process_sale_refund must not hardcode account 1200').toBe(false);
  });
});
