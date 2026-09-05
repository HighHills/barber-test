import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDbEnvironment, TestDbEnvironment } from './helpers/db-test-setup';

describe('Sections 8 & 9: Database Catalog Audit — SECURITY DEFINER & Account Mapping', () => {
  let env: TestDbEnvironment;

  beforeEach(async () => {
    env = await createTestDbEnvironment();
  });

  describe('Section 8: SECURITY DEFINER Catalog Audit (pg_proc & search_path)', () => {
    it('verifies that EVERY SECURITY DEFINER function has search_path explicitly locked to "public, pg_temp"', async () => {
      const secDefProcs = await env.db.query<{
        proname: string;
        prosecdef: boolean;
        proconfig: string[] | null;
      }>(`
        SELECT
          p.proname,
          p.prosecdef,
          p.proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef = TRUE
        ORDER BY p.proname;
      `);

      expect(secDefProcs.rows.length).toBeGreaterThan(0);

      const auditedFunctions: string[] = [];

      for (const proc of secDefProcs.rows) {
        auditedFunctions.push(proc.proname);

        // Every SECURITY DEFINER function MUST have proconfig containing search_path=public, pg_temp
        expect(proc.proconfig).not.toBeNull();
        const configStr = proc.proconfig ? proc.proconfig.join(',') : '';
        expect(configStr).toContain('search_path=public, pg_temp');
      }

      // Assert that all critical RPCs and security helpers are among the audited functions
      const requiredSecurityDefiners = [
        'process_pos_sale',
        'void_sale',
        'process_sale_refund',
        'process_stock_adjustment',
        'process_stock_transfer',
        'post_journal_entry',
        'get_current_profile_id',
        'is_owner_or_admin',
        'current_user_has_outlet_access',
        'current_user_has_permission',
        'prevent_audit_log_modification',
        'prevent_inventory_movement_modification',
        'prevent_posted_journal_modification',
        'prevent_posted_journal_line_modification',
      ];

      for (const fn of requiredSecurityDefiners) {
        expect(auditedFunctions).toContain(fn);
      }
    });
  });

  describe('Section 9: Financial Account Mapping & Chart of Accounts Audit', () => {
    it('verifies that every payment method maps to a valid, active financial account', async () => {
      const methods = await env.db.query<{
        id: string;
        name: string;
        code: string;
        financial_account_id: string | null;
        account_code: string | null;
        account_name: string | null;
        account_type: string | null;
      }>(`
        SELECT
          pm.id,
          pm.name,
          pm.code,
          pm.financial_account_id,
          fa.account_code,
          fa.account_name,
          fa.account_type
        FROM payment_methods pm
        LEFT JOIN financial_accounts fa ON fa.id = pm.financial_account_id
        WHERE pm.is_active = TRUE;
      `);

      expect(methods.rows.length).toBeGreaterThan(0);

      for (const pm of methods.rows) {
        // Must have non-null foreign key
        expect(pm.financial_account_id).not.toBeNull();
        expect(pm.account_code).not.toBeNull();
        expect(pm.account_type).toBe('ASSET'); // Payment destinations must be ASSET accounts (Cash, Bank, QRIS)
      }
    });

    it('verifies standard Chart of Accounts completeness for all transaction cycles', async () => {
      const accounts = await env.db.query<{ account_code: string; account_name: string; account_type: string }>(
        `SELECT account_code, account_name, account_type FROM financial_accounts WHERE is_active = TRUE`
      );

      const codeMap = new Map(accounts.rows.map((a) => [a.account_code, a]));

      // 1. Assets
      expect(codeMap.has('1000')).toBe(true); // Cash on Hand
      expect(codeMap.get('1000')?.account_type).toBe('ASSET');
      expect(codeMap.has('1100')).toBe(true); // Bank
      expect(codeMap.get('1100')?.account_type).toBe('ASSET');
      expect(codeMap.has('1200')).toBe(true); // QRIS / EDC
      expect(codeMap.get('1200')?.account_type).toBe('ASSET');
      expect(codeMap.has('1300')).toBe(true); // Inventory Asset
      expect(codeMap.get('1300')?.account_type).toBe('ASSET');

      // 2. Liabilities
      expect(codeMap.has('2000')).toBe(true); // Accounts Payable
      expect(codeMap.get('2000')?.account_type).toBe('LIABILITY');
      expect(codeMap.has('2100')).toBe(true); // Commissions Payable
      expect(codeMap.get('2100')?.account_type).toBe('LIABILITY');
      expect(codeMap.has('2200')).toBe(true); // Tax Payable
      expect(codeMap.get('2200')?.account_type).toBe('LIABILITY');

      // 3. Revenues
      expect(codeMap.has('4000')).toBe(true); // Service Revenue
      expect(codeMap.get('4000')?.account_type).toBe('REVENUE');
      expect(codeMap.has('4100')).toBe(true); // Product Sales Revenue
      expect(codeMap.get('4100')?.account_type).toBe('REVENUE');

      // 4. Expenses & Contra-Accounts
      expect(codeMap.has('5000')).toBe(true); // COGS
      expect(codeMap.get('5000')?.account_type).toBe('EXPENSE');
      expect(codeMap.has('5100')).toBe(true); // Consumables Expense
      expect(codeMap.get('5100')?.account_type).toBe('EXPENSE');
      expect(codeMap.has('5200')).toBe(true); // Commission Expense
      expect(codeMap.get('5200')?.account_type).toBe('EXPENSE');
      expect(codeMap.has('5600')).toBe(true); // Sales Returns & Allowances
      expect(codeMap.get('5600')?.account_type).toBe('EXPENSE');
      expect(codeMap.has('5700')).toBe(true); // Inventory Shrinkage
      expect(codeMap.get('5700')?.account_type).toBe('EXPENSE');
    });
  });
});
