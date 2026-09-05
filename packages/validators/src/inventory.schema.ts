import { z } from 'zod';

export const createStockAdjustmentSchema = z.object({
  outlet_id: z.string().uuid(),
  reason: z.string().min(1),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity_after: z.number().nonnegative(),
    reason: z.string().nullable().optional(),
  })).min(1, 'At least one item required'),
});

export const createStockTransferSchema = z.object({
  from_outlet_id: z.string().uuid(),
  to_outlet_id: z.string().uuid(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().positive(),
  })).min(1, 'At least one item required'),
}).refine(
  (data) => data.from_outlet_id !== data.to_outlet_id,
  { message: 'Source and destination outlet cannot be the same' }
);

export const createPurchaseSchema = z.object({
  outlet_id: z.string().uuid(),
  supplier_id: z.string().uuid().nullable().optional(),
  purchased_at: z.string(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().positive(),
    unit_cost: z.number().positive(),
    discount_amount: z.number().nonnegative().default(0),
    tax_amount: z.number().nonnegative().default(0),
  })).min(1),
  discount_amount: z.number().nonnegative().default(0),
  tax_amount: z.number().nonnegative().default(0),
});
