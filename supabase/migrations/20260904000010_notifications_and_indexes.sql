-- 20260904000010_notifications_and_indexes.sql
-- Table 48: Notifications, and Comprehensive Domain Performance Indexes

-- 48. notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- Additional Crucial Composite Indexes for High Performance
CREATE INDEX idx_outlets_active ON outlets(is_active);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_services_code ON services(code);
CREATE INDEX idx_outlet_inventory_low_stock ON outlet_inventory(outlet_id, quantity);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
