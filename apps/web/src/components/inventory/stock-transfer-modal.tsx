'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import { formatCurrency } from '../../lib/formatters';
import type { InventoryProductView } from '../../types/pos';
import {
  ArrowRightLeft,
  X,
  Loader2,
  AlertCircle,
  Building2,
  ArrowRight,
  Package,
} from 'lucide-react';

interface StockTransferModalProps {
  isOpen: boolean;
  preselectedProduct?: InventoryProductView | null;
  productsList: InventoryProductView[];
  onClose: () => void;
  onSuccess: () => void;
}

export function StockTransferModal({
  isOpen,
  preselectedProduct,
  productsList,
  onClose,
  onSuccess,
}: StockTransferModalProps): React.JSX.Element | null {
  const { supabase, currentOutlet, availableOutlets, profile } = usePos();

  const [toOutletId, setToOutletId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [transferQuantity, setTransferQuantity] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Available destination outlets (excluding current active outlet)
  const destinationOutlets = useMemo(() => {
    if (!currentOutlet) return [];
    return availableOutlets.filter((o) => o.id !== currentOutlet.id);
  }, [availableOutlets, currentOutlet]);

  useEffect(() => {
    if (destinationOutlets.length > 0) {
      setToOutletId(destinationOutlets[0].id);
    } else {
      setToOutletId('');
    }

    if (preselectedProduct) {
      setSelectedProductId(preselectedProduct.id);
    } else if (productsList.length > 0) {
      setSelectedProductId(productsList[0].id);
    }

    setTransferQuantity(1);
    setErrorMsg(null);
  }, [preselectedProduct, productsList, destinationOutlets, isOpen]);

  const activeProduct = useMemo(() => {
    return productsList.find((p) => p.id === selectedProductId) || null;
  }, [productsList, selectedProductId]);

  const targetOutlet = useMemo(() => {
    return destinationOutlets.find((o) => o.id === toOutletId) || null;
  }, [destinationOutlets, toOutletId]);

  if (!isOpen || !currentOutlet) return null;

  const totalTransferValue = useMemo(() => {
    if (!activeProduct) return 0;
    return Math.round(transferQuantity * activeProduct.average_cost * 100) / 100;
  }, [transferQuantity, activeProduct]);

  const handleSubmit = async () => {
    if (!toOutletId) {
      setErrorMsg('Pilih cabang tujuan pengiriman stok.');
      return;
    }

    if (!activeProduct) {
      setErrorMsg('Pilih produk yang akan ditransfer.');
      return;
    }

    if (transferQuantity <= 0) {
      setErrorMsg('Kuantitas transfer harus lebih besar dari 0.');
      return;
    }

    if (transferQuantity > activeProduct.quantity) {
      setErrorMsg(
        `Kuantitas melebihi stok yang tersedia (${activeProduct.quantity} unit).`
      );
      return;
    }

    if (!profile?.id) {
      setErrorMsg('Profil pengguna aktif tidak ditemukan.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      // 1. Generate unique transfer number
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const transferNumber = `TRF-${dateStr}-${randomSuffix}`;

      // 2. Insert into stock_transfers
      const { data: transferRecord, error: transferErr } = await supabase
        .from('stock_transfers')
        .insert({
          transfer_number: transferNumber,
          from_outlet_id: currentOutlet.id,
          to_outlet_id: toOutletId,
          status: 'REQUESTED',
          requested_by: profile.id,
        })
        .select('id')
        .single();

      if (transferErr || !transferRecord) {
        throw new Error(transferErr?.message || 'Gagal membuat dokumen transfer barang.');
      }

      const transferId = transferRecord.id;

      // 3. Insert into stock_transfer_items
      const { error: itemErr } = await supabase
        .from('stock_transfer_items')
        .insert({
          transfer_id: transferId,
          product_id: activeProduct.id,
          quantity: transferQuantity,
          unit_cost: activeProduct.average_cost,
        });

      if (itemErr) {
        throw new Error(itemErr.message);
      }

      // 4. Call atomic RPC process_stock_transfer
      const { data: rpcData, error: rpcErr } = await supabase.rpc('process_stock_transfer', {
        p_transfer_id: transferId,
        p_approved_by: profile.id,
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      console.log('Stock transfer processed:', rpcData);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('Stock transfer error:', err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan saat memproses transfer persediaan.'
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
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">
                Transfer Persediaan Antar-Cabang
              </h2>
              <p className="text-xs text-amber-400 font-medium">
                Pindah Stok dengan Moving Average Cost
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
          {/* Outlets Route Visualization */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
            <div className="flex-1">
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">
                Cabang Asal (Pengirim)
              </span>
              <div className="flex items-center gap-1.5 mt-0.5 text-slate-900 font-bold">
                <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="truncate">{currentOutlet.name}</span>
              </div>
            </div>

            <div className="p-1 rounded-full bg-slate-200 text-slate-600">
              <ArrowRight className="w-4 h-4" />
            </div>

            <div className="flex-1">
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">
                Cabang Tujuan (Penerima) <span className="text-red-500">*</span>
              </span>
              {destinationOutlets.length === 0 ? (
                <span className="text-red-500 text-[11px] block mt-0.5">
                  Tidak ada cabang lain
                </span>
              ) : (
                <select
                  value={toOutletId}
                  onChange={(e) => {
                    setToOutletId(e.target.value);
                    setErrorMsg(null);
                  }}
                  disabled={isSubmitting}
                  className="w-full mt-0.5 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {destinationOutlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.code})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Product Selector */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-700">
              Pilih Produk yang Dipindahkan <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setTransferQuantity(1);
                setErrorMsg(null);
              }}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            >
              {productsList.map((prod) => (
                <option key={prod.id} value={prod.id}>
                  {prod.name} ({prod.sku}) — Sisa Stok: {prod.quantity} unit
                </option>
              ))}
            </select>
          </div>

          {/* Quantity Input & Available Info */}
          {activeProduct && (
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 block text-[11px]">Stok Tersedia di Asal:</span>
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
                  Jumlah yang Dikirim: <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={activeProduct.quantity}
                  value={transferQuantity}
                  onChange={(e) =>
                    setTransferQuantity(
                      Math.max(1, Math.min(activeProduct.quantity, parseInt(e.target.value) || 1))
                    )
                  }
                  disabled={isSubmitting || activeProduct.quantity <= 0}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}

          {/* Financial Value Summary */}
          {activeProduct && (
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 flex justify-between items-center text-xs">
              <div className="flex items-center gap-2 text-amber-950 font-medium">
                <Package className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Nilai Aset yang Ditransfer:</span>
              </div>
              <span className="font-mono font-bold text-amber-900 text-sm">
                {formatCurrency(totalTransferValue)}
              </span>
            </div>
          )}

          {/* Destination Notice */}
          <div className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
            💡 <strong>Catatan:</strong> Stok akan berkurang di cabang <em>{currentOutlet.name}</em> dan
            bertambah di cabang <em>{targetOutlet?.name || 'Tujuan'}</em>. Nilai HPP (Moving Average Cost) di
            cabang tujuan akan otomatis disesuaikan secara proporsional.
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
            disabled={
              isSubmitting ||
              !toOutletId ||
              !activeProduct ||
              transferQuantity <= 0 ||
              transferQuantity > (activeProduct?.quantity || 0)
            }
            className="inline-flex items-center gap-2 px-6 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-xl shadow-xs transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memproses Transfer...</span>
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                <span>Kirim Transfer Stok</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
