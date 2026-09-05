export interface Outlet {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  timezone: string;
  is_active: boolean;
}

export interface CashierProfile {
  id: string;
  auth_user_id: string;
  display_name: string;
  phone?: string | null;
  employee_id?: string | null;
  role_code?: string;
}

export interface BarberEmployee {
  id: string;
  employee_code: string;
  full_name: string;
  position: string;
  is_active: boolean;
}

export interface CatalogItem {
  id: string;
  type: 'SERVICE' | 'PRODUCT';
  code: string; // service code or product sku
  name: string;
  description?: string | null;
  selling_price: number;
  duration_minutes?: number; // for services
  stock_quantity?: number; // for products
  category_name?: string;
  barcode?: string | null;
}

export interface CartLineItem {
  cart_item_id: string; // unique key in cart
  item_type: 'SERVICE' | 'PRODUCT';
  service_id?: string;
  product_id?: string;
  barber_id?: string;
  barber_name?: string;
  description_snapshot: string;
  quantity: number;
  unit_price: number;
  item_discount_amount: number;
}

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  type: string; // 'CASH' | 'QRIS' | 'BANK_TRANSFER' | 'EDC'
  is_active: boolean;
}

export interface PaymentSplit {
  payment_method_id: string;
  payment_method_name: string;
  payment_type: string;
  amount: number;
  reference_number?: string;
}

export interface CashRegister {
  id: string;
  outlet_id: string;
  name: string;
  is_active: boolean;
}

export interface CashSession {
  id: string;
  cash_register_id: string;
  opened_by: string;
  opened_at: string;
  opening_balance: number;
  closed_by?: string | null;
  closed_at?: string | null;
  closing_balance?: number | null;
  status: 'OPEN' | 'CLOSED';
}

export interface BusinessSettings {
  business_name: string;
  legal_name?: string | null;
  phone?: string | null;
  email?: string | null;
  currency: string;
  timezone: string;
  tax_enabled: boolean;
  tax_rate: number;
  tax_inclusive: boolean;
}

export interface ProcessSaleResult {
  success: boolean;
  sale_id: string;
  invoice_number: string;
  total_amount: number;
  is_duplicate?: boolean;
}

export interface CompletedSale {
  id: string;
  invoice_number: string;
  outlet_id: string;
  outlet_name: string;
  cashier_name: string;
  customer_name?: string;
  sold_at: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  tendered_amount?: number;
  change_amount?: number;
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total_amount: number;
    item_type: string;
    barber_name?: string;
  }>;
  payments: Array<{
    method_name: string;
    amount: number;
    reference_number?: string;
  }>;
}
