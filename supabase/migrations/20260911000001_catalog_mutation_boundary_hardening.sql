-- ====================================================================
-- CATALOG MUTATION BOUNDARY HARDENING
-- Phase 2A final security boundary
--
-- Catalog reads remain available to authenticated users.
-- Catalog INSERT/UPDATE/DELETE must go through SECURITY DEFINER RPCs:
--   save_service
--   save_service_category
--   save_service_outlet
--   save_service_consumption
--   save_product
--   save_product_category
--   save_product_outlet
--   save_product_unit_conversion
--   save_payment_method
-- ====================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE services, service_categories, service_outlets, service_consumptions,
          products, product_categories, product_outlets, product_unit_conversions,
          payment_methods
FROM authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE services, service_categories, service_outlets, service_consumptions,
          products, product_categories, product_outlets, product_unit_conversions,
          payment_methods
FROM anon;

COMMENT ON TABLE services IS 'Catalog service master. Mutations must use save_service RPC.';
COMMENT ON TABLE service_categories IS 'Catalog service categories. Mutations must use save_service_category RPC.';
COMMENT ON TABLE service_outlets IS 'Per-outlet service pricing/status. Mutations must use save_service_outlet RPC.';
COMMENT ON TABLE service_consumptions IS 'Service material consumption configuration. Mutations must use save_service_consumption RPC.';
COMMENT ON TABLE products IS 'Catalog product master. Mutations must use save_product RPC.';
COMMENT ON TABLE product_categories IS 'Catalog product categories. Mutations must use save_product_category RPC.';
COMMENT ON TABLE product_outlets IS 'Per-outlet product pricing/status. Mutations must use save_product_outlet RPC.';
COMMENT ON TABLE product_unit_conversions IS 'Product unit conversion configuration. Mutations must use save_product_unit_conversion RPC.';
COMMENT ON TABLE payment_methods IS 'Payment methods. Mutations must use save_payment_method RPC.';
