export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string; // e.g. "VOID_SALE", "STOCK_ADJUSTMENT", "CLOSE_SESSION"
  entity_type: string; // e.g. "sales", "outlet_inventory", "journal_entries"
  entity_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}
