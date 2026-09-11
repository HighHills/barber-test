export type SettingsSectionId =
  | 'business'
  | 'outlets'
  | 'staff'
  | 'schedules'
  | 'leaves'
  | 'subaccounts'
  | 'roles'
  | 'service-categories'
  | 'services'
  | 'product-categories'
  | 'products'
  | 'payment-methods';

export interface BusinessSettingsFormData {
  id?: string;
  business_name: string;
  legal_name: string;
  logo_url: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
  timezone: string;
  tax_enabled: boolean;
  tax_rate: number;
  tax_inclusive: boolean;
  receipt_header: string;
  receipt_footer: string;
  booking_enabled: boolean;
  inventory_enabled: boolean;
  commission_enabled: boolean;
  finance_enabled: boolean;
}

export interface OutletItem {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeAssignedOutlet {
  outlet_id: string;
  outlet_code: string;
  outlet_name: string;
  is_primary: boolean;
  is_active: boolean;
}

export interface EmployeeItem {
  id: string;
  employee_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  position: string;
  hire_date: string;
  termination_date: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  assigned_outlets?: EmployeeAssignedOutlet[];
}

export interface ScheduleDayItem {
  id?: string;
  day_of_week: number; // 0=Minggu, 1=Senin, ..., 6=Sabtu
  day_name: string;
  is_active: boolean;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  has_break: boolean;
  break_start: string; // "HH:MM"
  break_end: string;   // "HH:MM"
}

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveItem {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  outlet_id: string;
  outlet_name?: string;
  start_at: string;
  end_at: string;
  reason: string;
  status: LeaveStatus;
  created_by?: string | null;
  created_at?: string;
}

export interface SettingsUserItem {
  id: string; // profile_id
  display_name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  employee_id: string | null;
  role_id: string | null;
  role_code: string | null;
  role_name: string | null;
  role_is_system: boolean | null;
  outlet_id: string | null;
  outlet_name: string | null;
  outlet_code: string | null;
  created_at?: string;
}

export interface RoleItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  permission_count?: number;
  permissions?: string[];
}

export interface PermissionItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  module: string;
  created_at?: string;
}

export interface RolePermissionItem {
  role_id: string;
  permission_id: string;
}

// Phase 2A: POS & Etalase types
export interface ServiceCategoryItem {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  service_count?: number;
}

export interface ServiceOutletItem {
  service_id: string;
  outlet_id: string;
  selling_price: number;
  is_active: boolean;
  outlet_name?: string;
  outlet_code?: string;
}

export interface ServiceConsumptionItem {
  id: string;
  service_id: string;
  product_id: string;
  quantity: number;
  is_active: boolean;
  product_name?: string;
  product_sku?: string;
  product_base_unit?: string;
}

export interface ServiceItem {
  id: string;
  category_id: string;
  category_name?: string;
  code: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  default_cost_price: number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  service_outlets?: ServiceOutletItem[];
  consumptions?: ServiceConsumptionItem[];
}

export interface ProductCategoryItem {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  product_count?: number;
}

export interface ProductOutletItem {
  product_id: string;
  outlet_id: string;
  selling_price: number;
  is_active: boolean;
  outlet_name?: string;
  outlet_code?: string;
}

export interface ProductUnitConversionItem {
  id: string;
  product_id: string;
  unit_name: string;
  multiplier_to_base: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ProductItem {
  id: string;
  category_id: string;
  category_name?: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  base_unit: string;
  default_cost_price: number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  product_outlets?: ProductOutletItem[];
  conversions?: ProductUnitConversionItem[];
}

export interface FinancialAccountItem {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  is_active: boolean;
}

export interface PaymentMethodItem {
  id: string;
  code: string;
  name: string;
  type: string;
  financial_account_id: string | null;
  financial_account_code?: string;
  financial_account_name?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}
