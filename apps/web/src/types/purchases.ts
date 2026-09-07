// apps/web/src/types/purchases.ts
// Data contracts for Purchasing, Goods Receipt, Suppliers, and Accounts Payable (AP)

export type PurchaseStatus = 'DRAFT' | 'RECEIVED' | 'CANCELLED';
export type PurchasePaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export interface SupplierItem {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  is_active: boolean;
  created_at?: string;
  total_purchases?: number;
  unpaid_balance?: number;
}

export interface PurchaseLineItem {
  id?: string;
  purchase_id?: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  quantity: number;
  unit_cost: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount: number;
}

export interface SupplierPaymentItem {
  id: string;
  supplier_id: string;
  supplier_name?: string;
  purchase_id?: string | null;
  purchase_number?: string;
  payment_method_id?: string | null;
  financial_account_id?: string | null;
  account_name?: string;
  amount: number;
  reference_number?: string | null;
  paid_at: string;
  created_by?: string | null;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_number: string;
  outlet_id: string;
  outlet_name?: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  supplier_phone?: string | null;
  status: PurchaseStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_status: PurchasePaymentStatus;
  total_paid?: number;
  remaining_debt?: number;
  purchased_at: string;
  created_by?: string | null;
  creator_name?: string | null;
  items?: PurchaseLineItem[];
  payments?: SupplierPaymentItem[];
}

export interface CreatePurchasePayload {
  outlet_id: string;
  supplier_id: string;
  items: Array<{
    product_id: string;
    quantity: number;
    unit_cost: number;
    discount_amount?: number;
    tax_amount?: number;
  }>;
  discount_amount?: number;
  tax_amount?: number;
  notes?: string;
  auto_receive?: boolean;
}

export interface RecordPaymentPayload {
  purchase_id: string;
  amount: number;
  financial_account_id?: string;
  reference_number?: string;
  notes?: string;
}
