import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
// @ts-ignore
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import * as fs from 'fs';
import * as path from 'path';

describe('Section 14: Clean Migration Install & Schema Contract Verification', () => {
  it(
    'executes all tracked migrations from scratch and verifies the core schema contract',
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

    expect(migrationFiles.length).toBeGreaterThanOrEqual(13);

    // Bootstrap test-only auth mocks for PGlite
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets (
        id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL,
        file_size_limit bigint, allowed_mime_types text[]
      );
      CREATE TABLE storage.objects (bucket_id text, name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$ LANGUAGE sql STABLE;
    `);

    // 2. Execute all tracked migrations sequentially from zero
    for (const file of migrationFiles) {
      let sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, '-- pgcrypto builtin in PG13+');
      await db.exec(sql);
    }

    const cardColumns = await db.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND (
        (table_name = 'business_settings' AND column_name IN ('member_card_name', 'member_card_logo_url', 'member_card_background_url', 'member_card_lifetime', 'member_card_validity_months'))
        OR (table_name = 'customers' AND column_name IN ('member_card_token', 'member_card_issued_at', 'member_card_expires_at', 'member_card_name', 'member_card_logo_url', 'member_card_background_url'))
      );
    `);
    expect(cardColumns.rows).toHaveLength(11);
    const cardBucket = await db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(`
      SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'member-card-assets';
    `);
    expect(cardBucket.rows[0]).toEqual({
      public: true, file_size_limit: 2097152,
      allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp'],
    });
    const uploadPolicy = await db.query<{ cmd: string; roles: string[]; with_check: string }>(`
      SELECT cmd, roles, with_check FROM pg_policies WHERE schemaname = 'storage'
        AND tablename = 'objects' AND policyname = 'member_card_assets_owner_upload';
    `);
    expect(uploadPolicy.rows).toHaveLength(1);
    expect(uploadPolicy.rows[0].cmd).toBe('INSERT');
    expect(uploadPolicy.rows[0].roles).toEqual(['authenticated']);
    expect(uploadPolicy.rows[0].with_check).toContain('is_owner_or_admin');
    expect((await db.query(`SELECT has_function_privilege('anon', 'public.get_public_member_card(uuid)', 'EXECUTE') AS ok`)).rows[0]).toEqual({ ok: true });
    expect((await db.query(`SELECT has_function_privilege('anon', 'public.issue_member_card(uuid)', 'EXECUTE') AS ok`)).rows[0]).toEqual({ ok: false });

    // 3. Verify the public schema contains the complete core contract.
    const tablesRes = await db.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    expect(tablesRes.rows.length).toBeGreaterThanOrEqual(49);

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
      'queue_sale_links',
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

    // 4. Verify RLS is ENABLED and FORCED on all public tables.
    const rlsRes = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `);

    expect(rlsRes.rows.length).toBe(tablesRes.rows.length);
    for (const table of rlsRes.rows) {
      // Internal rate-limit state is callable only through SECURITY DEFINER helpers.
      if (table.relname === 'public_booking_phone_limits') continue;
      expect(table.relrowsecurity, `${table.relname} must enable RLS`).toBe(true);
      expect(table.relforcerowsecurity, `${table.relname} must force RLS`).toBe(true);
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
    expect(parseInt((accountsCheck.rows[0] as any).count)).toBeGreaterThanOrEqual(20);

    const pmCheck = await db.query('SELECT COUNT(*) FROM payment_methods WHERE financial_account_id IS NOT NULL');
    expect(parseInt((pmCheck.rows[0] as any).count)).toBeGreaterThanOrEqual(3);

    for (const table of ['business_settings', 'outlets', 'profiles', 'user_roles']) {
      const result = await db.query(`SELECT COUNT(*) AS count FROM ${table}`);
      expect(Number((result.rows[0] as { count: string }).count), `${table} must start empty`).toBe(0);
    }

    // 7. Verify Least Privilege: anon has 0 table grants in schema public
    const anonGrantsRes = await db.query<{ count: string }>(`
      SELECT count(*) as count
      FROM information_schema.role_table_grants
      WHERE grantee = 'anon' AND table_schema = 'public';
    `);
    expect(parseInt(anonGrantsRes.rows[0].count)).toBe(0);
    for (const table of tableNames.filter((name) => !['public_booking_phone_limits', 'leave_booking_followups'].includes(name))) {
      expect(await db.query(`SELECT has_table_privilege('authenticated', 'public.${table}', 'SELECT') AS ok`)
        .then((result) => (result.rows[0] as { ok: boolean }).ok), `${table} needs authenticated SELECT`).toBe(true);
    }
    expect((await db.query(`SELECT has_table_privilege('authenticated', 'public.public_booking_phone_limits', 'SELECT') AS ok`)).rows[0]).toEqual({ ok: false });
    expect((await db.query(`SELECT has_table_privilege('authenticated', 'public.leave_booking_followups', 'SELECT') AS ok`)).rows[0]).toEqual({ ok: false });

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
      (r) => !r.proconfig || !r.proconfig.some((c) =>
        c.startsWith('search_path=') && !c.includes('"$user"')
      )
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
    expect(anonRoutines).not.toContain('delete_catalog_item');
    expect(anonRoutines).not.toContain('upsert_catalog_product');
    expect(anonRoutines).not.toContain('upsert_catalog_service');

    const authExecRes = await db.query<{ routine_name: string }>(`
      SELECT DISTINCT routine_name
      FROM information_schema.routine_privileges
      WHERE grantee = 'authenticated' AND specific_schema = 'public'
      ORDER BY routine_name;
    `);
    const authRoutines = authExecRes.rows.map((r) => r.routine_name);
    expect(authRoutines.length).toBeGreaterThanOrEqual(8);

    // A newly provisioned Owner can actually complete first-run settings.
    const authUserId = '11111111-1111-4111-8111-111111111111';
    await db.exec(`
      INSERT INTO public.profiles (auth_user_id, display_name)
      VALUES ('${authUserId}', 'Owner Test');
      INSERT INTO public.user_roles (user_id, role_id, outlet_id)
      SELECT p.id, r.id, NULL FROM public.profiles p CROSS JOIN public.roles r
      WHERE p.auth_user_id = '${authUserId}' AND r.code = 'OWNER';
      SELECT set_config('request.jwt.claim.sub', '${authUserId}', false);
    `);
    const firstBusiness = await db.query<{ name: string }>(`
      SELECT (public.save_business_settings(p_business_name => 'Barber Test')).business_name AS name;
    `);
    expect(firstBusiness.rows[0].name).toBe('Barber Test');
    const firstOutlet = await db.query<{ name: string }>(`
      SELECT (public.save_outlet(p_code => 'OUT-01', p_name => 'Cabang Utama')).name AS name;
    `);
    expect(firstOutlet.rows[0].name).toBe('Cabang Utama');

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
