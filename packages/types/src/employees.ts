export interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  position: string;
  hire_date: string;
  termination_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeOutlet {
  employee_id: string;
  outlet_id: string;
  is_primary: boolean;
  is_active: boolean;
}

export interface EmployeeSchedule {
  id: string;
  employee_id: string;
  outlet_id: string;
  day_of_week: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  start_time: string; // "HH:MM:SS"
  end_time: string;   // "HH:MM:SS"
  break_start: string | null;
  break_end: string | null;
  is_active: boolean;
}

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface EmployeeLeave {
  id: string;
  employee_id: string;
  outlet_id: string;
  start_at: string;
  end_at: string;
  reason: string;
  status: LeaveStatus;
  created_by: string | null;
  created_at: string;
}
