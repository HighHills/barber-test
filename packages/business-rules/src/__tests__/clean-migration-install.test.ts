import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
// @ts-ignore
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import * as fs from 'fs';
import * as path from 'path';

describe('Section 14: Clean Migration Install & Schema Contract Verification', () => {
  it(
    'executes all 13 migrations from scratch on a clean database and verifies complete 49-table contract',
    async () => {
    // 1. Initialize brand new empty in-memory PostgreSQL instance
    const db = new PGlite({
      extensions: {
        btree_gist,
      },
    });

    const migrationsDir = path.resolve(__dirname, '../../../../supabase/migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    expect(migrationFiles.length).toBe(13);

    // Bootstrap test-only auth mocks for PGlite
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$ LANGUAGE sql STABLE;
    `);

    // 2. Execute all 13 migrations sequentially from zero
    for (const file of migrationFiles) {
      let sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, '-- pgcrypto builtin in PG13+');
      await db.exec(sql);
    }

    // 3. Verify exactly 49 tables created in public schema (including sale_refund_payments)
    const tablesRes = await db.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    expect(tablesRes.rows.length).toBe(49);

    const tableNames = tablesRes.rows.map((t) => t.table_name);

    // Assert key tables from every architectural domain
    const expectedDomainTables = [
      // Core & RBAC
      'business_settings',
      'outlets',
      'roles',
      'permissions',
      'role_permissions',
      'profiles',
      'user_roles',
      'audit_logs',
      // Employees & Customers
      'employees',
      'employee_outlets',
      'employee_schedules',
      'employee_leaves',
      'customers',
      // Catalog & Pricing
      'service_categories',
      'services',
      'service_outlets',
      'product_categories',
      'products',
      'product_outlets',
      'product_unit_conversions',
      'service_consumptions',
      // Inventory & Purchasing
      'outlet_inventory',
      'inventory_movements',
      'suppliers',
      'purchases',
      'purchase_items',
      'supplier_payments',
      'stock_adjustments',
      'stock_adjustment_items',
      'stock_transfers',
      'stock_transfer_items',
      // POS & Sales
      'cash_registers',
      'cash_sessions',
      'payment_methods',
      'sales',
      'sale_items',
      'sale_payments',
      'sale_refunds',
      'sale_refund_items',
      'sale_refund_payments',
      // Bookings & Queues
      'appointments',
      'queues',
      // Commissions
      'commission_rules',
      'commissions',
      // Double-Entry Finance
      'financial_accounts',
      'financial_periods',
      'journal_entries',
      'journal_lines',
      // Notifications
      'notifications',
    ];

    for (const tableName of expectedDomainTables) {
      expect(tableNames).toContain(tableName);
    }

    // 4. Verify RLS is ENABLED and FORCED on all 49 tables
    const rlsRes = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `);

    expect(rlsRes.rows.length).toBe(49);
    for (const table of rlsRes.rows) {
      expect(table.relrowsecurity).toBe(true);
      expect(table.relforcerowsecurity).toBe(true);
    }

    // 5. Verify Immutability Triggers exist
    const triggersRes = await db.query<{ tgname: string }>(`
      SELECT tgname
      FROM pg_trigger
      WHERE tgname IN (
        'trg_audit_logs_immutable',
        'trg_inventory_movements_immutable',
        'trg_journal_entries_immutable',
        'trg_journal_lines_immutable'
      );
    `);
    expect(triggersRes.rows.length).toBe(4);

    // 6. Verify seed.sql applies cleanly on top of clean install
    const seedPath = path.resolve(__dirname, '../../../../supabase/seed.sql');
    const seedSql = fs.readFileSync(seedPath, 'utf-8');
    await expect(db.exec(seedSql)).resolves.not.toThrow();

    // Verify seed loaded system roles, accounts, and payment methods
    const rolesCheck = await db.query('SELECT COUNT(*) FROM roles');
    expect(parseInt((rolesCheck.rows[0] as any).count)).toBe(7);

    const accountsCheck = await db.query('SELECT COUNT(*) FROM financial_accounts');
    expect(parseInt((accountsCheck.rows[0] as any).count)).toBe(18);

    const pmCheck = await db.query('SELECT COUNT(*) FROM payment_methods WHERE financial_account_id IS NOT NULL');
    expect(parseInt((pmCheck.rows[0] as any).count)).toBeGreaterThanOrEqual(3);

    // 7. Verify Least Privilege: anon has 0 table grants in schema public
    const anonGrantsRes = await db.query<{ count: string }>(`
      SELECT count(*) as count
      FROM information_schema.role_table_grants
      WHERE grantee = 'anon' AND table_schema = 'public';
    `);
    expect(parseInt(anonGrantsRes.rows[0].count)).toBe(0);

    // 8. Verify SECURITY DEFINER functions & hardened search_path
    const secDefRes = await db.query<{ proname: string; proconfig: string[] | null }>(`
      SELECT p.proname, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.prosecdef = TRUE AND n.nspname = 'public'
      ORDER BY p.proname;
    `);
    const secDefCount = secDefRes.rows.length;
    expect(secDefCount).toBeGreaterThanOrEqual(15);

    const lackingSearchPath = secDefRes.rows.filter(
      (r) => !r.proconfig || !r.proconfig.some((c) => c.includes('search_path=public, pg_temp'))
    );
    expect(lackingSearchPath.length, `Functions lacking search_path: ${lackingSearchPath.map(f => f.proname).join(', ')}`).toBe(0);

    // 9. Verify Routine EXECUTE grants for anon and authenticated
    const anonExecRes = await db.query<{ routine_name: string }>(`
      SELECT routine_name
      FROM information_schema.routine_privileges
      WHERE grantee = 'anon' AND specific_schema = 'public'
      ORDER BY routine_name;
    `);
    const anonRoutines = anonExecRes.rows.map((r) => r.routine_name);
    expect(anonRoutines).toContain('create_public_booking');
    expect(anonRoutines).toContain('get_public_business_settings');

    const authExecRes = await db.query<{ routine_name: string }>(`
      SELECT DISTINCT routine_name
      FROM information_schema.routine_privileges
      WHERE grantee = 'authenticated' AND specific_schema = 'public'
      ORDER BY routine_name;
    `);
    const authRoutines = authExecRes.rows.map((r) => r.routine_name);
    expect(authRoutines.length).toBeGreaterThanOrEqual(8);

    console.log({
      migrationCount: migrationFiles.length,
      tableCount: tablesRes.rows.length,
      rlsEnabledCount: rlsRes.rows.filter(r => r.relrowsecurity).length,
      rlsForcedCount: rlsRes.rows.filter(r => r.relforcerowsecurity).length,
      securityDefinerCount: secDefCount,
      unhardenedSecDefCount: lackingSearchPath.length,
      anonTableGrants: parseInt(anonGrantsRes.rows[0].count),
      anonExecuteGrants: anonRoutines,
      authExecuteGrantsCount: authRoutines.length,
      seedSuccess: true,
    });
  }, 30000);
});
