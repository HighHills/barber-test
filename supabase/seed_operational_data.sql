-- ============================================================
-- SYSTEM ROLES, RBAC, COA & USER ROLE ENROLLMENT
-- Jalankan skrip ini di Supabase SQL Editor.
-- ============================================================

-- 1. Standard Chart of Accounts (COA) untuk Jurnal Akuntansi Level 2
INSERT INTO public.financial_accounts (account_code, account_name, account_type, normal_balance, is_system, is_active) VALUES
  ('1000', 'Cash on Hand', 'ASSET', 'DEBIT', true, true),
  ('1100', 'Bank Account', 'ASSET', 'DEBIT', true, true),
  ('1200', 'QRIS Receivable', 'ASSET', 'DEBIT', true, true),
  ('1300', 'Inventory Asset', 'ASSET', 'DEBIT', true, true),
  ('2000', 'Accounts Payable', 'LIABILITY', 'CREDIT', true, true),
  ('2100', 'Commission Payable', 'LIABILITY', 'CREDIT', true, true),
  ('2200', 'Tax Payable', 'LIABILITY', 'CREDIT', true, true),
  ('3000', 'Owner Equity', 'EQUITY', 'CREDIT', true, true),
  ('4000', 'Service Revenue', 'REVENUE', 'CREDIT', true, true),
  ('4100', 'Product Revenue', 'REVENUE', 'CREDIT', true, true),
  ('5000', 'Cost of Goods Sold (COGS)', 'EXPENSE', 'DEBIT', true, true),
  ('5100', 'Commission Expense', 'EXPENSE', 'DEBIT', true, true),
  ('5200', 'Rent Expense', 'EXPENSE', 'DEBIT', true, true),
  ('5300', 'Utilities Expense', 'EXPENSE', 'DEBIT', true, true),
  ('5400', 'Salary Expense', 'EXPENSE', 'DEBIT', true, true),
  ('5500', 'Merchant / Payment Gateway Fee', 'EXPENSE', 'DEBIT', true, true),
  ('5600', 'Refund / Contra Revenue', 'EXPENSE', 'DEBIT', true, true),
  ('5700', 'Inventory Loss / Waste', 'EXPENSE', 'DEBIT', true, true)
ON CONFLICT (account_code) DO NOTHING;

-- 2. Pastikan kolom financial_account_id pada payment_methods tersedia
ALTER TABLE public.payment_methods
ADD COLUMN IF NOT EXISTS financial_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE RESTRICT;

-- 3. Master System Roles
INSERT INTO public.roles (code, name, description, is_system, is_active) VALUES
  ('OWNER', 'Business Owner', 'Full unrestricted ownership access across all business domains and outlets', true, true),
  ('ADMIN', 'System Administrator', 'Administrative access to system configuration, users, and masters', true, true),
  ('MANAGER', 'Outlet Manager', 'Day-to-day operational management of assigned outlet', true, true),
  ('CASHIER', 'POS Cashier', 'Point of sale operations, sales checkouts, payments, and cash sessions', true, true),
  ('BARBER', 'Barber / Hair Stylist', 'Appointment schedules, queue visibility, and commission tracking', true, true),
  ('INVENTORY', 'Inventory Staff', 'Stock purchasing, adjustments, transfers, and warehouse audit', true, true),
  ('ACCOUNTING', 'Finance & Accounting', 'Financial accounts, journals, P&L, balance sheets, and tax reports', true, true)
ON CONFLICT (code) DO NOTHING;

-- 4. Core Permissions Dictionary
INSERT INTO public.permissions (code, name, description, module) VALUES
  ('pos.sale.view', 'View Sales', 'View sales records and invoices', 'pos'),
  ('pos.sale.create', 'Create Sale', 'Process POS checkout transactions', 'pos'),
  ('pos.sale.refund', 'Refund Sale', 'Process item-level and full refunds', 'pos'),
  ('pos.sale.void', 'Void Sale', 'Void same-day / shift transactions', 'pos'),
  ('pos.session.manage', 'Manage Cash Session', 'Open and close physical register sessions', 'pos'),
  ('inventory.view', 'View Inventory', 'View stock balances and movement ledger', 'inventory'),
  ('inventory.adjust', 'Adjust Stock', 'Create stock count adjustment records', 'inventory'),
  ('inventory.transfer', 'Transfer Stock', 'Request and approve inter-outlet transfers', 'inventory'),
  ('inventory.purchase', 'Manage Purchases', 'Create purchase orders and receive goods', 'inventory'),
  ('booking.view', 'View Bookings', 'View appointment calendar and slots', 'booking'),
  ('booking.manage', 'Manage Bookings', 'Create, reschedule, or cancel appointments', 'booking'),
  ('queue.manage', 'Manage Queue', 'Call, advance, and manage walk-in queue', 'queue'),
  ('finance.view', 'View Financials', 'View ledger, trial balance, and P&L', 'finance'),
  ('finance.post', 'Post Journals', 'Post double-entry journal entries', 'finance'),
  ('finance.period.close', 'Close Period', 'Lock and close financial periods', 'finance'),
  ('commission.view', 'View Commissions', 'View barber commission calculations', 'commission'),
  ('commission.manage', 'Manage Commissions', 'Configure commission rules and payouts', 'commission'),
  ('catalog.manage', 'Manage Catalog', 'Create/edit services, products, and pricing', 'catalog'),
  ('employee.manage', 'Manage Employees', 'Manage staff profiles, schedules, and leaves', 'employee'),
  ('user.manage', 'Manage Users & Roles', 'Assign roles and permissions to users', 'user'),
  ('settings.manage', 'Manage Settings', 'Update business and outlet configurations', 'settings')
ON CONFLICT (code) DO NOTHING;

-- 5. Default Payment Methods
INSERT INTO public.payment_methods (code, name, type, is_active) VALUES
  ('CASH', 'Cash / Tunai', 'CASH', true),
  ('QRIS', 'QRIS (Static / Dynamic)', 'QRIS', true),
  ('BANK_TRANSFER', 'Bank Transfer', 'BANK_TRANSFER', true),
  ('DEBIT', 'Debit Card (EDC)', 'EDC', true),
  ('CREDIT_CARD', 'Credit Card (EDC)', 'EDC', true),
  ('E_WALLET', 'E-Wallet (GoPay/OVO/ShopeePay)', 'E_WALLET', true)
ON CONFLICT (code) DO NOTHING;

-- Hubungkan Metode Pembayaran ke Akun Keuangan (COA)
UPDATE public.payment_methods SET financial_account_id = (SELECT id FROM public.financial_accounts WHERE account_code = '1000' LIMIT 1) WHERE code = 'CASH' AND financial_account_id IS NULL;
UPDATE public.payment_methods SET financial_account_id = (SELECT id FROM public.financial_accounts WHERE account_code = '1200' LIMIT 1) WHERE code = 'QRIS' AND financial_account_id IS NULL;
UPDATE public.payment_methods SET financial_account_id = (SELECT id FROM public.financial_accounts WHERE account_code = '1100' LIMIT 1) WHERE code IN ('BANK_TRANSFER', 'DEBIT', 'CREDIT_CARD', 'E_WALLET') AND financial_account_id IS NULL;

-- 6. Role-Permission Mappings
DO $$
DECLARE
  v_role_owner UUID;
  v_role_admin UUID;
  v_role_manager UUID;
  v_role_cashier UUID;
  v_role_barber UUID;
  v_role_inventory UUID;
  v_role_accounting UUID;
BEGIN
  SELECT id INTO v_role_owner FROM public.roles WHERE code = 'OWNER';
  SELECT id INTO v_role_admin FROM public.roles WHERE code = 'ADMIN';
  SELECT id INTO v_role_manager FROM public.roles WHERE code = 'MANAGER';
  SELECT id INTO v_role_cashier FROM public.roles WHERE code = 'CASHIER';
  SELECT id INTO v_role_barber FROM public.roles WHERE code = 'BARBER';
  SELECT id INTO v_role_inventory FROM public.roles WHERE code = 'INVENTORY';
  SELECT id INTO v_role_accounting FROM public.roles WHERE code = 'ACCOUNTING';

  IF v_role_owner IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_owner, id FROM public.permissions
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  IF v_role_admin IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_admin, id FROM public.permissions
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  IF v_role_manager IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_manager, id FROM public.permissions
    WHERE code IN (
      'pos.sale.view', 'pos.sale.create', 'pos.sale.refund', 'pos.sale.void', 'pos.session.manage',
      'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.purchase',
      'booking.view', 'booking.manage', 'queue.manage',
      'commission.view', 'catalog.manage', 'employee.manage'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  IF v_role_cashier IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_cashier, id FROM public.permissions
    WHERE code IN (
      'pos.sale.view', 'pos.sale.create', 'pos.sale.refund', 'pos.sale.void', 'pos.session.manage',
      'booking.view', 'booking.manage', 'queue.manage'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  IF v_role_barber IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_barber, id FROM public.permissions
    WHERE code IN ('booking.view', 'queue.manage', 'commission.view')
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  IF v_role_inventory IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_inventory, id FROM public.permissions
    WHERE code IN ('inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.purchase')
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  IF v_role_accounting IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_accounting, id FROM public.permissions
    WHERE code IN (
      'finance.view', 'finance.post', 'finance.period.close',
      'commission.view', 'commission.manage',
      'pos.sale.view', 'inventory.view'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;
END $$;

-- 7. HUBUNGKAN AKUN PROFIL LOGIN KE PERAN OWNER (HAK AKSES GLOBAL SEMUA OUTLET)
INSERT INTO public.user_roles (user_id, role_id, outlet_id)
SELECT
  p.id,
  r.id,
  NULL -- NULL outlet_id memberikan akses penuh ke semua cabang untuk OWNER
FROM public.profiles p
CROSS JOIN public.roles r
WHERE r.code = 'OWNER'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role_id = r.id
  );

-- 8. Cek Hasil Verifikasi
SELECT 'roles' AS table_name, COUNT(*) AS count FROM public.roles
UNION ALL
SELECT 'user_roles', COUNT(*) FROM public.user_roles
UNION ALL
SELECT 'payment_methods', COUNT(*) FROM public.payment_methods
UNION ALL
SELECT 'financial_accounts', COUNT(*) FROM public.financial_accounts;
