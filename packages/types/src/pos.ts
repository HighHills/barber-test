export interface CashRegister {
  id: string;
  outlet_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CashSessionStatus = 'OPEN' | 'CLOSED';

export interface CashSession {
  id: string;
  cash_register_id: string;
  opened_by: string;
  opened_at: string;
  opening_balance: number;
  closed_by: string | null;
  closed_at: string | null;
  closing_balance: number | null;
  status: CashSessionStatus;
}

export interface PaymentMethod {
  id: string;
  code: string; // 'CASH' | 'BANK_TRANSFER' | 'QRIS' | 'DEBIT' | 'CREDIT_CARD' | 'E_WALLET'
  name: string;
  type: string;
  is_active: boolean;
}

export type SaleStatus = 'COMPLETED' | 'REFUNDED' | 'VOIDED';
export type SaleItemType = 'SERVICE' | 'PRODUCT';
export type CommissionType = 'PERCENTAGE' | 'FIXED' | 'TIERED';

export interface Sale {
  id: string;
  invoice_number: string;
  outlet_id: string;
  customer_id: string | null;
  cash_session_id: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  status: SaleStatus;
  idempotency_key: string;
  sold_at: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  item_type: SaleItemType;
  service_id: string | null;
  product_id: string | null;
  barber_id: string | null;
  description_snapshot: string;
  quantity: number;
  unit_price: number;
  item_discount_amount: number;
  allocated_discount_amount: number;
  tax_amount: number;
  total_amount: number;
  cost_price: number | null;
  commission_type: CommissionType | null;
  commission_rate: number | null;
  commission_amount: number | null;
  created_at: string;
}

export interface SalePayment {
  id: string;
  sale_id: string;
  payment_method_id: string;
  amount: number;
  reference_number: string | null;
  paid_at: string;
}

export type RefundType = 'FULL' | 'PARTIAL';
export type RefundStatus = 'COMPLETED' | 'CANCELLED';

export interface SaleRefund {
  id: string;
  refund_number: string;
  sale_id: string;
  outlet_id: string;
  refund_type: RefundType;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  reason: string;
  status: RefundStatus;
  refunded_at: string;
  created_by: string;
  created_at: string;
}

export interface SaleRefundItem {
  id: string;
  refund_id: string;
  sale_item_id: string;
  quantity: number;
  refund_amount: number;
  tax_amount: number;
  cost_price: number | null;
  return_to_inventory: boolean;
  reason: string | null;
}
