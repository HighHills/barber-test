'use client';

import { useState, useMemo, useCallback } from 'react';
import { calculateCart, type CartCalculationResult, type CartItemInput } from '@barber/business-rules';
import type { CartLineItem, BusinessSettings, CustomerDetailCRM } from '../types/pos';

export function usePosCart(settings: BusinessSettings, customer?: CustomerDetailCRM | null) {
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [saleDiscount, setSaleDiscount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  // Add Item to Cart
  const addItem = useCallback((item: Omit<CartLineItem, 'cart_item_id'>) => {
    setItems((prev) => {
      // If it's a product, check if identical product already in cart
      if (item.item_type === 'PRODUCT') {
        const existingIdx = prev.findIndex(
          (p) => p.item_type === 'PRODUCT' && p.product_id === item.product_id
        );
        if (existingIdx >= 0) {
          const updated = [...prev];
          const cur = updated[existingIdx]!;
          updated[existingIdx] = {
            ...cur,
            quantity: cur.quantity + item.quantity,
          };
          return updated;
        }
      }

      // If it's a service with identical service_id and barber_id
      if (item.item_type === 'SERVICE') {
        const existingIdx = prev.findIndex(
          (s) =>
            s.item_type === 'SERVICE' &&
            s.service_id === item.service_id &&
            s.barber_id === item.barber_id
        );
        if (existingIdx >= 0) {
          const updated = [...prev];
          const cur = updated[existingIdx]!;
          updated[existingIdx] = {
            ...cur,
            quantity: cur.quantity + item.quantity,
          };
          return updated;
        }
      }

      // Otherwise, add new line item
      const newItem: CartLineItem = {
        ...item,
        cart_item_id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `item-${Date.now()}-${Math.random()}`,
      };
      return [...prev, newItem];
    });
  }, []);

  // Remove Item
  const removeItem = useCallback((cartItemId: string) => {
    setItems((prev) => prev.filter((i) => i.cart_item_id !== cartItemId));
  }, []);

  // Update Quantity
  const updateQuantity = useCallback((cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      removeItem(cartItemId);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.cart_item_id === cartItemId ? { ...i, quantity: newQty } : i))
    );
  }, [removeItem]);

  // Update Item Discount
  const updateItemDiscount = useCallback((cartItemId: string, discount: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.cart_item_id === cartItemId
          ? { ...i, item_discount_amount: Math.max(0, discount) }
          : i
      )
    );
  }, []);

  // Update Item Barber
  const updateItemBarber = useCallback(
    (cartItemId: string, barberId: string, barberName: string) => {
      setItems((prev) =>
        prev.map((i) =>
          i.cart_item_id === cartItemId
            ? { ...i, barber_id: barberId, barber_name: barberName }
            : i
        )
      );
    },
    []
  );

  // Clear Cart
  const clearCart = useCallback(() => {
    setItems([]);
    setSaleDiscount(0);
    setNotes('');
  }, []);

  // Authoritative Calculation via @barber/business-rules
  const calculation: CartCalculationResult = useMemo(() => {
    const inputItems: CartItemInput[] = items.map((i) => ({
      id: i.cart_item_id,
      item_type: i.item_type,
      service_id: i.service_id,
      product_id: i.product_id,
      barber_id: i.barber_id,
      description_snapshot: i.description_snapshot,
      quantity: i.quantity,
      unit_price: i.unit_price,
      item_discount_amount: i.item_discount_amount,
    }));

    return calculateCart({
      items: inputItems,
      customer_tier: customer
        ? {
            discount_percent_service: customer.tier_discount_service ?? 0,
            discount_percent_product: customer.tier_discount_product ?? 0,
          }
        : null,
      sale_discount: saleDiscount,
      tax_enabled: settings.tax_enabled,
      tax_rate: settings.tax_rate,
      tax_inclusive: settings.tax_inclusive,
    });
  }, [items, saleDiscount, settings, customer]);

  return {
    items,
    saleDiscount,
    notes,
    calculation,
    itemCount: items.reduce((acc, i) => acc + i.quantity, 0),
    addItem,
    removeItem,
    updateQuantity,
    updateItemDiscount,
    updateItemBarber,
    setSaleDiscount,
    setNotes,
    clearCart,
  };
}
