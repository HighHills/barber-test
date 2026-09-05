export interface ServiceCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  category_id: string;
  code: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  default_cost_price: number | null; // fallback reference only
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceOutlet {
  service_id: string;
  outlet_id: string;
  selling_price: number; // NUMERIC(18,2)
  is_active: boolean;
}

export interface ServiceConsumption {
  id: string;
  service_id: string;
  product_id: string;
  quantity: number; // NUMERIC(18,4) base stock unit
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  category_id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  base_unit: string; // e.g. "pcs", "ml", "gram", "bottle"
  default_cost_price: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductOutlet {
  product_id: string;
  outlet_id: string;
  selling_price: number; // NUMERIC(18,2)
  is_active: boolean;
}

export interface ProductUnitConversion {
  id: string;
  product_id: string;
  unit_name: string; // e.g. "box"
  multiplier_to_base: number; // e.g. 12 (means 1 box = 12 pcs)
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
