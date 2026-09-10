export type SettingsSectionId =
  | 'business'
  | 'outlets'
  | 'staff'
  | 'schedules'
  | 'leaves'
  | 'subaccounts'
  | 'roles';

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
