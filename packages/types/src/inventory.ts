export type MovementType =
  | 'OPENING'
  | 'PURCHASE'
  | 'SALE'
  | 'SERVICE_CONSUMPTION'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'RETURN_IN'
  | 'RETURN_OUT';

export interface OutletInventory {
  id: string;
  outlet_id: string;
  product_id: string;
  quantity: number; // NUMERIC(18,4)
  average_cost: number; // NUMERIC(18,2)
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  outlet_id: string;
  product_id: string;
  movement_type: MovementType;
  quantity: number; // delta: NUMERIC(18,4)
  unit_cost: number; // NUMERIC(18,2)
  quantity_before: number;
  quantity_after: number;
  reference_type: string; // e.g. "SALE", "PURCHASE", "ADJUSTMENT", "TRANSFER"
  reference_id: string;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PurchaseStatus = 'DRAFT' | 'RECEIVED' | 'CANCELLED';
export type PurchasePaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export interface Purchase {
  id: string;
  purchase_number: string;
  outlet_id: string;
  supplier_id: string | null;
  status: PurchaseStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_status: PurchasePaymentStatus;
  purchased_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  purchase_id: string | null;
  payment_method_id: string | null;
  financial_account_id: string;
  amount: number;
  reference_number: string | null;
  paid_at: string;
  created_by: string | null;
  created_at: string;
}

export type StockAdjustmentStatus = 'DRAFT' | 'APPROVED' | 'APPLIED' | 'CANCELLED';

export interface StockAdjustment {
  id: string;
  adjustment_number: string;
  outlet_id: string;
  reason: string;
  status: StockAdjustmentStatus;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
}

export interface StockAdjustmentItem {
  id: string;
  adjustment_id: string;
  product_id: string;
  quantity_before: number;
  quantity_after: number;
  quantity_delta: number;
  unit_cost: number;
  reason: string | null;
}

export type StockTransferStatus = 'REQUESTED' | 'APPROVED' | 'COMPLETED' | 'CANCELLED';

export interface StockTransfer {
  id: string;
  transfer_number: string;
  from_outlet_id: string;
  to_outlet_id: string;
  status: StockTransferStatus;
  requested_by: string | null;
  approved_by: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface StockTransferItem {
  id: string;
  transfer_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
}
