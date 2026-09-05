import { z } from 'zod';

export const createSaleItemSchema = z.object({
  item_type: z.enum(['SERVICE', 'PRODUCT']),
  service_id: z.string().uuid().nullable().optional(),
  product_id: z.string().uuid().nullable().optional(),
  barber_id: z.string().uuid().nullable().optional(),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  item_discount_amount: z.number().nonnegative().default(0),
}).refine(
  (data) => {
    if (data.item_type === 'SERVICE') {
      return Boolean(data.service_id) && !data.product_id;
    }
    if (data.item_type === 'PRODUCT') {
      return Boolean(data.product_id) && !data.service_id;
    }
    return false;
  },
  {
    message: 'SERVICE must have service_id only, PRODUCT must have product_id only',
  }
);

export const createSalePaymentSchema = z.object({
  payment_method_id: z.string().uuid(),
  amount: z.number().positive(),
  reference_number: z.string().nullable().optional(),
});

export const checkoutPosSaleSchema = z.object({
  idempotency_key: z.string().min(1, 'Idempotency key is required'),
  outlet_id: z.string().uuid('Valid outlet_id is required'),
  cash_session_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  items: z.array(createSaleItemSchema).min(1, 'At least one item is required'),
  payments: z.array(createSalePaymentSchema).min(1, 'At least one payment is required'),
  discount_amount: z.number().nonnegative().default(0),
  discount_reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const createRefundItemSchema = z.object({
  sale_item_id: z.string().uuid(),
  quantity: z.number().positive(),
  refund_amount: z.number().positive(),
  return_to_inventory: z.boolean().default(true),
  reason: z.string().nullable().optional(),
});

export const processSaleRefundSchema = z.object({
  sale_id: z.string().uuid(),
  outlet_id: z.string().uuid(),
  refund_type: z.enum(['FULL', 'PARTIAL']),
  items: z.array(createRefundItemSchema).min(1, 'At least one refund item required'),
  reason: z.string().min(1, 'Refund reason is required'),
});

export type CreateSaleItemInput = z.infer<typeof createSaleItemSchema>;
export type CreateSalePaymentInput = z.infer<typeof createSalePaymentSchema>;
export type CheckoutPosSaleInput = z.infer<typeof checkoutPosSaleSchema>;
export type ProcessSaleRefundInput = z.infer<typeof processSaleRefundSchema>;
