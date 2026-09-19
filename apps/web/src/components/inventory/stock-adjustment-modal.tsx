'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import { formatCurrency } from '../../lib/formatters';
import type { InventoryProductView } from '../../types/pos';
import {
  SlidersHorizontal,
  X,
  Loader2,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  preselectedProduct?: InventoryProductView | null;
  productsList: InventoryProductView[];
  onClose: () => void;
  onSuccess: () => void;
}

const QUICK_ADJUSTMENT_REASONS = [
  'Stok opname berkala',
  'Barang rusak / kemasan pecah',
  'Barang kadaluarsa',
  'Selisih hitungan kasir',
  'Barang hilang / shrinkage',
  'Koreksi penerimaan barang',
];

export function StockAdjustmentModal({
  isOpen,
  preselectedProduct,
  productsList,
  onClose,
  onSuccess,
}: StockAdjustmentModalProps): React.JSX.Element | null {
  const { supabase, currentOutlet } = usePos();

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [physicalQuantity, setPhysicalQuantity] = useState<string>('0');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedProduct) {
      setSelectedProductId(preselectedProduct.id);
      setPhysicalQuantity(String(preselectedProduct.quantity));
    } else if (productsList.length > 0) {
      setSelectedProductId(productsList[0].id);
      setPhysicalQuantity(String(productsList[0].quantity));
    }
    setReason('');
    setErrorMsg(null);
  }, [preselectedProduct, productsList, isOpen]);

  const activeProduct = useMemo(() => {
    return productsList.find((p) => p.id === selectedProductId) || null;
  }, [productsList, selectedProductId]);

  const handleProductChange = (prodId: string) => {
    setSelectedProductId(prodId);
    const p = productsList.find((item) => item.id === prodId);
    if (p) {
      setPhysicalQuantity(String(p.quantity));
    }
    setErrorMsg(null);
  };

  const parsedPhysicalQty = useMemo(() => {
    const raw = physicalQuantity.trim();
    if (raw === '') return null;
    const val = Number(raw);
    if (!Number.isFinite(val) || !Number.isInteger(val) || val < 0) return null;
    return val;
  }, [physicalQuantity]);

  const delta = useMemo(() => {
    if (!activeProduct || parsedPhysicalQty === null) return 0;
    return parsedPhysicalQty - activeProduct.quantity;
  }, [parsedPhysicalQty, activeProduct]);

  const financialImpact = useMemo(() => {
    if (!activeProduct || parsedPhysicalQty === null) return 0;
    return Math.round(Math.abs(delta) * activeProduct.average_cost * 100) / 100;
  }, [delta, activeProduct, parsedPhysicalQty]);

  if (!isOpen || !currentOutlet) return null;

  const handleSubmit = async () => {
    if (!activeProduct) {
      setErrorMsg('Pilih produk yang akan disesuaikan.');
      return;
    }

    const rawQty = physicalQuantity.trim();
    const parsedQty = Number(rawQty);
    if (
      rawQty === '' ||
      !Number.isFinite(parsedQty) ||
      !Number.isInteger(parsedQty) ||
      parsedQty < 0
    ) {
      setErrorMsg('Hitungan fisik riil harus berupa bilangan bulat yang valid dan tidak boleh negatif.');
      return;
    }

    if (parsedQty === activeProduct.quantity) {
      setErrorMsg('Kuantitas fisik riil sama dengan stok sistem. Tidak ada selisih yang disesuaikan.');
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setErrorMsg('Alasan penyesuaian stok (stok opname) wajib diisi.');
      return;
    }

    if (trimmedReason.length > 500) {
      setErrorMsg('Alasan penyesuaian stok maksimal 500 karakter.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        'create_and_process_stock_adjustment',
        {
          p_outlet_id: currentOutlet.id,
          p_product_id: activeProduct.id,
          p_quantity_after: parsedQty,
          p_reason: trimmedReason,
        }
      );

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      console.log('Stock adjustment processed:', rpcData);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('Stock adjustment error:', err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan saat memproses penyesuaian stok.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">
                Stok Opname / Penyesuaian Fisik
              </h2>
              <p className="text-xs text-amber-400 font-medium">
                Outlet: {currentOutlet.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 text-xs">
          {/* Product Selector */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-700">
              Pilih Produk Ritel <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => handleProductChange(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            >
              {productsList.map((prod) => (
                <option key={prod.id} value={prod.id}>
                  {prod.name} ({prod.sku}) — Stok: {prod.quantity} unit
                </option>
              ))}
            </select>
          </div>

          {/* Current Stock vs Physical Input */}
          {activeProduct && (
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 block text-[11px]">Stok di Sistem:</span>
                <span className="text-base font-mono font-bold text-slate-900">
                  {activeProduct.quantity}{' '}
                  <span className="text-xs font-normal text-slate-500">unit</span>
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                  HPP: {formatCurrency(activeProduct.average_cost)}
                </span>
              </div>

              <div>
                <label className="text-slate-700 font-bold block text-[11px] mb-1">
                  Hitungan Fisik Riil: <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={physicalQuantity}
                  onChange={(e) => {
                    setPhysicalQuantity(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  disabled={isSubmitting}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}

          {/* Variance / Impact Indicator */}
          {activeProduct && (
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                delta < 0
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : delta > 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-2">
                {delta < 0 ? (
                  <TrendingDown className="w-4 h-4 text-red-600 shrink-0" />
                ) : delta > 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Minus className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <div>
                  <span className="font-semibold block">
                    {delta < 0
                      ? 'Selisih Negatif (Stok Berkurang / Susut)'
                      : delta > 0
                      ? 'Selisih Positif (Stok Bertambah / Surplus)'
                      : 'Stok Cocok (Tidak ada selisih)'}
                  </span>
                  <span className="text-[11px] opacity-80">
                    Delta: {delta > 0 ? `+${delta}` : delta} unit
                  </span>
                </div>
              </div>

              {delta !== 0 && (
                <div className="text-right font-mono font-bold">
                  <span>Nilai: {formatCurrency(financialImpact)}</span>
                  <span className="text-[10px] block opacity-75 font-sans font-normal">
                    {delta < 0 ? 'Kerugian (Shrinkage)' : 'Keuntungan (Surplus)'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Reason Input */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-700">
              Alasan Penyesuaian / Catatan <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="Contoh: Stok opname akhir pekan, 1 unit wadah retak..."
              disabled={isSubmitting}
              className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400 disabled:opacity-50"
            />
            {/* Quick Reasons */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {QUICK_ADJUSTMENT_REASONS.map((qr) => (
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

          {/* Error Banner */}
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
            onClick={handleSubmit}
            disabled={isSubmitting || parsedPhysicalQty === null || delta === 0 || !reason.trim()}
            className="inline-flex items-center gap-2 px-6 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-xl shadow-xs transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Membukukan Opname...</span>
              </>
            ) : (
              <>
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <span>Posting Penyesuaian</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
