'use client';

import React, { useState } from 'react';
import { usePos } from '../../context/pos-context';
import type { CartLineItem } from '../../types/pos';
import type { CartCalculationResult } from '@barber/business-rules';
import { formatCurrency } from '../../lib/formatters';
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  Scissors,
  Tag,
  CreditCard,
  Lock,
} from 'lucide-react';

interface CartPanelProps {
  items: CartLineItem[];
  calculation: CartCalculationResult;
  saleDiscount: number;
  notes: string;
  onUpdateQuantity: (id: string, qty: number) => void;
  onUpdateItemDiscount: (id: string, discount: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
  onSetSaleDiscount: (amount: number) => void;
  onSetNotes: (notes: string) => void;
  onProceedCheckout: () => void;
  onOpenSessionRequired: () => void;
}

export function CartPanel({
  items,
  calculation,
  saleDiscount,
  notes,
  onUpdateQuantity,
  onUpdateItemDiscount,
  onRemoveItem,
  onClearCart,
  onSetSaleDiscount,
  onSetNotes,
  onProceedCheckout,
  onOpenSessionRequired,
}: CartPanelProps): React.JSX.Element {
  const { activeSession, businessSettings } = usePos();
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [showNotesInput, setShowNotesInput] = useState(false);
  const [editingItemDiscountId, setEditingItemDiscountId] = useState<string | null>(null);

  const isCartEmpty = items.length === 0;

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 shadow-xs">
      {/* Panel Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-bold text-slate-900">Nota Pesanan</h2>
          <span className="text-xs bg-slate-200 text-slate-700 font-semibold px-2 py-0.5 rounded-full">
            {items.reduce((acc, i) => acc + i.quantity, 0)} item
          </span>
        </div>

        {!isCartEmpty && (
          <button
            onClick={onClearCart}
            className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors flex items-center gap-1 font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Kosongkan</span>
          </button>
        )}
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isCartEmpty ? (
          <div className="flex flex-col items-center justify-center h-64 text-center text-slate-400">
            <ShoppingBag className="w-12 h-12 text-slate-300 mb-2 stroke-1" />
            <p className="text-sm font-semibold text-slate-700">Keranjang Masih Kosong</p>
            <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
              Pilih layanan cukur atau produk ritel dari katalog di sebelah kiri.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const isService = item.item_type === 'SERVICE';
            const calcItem = calculation.items.find((c) => c.id === item.cart_item_id);
            const lineTotal = calcItem ? calcItem.total_amount : item.quantity * item.unit_price;

            return (
              <div
                key={item.cart_item_id}
                className="p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all space-y-2"
              >
                {/* Item Info Line */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                          isService
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {isService ? 'Layanan' : 'Produk'}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {item.description_snapshot}
                      </h4>
                    </div>

                    {isService && item.barber_name && (
                      <div className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
                        <Scissors className="w-3 h-3 text-amber-600" />
                        <span>Barber: <strong>{item.barber_name}</strong></span>
                      </div>
                    )}

                    <div className="text-[11px] text-slate-500 font-mono">
                      {formatCurrency(item.unit_price)} / unit
                    </div>
                  </div>

                  <button
                    onClick={() => onRemoveItem(item.cart_item_id)}
                    className="text-slate-300 hover:text-red-500 p-1 rounded transition-colors"
                    title="Hapus baris item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Controls & Line Total */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  {/* Quantity Control Buttons */}
                  <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                    <button
                      onClick={() => onUpdateQuantity(item.cart_item_id, item.quantity - 1)}
                      className="p-1.5 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-8 text-center text-xs font-bold text-slate-900 font-mono">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(item.cart_item_id, item.quantity + 1)}
                      className="p-1.5 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Line Total */}
                  <div className="text-right">
                    {item.item_discount_amount > 0 && (
                      <div className="text-[10px] text-red-500 line-through">
                        {formatCurrency(item.quantity * item.unit_price)}
                      </div>
                    )}
                    <div className="text-xs font-bold text-slate-900 font-mono">
                      {formatCurrency(lineTotal)}
                    </div>
                  </div>
                </div>

                {/* Optional Item Discount */}
                {editingItemDiscountId === item.cart_item_id ? (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-slate-500">Diskon (Rp):</span>
                    <input
                      type="number"
                      min={0}
                      max={item.quantity * item.unit_price}
                      value={item.item_discount_amount || ''}
                      onChange={(e) =>
                        onUpdateItemDiscount(item.cart_item_id, Number(e.target.value) || 0)
                      }
                      placeholder="0"
                      className="w-24 px-2 py-1 text-xs border border-slate-300 rounded font-mono"
                    />
                    <button
                      onClick={() => setEditingItemDiscountId(null)}
                      className="text-[11px] text-slate-600 font-semibold px-2 py-0.5 hover:bg-slate-100 rounded"
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingItemDiscountId(item.cart_item_id)}
                    className="text-[10px] text-slate-400 hover:text-amber-600 flex items-center gap-1 font-medium"
                  >
                    <Tag className="w-2.5 h-2.5" />
                    <span>
                      {item.item_discount_amount > 0
                        ? `Diskon Item: ${formatCurrency(item.item_discount_amount)} (Ubah)`
                        : '+ Beri Diskon Item'}
                    </span>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Financial Calculations & Summary */}
      {!isCartEmpty && (
        <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2 text-xs">
          {/* Subtotal */}
          <div className="flex items-center justify-between text-slate-600">
            <span>Subtotal</span>
            <span className="font-mono font-medium">{formatCurrency(calculation.subtotal)}</span>
          </div>

          {/* Item Discounts */}
          {calculation.total_item_discount > 0 && (
            <div className="flex items-center justify-between text-red-600">
              <span>Diskon Item</span>
              <span className="font-mono font-medium">
                -{formatCurrency(calculation.total_item_discount)}
              </span>
            </div>
          )}

          {/* Global Sale Discount */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-slate-600">
              <button
                onClick={() => setShowDiscountInput(!showDiscountInput)}
                className="text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1"
              >
                <Tag className="w-3 h-3" />
                <span>Diskon Nota (Global)</span>
              </button>
              <span className="font-mono font-medium text-red-600">
                {calculation.sale_discount > 0 ? `-${formatCurrency(calculation.sale_discount)}` : 'Rp 0'}
              </span>
            </div>

            {showDiscountInput && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="number"
                  min={0}
                  value={saleDiscount || ''}
                  onChange={(e) => onSetSaleDiscount(Number(e.target.value) || 0)}
                  placeholder="Nominal diskon (Rp)"
                  className="flex-1 px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                />
                <button
                  onClick={() => onSetSaleDiscount(0)}
                  className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[11px] font-medium"
                >
                  Reset
                </button>
              </div>
            )}
          </div>

          {/* Tax / PPN if applicable */}
          {businessSettings.tax_enabled && (
            <div className="flex items-center justify-between text-slate-600">
              <span>
                Pajak PPN ({businessSettings.tax_rate}%)
                {businessSettings.tax_inclusive ? ' (Sudah Termasuk)' : ''}
              </span>
              <span className="font-mono font-medium">
                {formatCurrency(calculation.tax_amount)}
              </span>
            </div>
          )}

          {/* Grand Total */}
          <div className="pt-2 border-t border-slate-300/80 flex items-baseline justify-between">
            <div>
              <span className="text-sm font-bold text-slate-900 block leading-tight">
                Total Tagihan
              </span>
              <span className="text-[10px] text-slate-500">Harga resmi outlet</span>
            </div>
            <span className="text-xl font-extrabold text-slate-950 font-mono">
              {formatCurrency(calculation.total_amount)}
            </span>
          </div>

          {/* Notes Toggle */}
          <div className="pt-1">
            <button
              onClick={() => setShowNotesInput(!showNotesInput)}
              className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              <span>{notes ? 'Catatan: ' + notes.slice(0, 20) + '...' : '+ Tambah Catatan Nota'}</span>
            </button>
            {showNotesInput && (
              <textarea
                value={notes}
                onChange={(e) => onSetNotes(e.target.value)}
                placeholder="Catatan pesanan..."
                rows={2}
                className="w-full mt-1 p-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
              />
            )}
          </div>
        </div>
      )}

      {/* Panel Footer: Action Button */}
      <div className="p-4 bg-white border-t border-slate-200">
        {!activeSession ? (
          <button
            onClick={onOpenSessionRequired}
            className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            <span>Buka Sesi Kasir Dahulu</span>
          </button>
        ) : (
          <button
            onClick={onProceedCheckout}
            disabled={isCartEmpty}
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none text-white font-bold rounded-xl text-sm shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
          >
            <CreditCard className="w-4 h-4" />
            <span>
              {isCartEmpty
                ? 'Keranjang Kosong'
                : `Bayar Sekarang (${formatCurrency(calculation.total_amount)})`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
