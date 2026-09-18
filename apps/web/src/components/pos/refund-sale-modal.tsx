'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import { formatCurrency, formatDateTime } from '../../lib/formatters';
import type { ProcessRefundResult } from '../../types/pos';
import { refundService } from '../../services/refund-service';
import {
  RotateCcw,
  X,
  Loader2,
  AlertCircle,
  Package,
  Scissors,
  CheckSquare,
  Square,
} from 'lucide-react';

interface RefundSaleModalProps {
  isOpen: boolean;
  sale: any | null;
  onClose: () => void;
  onSuccess: (result: ProcessRefundResult) => void;
}

interface ItemRefundState {
  sale_item_id: string;
  selected: boolean;
  quantity: number;
  max_quantity: number;
  unit_price: number;
  unit_discount: number;
  unit_tax: number;
  cost_price: number | null;
  item_type: string;
  description: string;
  return_to_inventory: boolean;
}

const QUICK_REFUND_REASONS = [
  'Pelanggan membatalkan layanan',
  'Kualitas pengerjaan tidak sesuai',
  'Produk cacat / kemasan rusak',
  'Kelebihan hitung kasir',
  'Salah barang / tukar produk',
];

export function RefundSaleModal({
  isOpen,
  sale,
  onClose,
  onSuccess,
}: RefundSaleModalProps): React.JSX.Element | null {
  const { supabase, profile, paymentMethods } = usePos();

  const [refundMode, setRefundMode] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [itemsState, setItemsState] = useState<ItemRefundState[]>([]);
  const [reason, setReason] = useState<string>('');
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>('AUTO');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  // Generate fresh idempotency key on each modal open session (preserved across retries)
  useEffect(() => {
    if (isOpen) {
      setIdempotencyKey(crypto.randomUUID());
    } else {
      setIdempotencyKey('');
    }
  }, [isOpen]);

  // Initialize refundable items when sale changes
  useEffect(() => {
    if (!sale || !sale.sale_items) {
      setItemsState([]);
      return;
    }

    // Calculate prior refunds for each item
    const priorRefundedMap = new Map<string, number>();
    if (sale.sale_refunds && Array.isArray(sale.sale_refunds)) {
      for (const ref of sale.sale_refunds) {
        if (ref.status === 'COMPLETED' && ref.sale_refund_items) {
          for (const refItem of ref.sale_refund_items) {
            const current = priorRefundedMap.get(refItem.sale_item_id) || 0;
            priorRefundedMap.set(refItem.sale_item_id, current + Number(refItem.quantity || 0));
          }
        }
      }
    }

    const states: ItemRefundState[] = (sale.sale_items || [])
      .map((item: any) => {
        const origQty = Number(item.quantity) || 1;
        const refundedQty = priorRefundedMap.get(item.id) || 0;
        const remainingQty = Math.max(0, origQty - refundedQty);

        const totalDiscount =
          (Number(item.item_discount_amount) || 0) +
          (Number(item.allocated_discount_amount) || 0);
        const unitDiscount = totalDiscount / origQty;
        const unitTax = (Number(item.tax_amount) || 0) / origQty;

        return {
          sale_item_id: item.id,
          selected: remainingQty > 0,
          quantity: remainingQty,
          max_quantity: remainingQty,
          unit_price: Number(item.unit_price) || 0,
          unit_discount: unitDiscount,
          unit_tax: unitTax,
          cost_price: item.cost_price ? Number(item.cost_price) : null,
          item_type: item.item_type,
          description: item.description_snapshot,
          return_to_inventory: item.item_type === 'PRODUCT',
        };
      })
      .filter((s: ItemRefundState) => s.max_quantity > 0);

    setItemsState(states);
    setRefundMode('FULL');
    setReason('');
    setSelectedPaymentMethodId('AUTO');
    setErrorMsg(null);
  }, [sale]);

  // Handle Full vs Partial mode switch
  const handleModeChange = (mode: 'FULL' | 'PARTIAL') => {
    setRefundMode(mode);
    if (mode === 'FULL') {
      setItemsState((prev) =>
        prev.map((it) => ({
          ...it,
          selected: true,
          quantity: it.max_quantity,
        }))
      );
    }
  };

  const handleToggleItem = (saleItemId: string) => {
    setItemsState((prev) =>
      prev.map((it) => {
        if (it.sale_item_id === saleItemId) {
          const nextSelected = !it.selected;
          return {
            ...it,
            selected: nextSelected,
            quantity: nextSelected ? (it.quantity > 0 ? it.quantity : 1) : 0,
          };
        }
        return it;
      })
    );
  };

  const handleQuantityChange = (saleItemId: string, val: number) => {
    setItemsState((prev) =>
      prev.map((it) => {
        if (it.sale_item_id === saleItemId) {
          const clamped = Math.max(1, Math.min(val, it.max_quantity));
          return {
            ...it,
            quantity: clamped,
            selected: true,
          };
        }
        return it;
      })
    );
  };

  const handleToggleReturnInventory = (saleItemId: string) => {
    setItemsState((prev) =>
      prev.map((it) => {
        if (it.sale_item_id === saleItemId) {
          return {
            ...it,
            return_to_inventory: !it.return_to_inventory,
          };
        }
        return it;
      })
    );
  };

  // Real-time refund calculation
  const calculations = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;

    for (const item of itemsState) {
      if (item.selected && item.quantity > 0) {
        subtotal += item.unit_price * item.quantity;
        discount += item.unit_discount * item.quantity;
        tax += item.unit_tax * item.quantity;
      }
    }

    subtotal = Math.round(subtotal * 100) / 100;
    discount = Math.round(discount * 100) / 100;
    tax = Math.round(tax * 100) / 100;
    const totalRefund = Math.max(0, Math.round((subtotal - discount + tax) * 100) / 100);

    const hasSelectedItems = itemsState.some((i) => i.selected && i.quantity > 0);

    return {
      subtotal,
      discount,
      tax,
      totalRefund,
      hasSelectedItems,
    };
  }, [itemsState]);

  if (!isOpen || !sale) return null;

  const handleProcessRefund = async () => {
    if (!calculations.hasSelectedItems || calculations.totalRefund <= 0) {
      setErrorMsg('Pilih minimal satu item dengan kuantitas lebih dari 0 untuk direfund.');
      return;
    }

    if (!reason.trim()) {
      setErrorMsg('Alasan pengembalian dana (refund) wajib diisi.');
      return;
    }

    if (!profile?.id) {
      setErrorMsg('Profil kasir aktif tidak ditemukan.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      // 1. Ensure a stable idempotency key for this refund session
      const currentKey = idempotencyKey || crypto.randomUUID();
      if (!idempotencyKey) {
        setIdempotencyKey(currentKey);
      }

      // 2. Prepare pure business intent items for atomic RPC
      const refundItems = itemsState
        .filter((i) => i.selected && i.quantity > 0)
        .map((i) => ({
          sale_item_id: i.sale_item_id,
          quantity: i.quantity,
          return_to_inventory: i.return_to_inventory,
        }));

      // 3. Process refund atomically via authoritative RPC process_pos_refund
      const result = await refundService.processRefund(
        {
          sale_id: sale.id,
          idempotency_key: currentKey,
          items: refundItems,
          reason: reason.trim(),
          processed_by: profile.id,
          payment_method_id:
            selectedPaymentMethodId === 'AUTO' ? null : selectedPaymentMethodId,
        },
        supabase
      );

      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      console.error('Process sale refund error:', err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan saat memproses pengembalian dana.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-amber-500 text-slate-950 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">
                Refund / Pengembalian Dana
              </h2>
              <p className="text-xs text-amber-950 font-medium">
                Invoice: {sale.invoice_number} ({formatDateTime(sale.sold_at)})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-amber-950/70 hover:text-amber-950 p-1.5 rounded-lg hover:bg-amber-400/50 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Mode Selector */}
          <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-xl">
            <button
              type="button"
              onClick={() => handleModeChange('FULL')}
              className={`flex-1 py-2 rounded-lg font-bold transition-colors ${
                refundMode === 'FULL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Refund Semua Item (Full Refund)
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('PARTIAL')}
              className={`flex-1 py-2 rounded-lg font-bold transition-colors ${
                refundMode === 'PARTIAL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pilih Item Tertentu (Partial Refund)
            </button>
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 font-bold text-slate-700 border-b border-slate-200 flex justify-between items-center">
              <span>Pilih Item yang Dikembalikan</span>
              <span className="text-[11px] font-normal text-slate-500">
                Tersedia {itemsState.length} item dapat direfund
              </span>
            </div>

            {itemsState.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                Seluruh item pada nota ini sudah pernah direfund sebelumnya.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {itemsState.map((it) => (
                  <div
                    key={it.sale_item_id}
                    className={`p-3.5 flex items-center justify-between gap-4 transition-colors ${
                      it.selected ? 'bg-amber-50/40' : 'bg-white'
                    }`}
                  >
                    {/* Item Info & Checkbox */}
                    <div className="flex items-center gap-3 flex-1">
                      {refundMode === 'PARTIAL' ? (
                        <button
                          type="button"
                          onClick={() => handleToggleItem(it.sale_item_id)}
                          className="text-amber-600 shrink-0"
                        >
                          {it.selected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </button>
                      ) : (
                        <CheckSquare className="w-4 h-4 text-amber-600 shrink-0 opacity-80" />
                      )}

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {it.description}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              it.item_type === 'PRODUCT'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {it.item_type === 'PRODUCT' ? (
                              <>
                                <Package className="w-3 h-3" />
                                <span>Produk</span>
                              </>
                            ) : (
                              <>
                                <Scissors className="w-3 h-3" />
                                <span>Layanan</span>
                              </>
                            )}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                          {formatCurrency(it.unit_price)} × sisa {it.max_quantity} unit
                        </p>
                      </div>
                    </div>

                    {/* Quantity & Restock Controls */}
                    <div className="flex items-center gap-4">
                      {it.item_type === 'PRODUCT' && (
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={it.return_to_inventory}
                            onChange={() => handleToggleReturnInventory(it.sale_item_id)}
                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                          />
                          <span>Restock Gudang</span>
                        </label>
                      )}

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500">Qty Refund:</span>
                        <input
                          type="number"
                          min={1}
                          max={it.max_quantity}
                          value={it.quantity}
                          disabled={refundMode === 'FULL' || !it.selected}
                          onChange={(e) =>
                            handleQuantityChange(it.sale_item_id, parseInt(e.target.value) || 0)
                          }
                          className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-center font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:bg-slate-100"
                        />
                      </div>

                      <div className="text-right min-w-24">
                        <span className="font-mono font-bold text-slate-900">
                          {formatCurrency(
                            Math.max(
                              0,
                              Math.round(
                                ((it.unit_price - it.unit_discount + it.unit_tax) *
                                  (it.selected ? it.quantity : 0)) *
                                  100
                              ) / 100
                            )
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment Method Resolution */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <label className="block font-bold text-slate-700">
              Metode Pengeluaran Dana Refund
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedPaymentMethodId}
                onChange={(e) => setSelectedPaymentMethodId(e.target.value)}
                className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="AUTO">
                  Otomatis sesuai metode pembayaran asal (Auto-allocate)
                </option>
                {paymentMethods.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name} ({pm.code})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-slate-500">
              Opsi otomatis akan mengembalikan saldo ke akun kas/bank yang sama dengan saat pelanggan membayar nota ini.
            </p>
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <label className="block font-bold text-slate-700">
              Alasan Pengembalian Dana / Refund <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="Tuliskan alasan pengembalian dana untuk keperluan audit..."
              disabled={isSubmitting}
              className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400 disabled:opacity-50"
            />
            {/* Quick Reason Chips */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REFUND_REASONS.map((qr) => (
                <button
                  key={qr}
                  type="button"
                  onClick={() => {
                    setReason(qr);
                    setErrorMsg(null);
                  }}
                  disabled={isSubmitting}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
                    reason === qr
                      ? 'bg-amber-100 border-amber-300 text-amber-900'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  }`}
                >
                  {qr}
                </button>
              ))}
            </div>
          </div>

          {/* Financial Calculation Summary Box */}
          <div className="bg-slate-900 text-white rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-slate-300 text-[11px]">
              <span>Subtotal Item Refund:</span>
              <span className="font-mono">{formatCurrency(calculations.subtotal)}</span>
            </div>
            {calculations.discount > 0 && (
              <div className="flex justify-between text-emerald-400 text-[11px]">
                <span>Potongan Diskon Nota (Proporsional):</span>
                <span className="font-mono">- {formatCurrency(calculations.discount)}</span>
              </div>
            )}
            {calculations.tax > 0 && (
              <div className="flex justify-between text-slate-300 text-[11px]">
                <span>Penyesuaian PPN (Proporsional):</span>
                <span className="font-mono">+ {formatCurrency(calculations.tax)}</span>
              </div>
            )}
            <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between items-center font-bold">
              <span className="text-amber-400 text-xs">Total Pengembalian Dana Bersih:</span>
              <span className="text-base text-amber-400 font-mono">
                {formatCurrency(calculations.totalRefund)}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleProcessRefund}
            disabled={
              isSubmitting ||
              !calculations.hasSelectedItems ||
              calculations.totalRefund <= 0 ||
              !reason.trim()
            }
            className="inline-flex items-center gap-2 px-6 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:bg-slate-200 disabled:text-slate-400 rounded-xl shadow-xs transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memproses Refund...</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                <span>Proses Pengembalian Dana</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
