export interface BusinessSettings {
  id: string;
  business_name: string;
  legal_name: string | null;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string; // e.g. "IDR"
  timezone: string; // e.g. "Asia/Jakarta"
  tax_enabled: boolean;
  tax_rate: number; // e.g. 11.00 for 11%
  tax_inclusive: boolean;
  receipt_header: string | null;
  receipt_footer: string | null;
  booking_enabled: boolean;
  inventory_enabled: boolean;
  commission_enabled: boolean;
  finance_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Outlet {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  auth_user_id: string;
  employee_id: string | null;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  code: string; // 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'BARBER' | 'INVENTORY' | 'ACCOUNTING'
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  code: string; // e.g. 'pos.sale.create'
  name: string;
  description: string | null;
  module: string; // e.g. 'pos', 'inventory', 'finance'
  created_at: string;
}

export interface RolePermission {
  role_id: string;
  permission_id: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  outlet_id: string | null; // null represents business-wide role (when explicitly authorized)
  created_at: string;
  created_by: string | null;
}
