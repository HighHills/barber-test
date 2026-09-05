import type { CommissionType } from './pos.js';

export interface CommissionRule {
  id: string;
  employee_id: string | null;
  service_id: string | null;
  product_id: string | null;
  outlet_id: string | null;
  commission_type: CommissionType;
  commission_rate: number | null; // e.g. 40.00 for 40%
  fixed_amount: number | null;     // e.g. 20000.00
  effective_from: string;          // "YYYY-MM-DD"
  effective_until: string | null;  // "YYYY-MM-DD"
  priority: number;               // 1 (Highest: Employee+Service+Outlet) to 8 (Lowest: Business Default)
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CommissionStatus = 'EARNED' | 'PAYABLE' | 'PAID' | 'VOIDED';

export interface Commission {
  id: string;
  sale_id: string;
  sale_item_id: string;
  employee_id: string;
  outlet_id: string;
  commission_type: CommissionType;
  commission_rate: number | null;
  commission_amount: number;
  status: CommissionStatus;
  earned_at: string;
  paid_at: string | null;
  created_at: string;
}
