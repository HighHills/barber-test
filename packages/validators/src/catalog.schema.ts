import { z } from 'zod';

export const createServiceSchema = z.object({
  category_id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  duration_minutes: z.number().int().positive(),
  default_cost_price: z.number().nonnegative().nullable().optional(),
  is_active: z.boolean().default(true),
});

export const setServiceOutletPriceSchema = z.object({
  service_id: z.string().uuid(),
  outlet_id: z.string().uuid(),
  selling_price: z.number().positive(),
  is_active: z.boolean().default(true),
});

export const createProductSchema = z.object({
  category_id: z.string().uuid(),
  sku: z.string().min(1).max(50),
  barcode: z.string().max(100).nullable().optional(),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  base_unit: z.string().min(1).max(20),
  default_cost_price: z.number().nonnegative().nullable().optional(),
  is_active: z.boolean().default(true),
});

export const setProductOutletPriceSchema = z.object({
  product_id: z.string().uuid(),
  outlet_id: z.string().uuid(),
  selling_price: z.number().positive(),
  is_active: z.boolean().default(true),
});

export const createServiceConsumptionSchema = z.object({
  service_id: z.string().uuid(),
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  is_active: z.boolean().default(true),
});
