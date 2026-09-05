import { roundMoney } from './rounding.js';

export interface CartItemInput {
  id?: string;
  item_type: 'SERVICE' | 'PRODUCT';
  service_id?: string | null;
  product_id?: string | null;
  barber_id?: string | null;
  description_snapshot: string;
  quantity: number;
  unit_price: number;
  item_discount_amount?: number;
}

export interface CalculatedItem {
  id?: string;
  item_type: 'SERVICE' | 'PRODUCT';
  service_id?: string | null;
  product_id?: string | null;
  barber_id?: string | null;
  description_snapshot: string;
  quantity: number;
  unit_price: number;
  gross_subtotal: number;
  item_discount_amount: number;
  allocated_discount_amount: number;
  net_amount: number; // after both item and allocated discount
  tax_amount: number;
  total_amount: number; // final customer-facing charge for this line
}

export interface CartCalculationResult {
  items: CalculatedItem[];
  subtotal: number; // sum of gross subtotals
  total_item_discount: number;
  sale_discount: number;
  total_discount: number;
  tax_amount: number;
  total_amount: number;
}

export interface CartCalculatorParams {
  items: CartItemInput[];
  sale_discount?: number;
  tax_enabled: boolean;
  tax_rate: number; // e.g. 11 for 11%
  tax_inclusive: boolean;
}

export function calculateCart(params: CartCalculatorParams): CartCalculationResult {
  const {
    items,
    sale_discount = 0,
    tax_enabled,
    tax_rate,
    tax_inclusive,
  } = params;

  if (items.length === 0) {
    return {
      items: [],
      subtotal: 0,
      total_item_discount: 0,
      sale_discount: 0,
      total_discount: 0,
      tax_amount: 0,
      total_amount: 0,
    };
  }

  // Step 1: Initial item subtotals and direct discounts
  const preliminaryItems = items.map((item) => {
    const gross_subtotal = roundMoney(item.quantity * item.unit_price);
    const item_discount = roundMoney(Math.min(gross_subtotal, item.item_discount_amount || 0));
    const net_before_global = roundMoney(gross_subtotal - item_discount);
    return {
      ...item,
      gross_subtotal,
      item_discount,
      net_before_global,
    };
  });

  const sumGrossSubtotal = roundMoney(preliminaryItems.reduce((acc, i) => acc + i.gross_subtotal, 0));
  const sumItemDiscount = roundMoney(preliminaryItems.reduce((acc, i) => acc + i.item_discount, 0));
  const sumNetBeforeGlobal = roundMoney(preliminaryItems.reduce((acc, i) => acc + i.net_before_global, 0));

  // Step 2: Pro-rate global sale-level discount
  const validSaleDiscount = roundMoney(Math.min(sumNetBeforeGlobal, Math.max(0, sale_discount)));
  let allocatedDiscounts: number[] = [];

  if (sumNetBeforeGlobal > 0 && validSaleDiscount > 0) {
    let allocatedSum = 0;
    allocatedDiscounts = preliminaryItems.map((item, idx) => {
      if (idx === preliminaryItems.length - 1) {
        // Assign remainder to the last item to prevent rounding mismatch
        const remainder = roundMoney(validSaleDiscount - allocatedSum);
        return remainder;
      }
      const share = roundMoney((item.net_before_global / sumNetBeforeGlobal) * validSaleDiscount);
      allocatedSum = roundMoney(allocatedSum + share);
      return share;
    });
  } else {
    allocatedDiscounts = preliminaryItems.map(() => 0);
  }

  // Step 3: Tax and line totals
  let totalTax = 0;

  const calculatedItems: CalculatedItem[] = preliminaryItems.map((item, idx) => {
    const allocated_discount = allocatedDiscounts[idx] || 0;
    const net_amount = roundMoney(item.net_before_global - allocated_discount);

    let lineTax = 0;
    let lineTotal = net_amount;

    if (tax_enabled && tax_rate > 0) {
      if (tax_inclusive) {
        // Price already includes tax: tax = net_amount - (net_amount / (1 + rate/100))
        lineTax = roundMoney(net_amount - net_amount / (1 + tax_rate / 100));
        lineTotal = net_amount; // customer pays net_amount
      } else {
        // Tax is added on top of net_amount
        lineTax = roundMoney(net_amount * (tax_rate / 100));
        lineTotal = roundMoney(net_amount + lineTax);
      }
    }

    totalTax = roundMoney(totalTax + lineTax);

    return {
      id: item.id,
      item_type: item.item_type,
      service_id: item.service_id,
      product_id: item.product_id,
      barber_id: item.barber_id,
      description_snapshot: item.description_snapshot,
      quantity: item.quantity,
      unit_price: item.unit_price,
      gross_subtotal: item.gross_subtotal,
      item_discount_amount: item.item_discount,
      allocated_discount_amount: allocated_discount,
      net_amount,
      tax_amount: lineTax,
      total_amount: lineTotal,
    };
  });

  const totalDiscount = roundMoney(sumItemDiscount + validSaleDiscount);
  const finalTotalAmount = roundMoney(calculatedItems.reduce((acc, i) => acc + i.total_amount, 0));

  return {
    items: calculatedItems,
    subtotal: sumGrossSubtotal,
    total_item_discount: sumItemDiscount,
    sale_discount: validSaleDiscount,
    total_discount: totalDiscount,
    tax_amount: totalTax,
    total_amount: finalTotalAmount,
  };
}
