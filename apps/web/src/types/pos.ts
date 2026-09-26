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
  role_name?: string;
  assigned_outlet_id?: string | null;
}

export interface CashierSubAccountItem {
  id: string;
  display_name: string;
  phone?: string | null;
  role_code: string;
  role_name: string;
  outlet_id: string;
  outlet_name: string;
  outlet_code: string;
  is_active: boolean;
  created_at: string;
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
  category_id?: string;
  barcode?: string | null;
  base_unit?: string;
  is_active?: boolean;
}

export interface CatalogFormData {
  id?: string;
  type: 'SERVICE' | 'PRODUCT';
  name: string;
  code: string;
  category_name: string;
  selling_price: number;
  duration_minutes?: number;
  base_unit?: string;
  barcode?: string;
  initial_stock?: number;
  description?: string;
  is_active?: boolean;
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
  customer_id?: string | null;
  customer_phone?: string | null;
  customer_tier?: string | null;
  customer_points?: number | null;
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

export interface VoidSaleParams {
  sale_id: string;
  voided_by: string;
  reason: string;
}

export interface VoidSaleResult {
  success: boolean;
  sale_id: string;
  status: string;
  reversed_journal_id?: string;
  message?: string;
}

export interface RefundableSaleItem {
  id: string;
  sale_id: string;
  item_type: 'SERVICE' | 'PRODUCT';
  description_snapshot: string;
  original_quantity: number;
  refunded_quantity: number;
  remaining_quantity: number;
  unit_price: number;
  item_discount_amount: number;
  allocated_discount_amount: number;
  tax_amount: number;
  total_amount: number;
  cost_price: number | null;
  barber_id: string | null;
  product_id: string | null;
  service_id: string | null;
}

export interface RefundItemSelection {
  sale_item_id: string;
  quantity: number;
  return_to_inventory: boolean;
  reason?: string;
}

export interface ProcessRefundResult {
  success: boolean;
  refund_id: string;
  journal_id?: string;
  sale_status: 'REFUNDED' | 'PARTIALLY_REFUNDED';
  status: string;
  message?: string;
}

export interface InventoryProductView {
  id: string; // product_id
  sku: string;
  name: string;
  category_name?: string;
  selling_price: number;
  quantity: number;
  average_cost: number;
  total_asset_value: number;
  status: 'SAFE' | 'LOW' | 'OUT_OF_STOCK';
}

export interface StockAdjustmentView {
  id: string;
  adjustment_number: string;
  outlet_id: string;
  reason: string;
  status: string;
  created_by?: string;
  approved_by?: string;
  creator_name?: string;
  approver_name?: string;
  created_at: string;
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    quantity_before: number;
    quantity_after: number;
    quantity_delta: number;
    unit_cost: number;
    reason?: string;
  }>;
}

export interface StockTransferView {
  id: string;
  transfer_number: string;
  from_outlet_id: string;
  to_outlet_id: string;
  from_outlet_name: string;
  to_outlet_name: string;
  status: string;
  requested_by?: string;
  approved_by?: string;
  requester_name?: string;
  approver_name?: string;
  completed_at?: string;
  created_at: string;
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_cost: number;
  }>;
}

export interface InventoryMovementView {
  id: string;
  product_id: string;
  product_name: string;
  movement_type: string;
  quantity: number;
  unit_cost: number;
  quantity_before: number;
  quantity_after: number;
  reference_type: string;
  reference_id: string;
  occurred_at: string;
  created_by_name?: string;
}

export type QueueStatus = 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'ARRIVED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface CustomerOption {
  id: string;
  customer_code: string;
  full_name: string;
  phone: string;
  email?: string | null;
}

export interface QueueItemView {
  id: string;
  queue_number: number;
  outlet_id: string;
  customer_id: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  appointment_id: string | null;
  barber_id: string | null;
  barber_name?: string | null;
  status: QueueStatus;
  joined_at: string;
  called_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  service_id?: string | null;
  service_name?: string | null;
  service_price?: number | null;
}

export interface AppointmentView {
  id: string;
  appointment_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  guest_customer_name?: string | null;
  guest_customer_phone?: string | null;
  guest_customer_email?: string | null;
  outlet_id: string;
  service_id: string;
  service_name: string;
  service_duration: number;
  barber_id: string;
  barber_name: string;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
}

export type CommissionType = 'PERCENTAGE' | 'FIXED' | 'TIERED';
export type CommissionStatus = 'EARNED' | 'PAYABLE' | 'PAID' | 'VOIDED';

export interface CommissionRuleView {
  id: string;
  employee_id: string | null;
  employee_name?: string | null;
  service_id: string | null;
  service_name?: string | null;
  product_id: string | null;
  product_name?: string | null;
  outlet_id: string | null;
  outlet_name?: string | null;
  commission_type: CommissionType;
  commission_rate: number | null;
  fixed_amount: number | null;
  effective_from: string;
  effective_until: string | null;
  priority: number;
  is_active: boolean;
  tier: number;
}

export interface CommissionItemView {
  id: string;
  sale_id: string;
  invoice_number: string;
  employee_id: string;
  employee_name: string;
  outlet_id: string;
  outlet_name?: string;
  item_name: string;
  item_type: 'SERVICE' | 'PRODUCT';
  line_total: number;
  commission_type: CommissionType;
  commission_rate: number | null;
  commission_amount: number;
  status: CommissionStatus;
  earned_at: string;
  paid_at: string | null;
}

export interface BarberCommissionSummary {
  employee_id: string;
  employee_name: string;
  position: string;
  total_services_count: number;
  total_sales_volume: number;
  total_earned_amount: number;
  total_paid_amount: number;
  unpaid_amount: number;
  last_earned_at: string | null;
}

// ---------------------------------------------------------------------------
// Phase 5: Financial Accounting, Trial Balance, P&L, Balance Sheet, & Sessions
// ---------------------------------------------------------------------------

export type FinancialAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type NormalBalance = 'DEBIT' | 'CREDIT';

export interface FinancialAccountBalanceView {
  id: string;
  account_code: string;
  account_name: string;
  account_type: FinancialAccountType;
  normal_balance: NormalBalance;
  is_system: boolean;
  is_active: boolean;
  total_debit: number;
  total_credit: number;
  net_balance: number;
}

export interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  account_type: FinancialAccountType;
  normal_balance: NormalBalance;
  debit_amount: number;
  credit_amount: number;
}

export interface IncomeStatementData {
  service_revenue: number;
  product_revenue: number;
  gross_revenue: number;
  discounts_refunds: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin_percent: number;
  commission_expense: number;
  inventory_loss_expense: number;
  merchant_fee_expense: number;
  other_operating_expenses: number;
  total_operating_expenses: number;
  net_operating_profit: number;
  net_profit_margin_percent: number;
}

export interface BalanceSheetData {
  current_assets: Array<{
    code: string;
    name: string;
    amount: number;
  }>;
  total_assets: number;
  current_liabilities: Array<{
    code: string;
    name: string;
    amount: number;
  }>;
  total_liabilities: number;
  equity: Array<{
    code: string;
    name: string;
    amount: number;
  }>;
  current_period_earnings: number;
  total_equity: number;
  total_liabilities_and_equity: number;
  is_balanced: boolean;
  discrepancy: number;
}

export interface GeneralLedgerEntry {
  id: string;
  journal_entry_id: string;
  journal_date: string;
  journal_number: string;
  reference_type: string | null;
  reference_id: string | null;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export interface CashSessionDetailedReconciliation {
  session_id: string;
  register_id: string;
  register_name: string;
  outlet_id: string;
  outlet_name: string;
  cashier_id: string;
  cashier_name: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  cash_sales: number;
  cash_refunds: number;
  cash_payouts: number;
  expected_cash_balance: number;
  actual_closing_balance: number | null;
  discrepancy: number | null;
  total_sales_count: number;
  total_sales_amount: number;
  non_cash_payments: Array<{
    method_code: string;
    method_name: string;
    total_amount: number;
    transaction_count: number;
  }>;
  status: 'OPEN' | 'CLOSED';
}

export interface FinancialPeriodView {
  id: string;
  period_start: string;
  period_end: string;
  status: 'OPEN' | 'CLOSED';
  closed_at: string | null;
  closed_by: string | null;
  closed_by_name?: string | null;
  created_at: string;
}

export interface OpenCashSessionResult {
  success: boolean;
  session_id: string;
  cash_register_id: string;
  opened_by: string;
  opened_at: string;
  opening_balance: number;
  status: 'OPEN';
}

export interface CloseCashSessionResult {
  success: boolean;
  session_id: string;
  closed_by: string;
  closed_at: string;
  closing_balance: number;
  status: 'CLOSED';
}

export interface CloseFinancialPeriodResult {
  success: boolean;
  period_id: string;
  status: 'CLOSED';
  closed_by: string;
  closed_at: string;
}

// --- CRM, MEMBERSHIP & LOYALTY TYPES ---
export interface CustomerTierView {
  id: string;
  code: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | string;
  name: string;
  min_spending: number;
  min_visits: number;
  discount_percent_service: number;
  discount_percent_product: number;
  points_multiplier: number;
  color_hex: string;
  badge_icon: string;
  is_active: boolean;
}

export interface HaircutPreferenceData {
  fade_style?: string;
  clipper_guard_sides?: string;
  clipper_guard_top?: string;
  styling_product?: string;
  scalp_notes?: string;
}

export interface CustomerDetailCRM {
  id: string;
  customer_code: string;
  full_name: string;
  phone: string;
  email?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  tier_id?: string | null;
  tier_code?: string | null;
  tier_name?: string | null;
  tier_color?: string | null;
  tier_discount_service?: number;
  tier_discount_product?: number;
  current_loyalty_points: number;
  lifetime_loyalty_points: number;
  preferred_barber_id?: string | null;
  preferred_barber_name?: string | null;
  haircut_preferences?: HaircutPreferenceData | null;
  total_visits: number;
  total_spending: number;
  last_visit_at?: string | null;
  created_at: string;
}

export interface LoyaltyLedgerEntry {
  id: string;
  customer_id: string;
  customer_name?: string;
  outlet_id: string;
  outlet_name?: string;
  transaction_type: 'EARN' | 'REDEEM' | 'MANUAL_ADJUSTMENT' | 'BONUS';
  points_change: number;
  points_balance_after: number;
  sale_id?: string | null;
  invoice_number?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface HaircutHistoryEntry {
  id: string;
  customer_id: string;
  outlet_id: string;
  barber_id: string;
  barber_name: string;
  sale_id?: string | null;
  appointment_id?: string | null;
  style_name: string;
  clipper_guard_sides?: string | null;
  clipper_guard_top?: string | null;
  styling_product_used?: string | null;
  special_notes?: string | null;
  visit_date: string;
  created_at: string;
}

// ==========================================
// PHASE 7: EXECUTIVE ANALYTICS & BI TYPES
// ==========================================

export interface ExecutiveKPIStats {
  totalRevenue: number;
  netRevenue: number;
  serviceRevenue: number;
  productRevenue: number;
  totalTransactions: number;
  averageTicketValue: number;
  totalGuests: number;
  newGuestsCount: number;
  returningGuestsCount: number;
  retentionRatePercent: number;
  estimatedGrossProfit: number;
  grossProfitMarginPercent: number;
  revenueGrowthPercent?: number;
}

export interface OutletComparisonMetric {
  outletId: string;
  outletName: string;
  outletCode: string;
  totalRevenue: number;
  totalTransactions: number;
  averageTicketValue: number;
  serviceRevenue: number;
  productRevenue: number;
  productUpsellSharePercent: number;
  revenueSharePercent: number;
}

export interface RevenueTrendPoint {
  dateKey: string;
  dateLabel: string;
  serviceAmount: number;
  productAmount: number;
  totalAmount: number;
  transactionCount: number;
}

export interface PeakHourDataPoint {
  dayOfWeek: number; // 0: Sun, 1: Mon, ... 6: Sat
  dayName: string;
  hour: number; // 10 .. 21
  sessionCount: number;
  intensityScore: number; // 0..100 for color scaling
}

export interface BarberProductivityMetric {
  barberId: string;
  barberName: string;
  position: string;
  guestsCount: number;
  serviceRevenue: number;
  productRevenue: number;
  totalRevenue: number;
  upsellCount: number;
  upsellRatePercent: number;
}

export interface TopCatalogItemMetric {
  id: string;
  name: string;
  categoryName?: string;
  itemType: 'SERVICE' | 'PRODUCT';
  quantitySold: number;
  totalRevenue: number;
  revenueSharePercent: number;
}

