'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { ServiceItem, ServiceConsumptionItem, ProductItem } from '../../types/settings';
import {
  X,
  Boxes,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Package,
  Info,
} from 'lucide-react';

interface ServiceConsumptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: ServiceItem | null;
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function ServiceConsumptionModal({
  isOpen,
  onClose,
  service,
  onNotification,
}: ServiceConsumptionModalProps): React.JSX.Element | null {
  const { supabase, refreshData } = usePos();

  const [allConsumptions, setAllConsumptions] = useState<ServiceConsumptionItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filter only active consumptions for UI display
  const activeConsumptions = useMemo(
    () => allConsumptions.filter((c) => c.is_active),
    [allConsumptions]
  );

  // New consumption form state
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('0.05');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 1. Fetch consumptions for this service and all active products (SELECT Only)
  const loadData = useCallback(async () => {
    if (!service) return;
    setIsLoading(true);
    setFormError(null);

    try {
      // 1. Fetch products for selection
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('id, sku, name, base_unit, is_active')
        .eq('is_active', true)
        .order('name');
      if (prodErr) throw prodErr;

      // 2. Fetch service consumptions (both active and inactive for duplicate/reactivation lookup)
      const { data: consData, error: consErr } = await supabase
        .from('service_consumptions')
        .select(`
          id,
          service_id,
          product_id,
          quantity,
          is_active,
          products (name, sku, base_unit)
        `)
        .eq('service_id', service.id);
      if (consErr) throw consErr;

      const formattedCons: ServiceConsumptionItem[] = (consData || []).map((c: any) => ({
        id: c.id,
        service_id: c.service_id,
        product_id: c.product_id,
        quantity: parseFloat(c.quantity) || 0,
        is_active: c.is_active !== false,
        product_name: c.products?.name || 'Produk',
        product_sku: c.products?.sku || '-',
        product_base_unit: c.products?.base_unit || 'unit',
      }));

      setProducts((prodData || []) as ProductItem[]);
      setAllConsumptions(formattedCons);

      if (prodData && prodData.length > 0 && !selectedProductId) {
        setSelectedProductId(prodData[0].id);
      }
    } catch (err: unknown) {
      console.error('Error loading service consumptions:', err);
      const msg = err instanceof Error ? err.message : 'Gagal memuat bahan konsumsi layanan';
      setFormError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [service, supabase, selectedProductId]);

  useEffect(() => {
    if (isOpen && service) {
      loadData();
    }
  }, [isOpen, service, loadData]);

  if (!isOpen || !service) return null;

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // 2. Add / Save consumption via RPC save_service_consumption
  const handleAddConsumption = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedProductId) {
      setFormError('Harap pilih produk bahan yang akan dikonsumsi.');
      return;
    }

    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setFormError('Jumlah pemakaian bahan (quantity) harus lebih besar dari 0.');
      return;
    }

    // Check if already assigned (active or inactive, allowing reactivation)
    const existing = allConsumptions.find((c) => c.product_id === selectedProductId);
    const p_consumption_id = existing ? existing.id : null;

    setIsSubmitting(true);
    try {
      const { error: rpcErr } = await supabase.rpc('save_service_consumption', {
        p_consumption_id,
        p_service_id: service.id,
        p_product_id: selectedProductId,
        p_quantity: qtyNum,
        p_is_active: true,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Bahan konsumsi untuk "${service.name}" berhasil diperbarui!`,
      });

      await loadData();
      await refreshData();
      setQuantity('0.05');
    } catch (err: unknown) {
      console.error('save_service_consumption error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan bahan konsumsi.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Remove consumption (set is_active = false via RPC)
  const handleRemoveConsumption = async (item: ServiceConsumptionItem) => {
    setDeletingId(item.id);
    try {
      const { error: rpcErr } = await supabase.rpc('save_service_consumption', {
        p_consumption_id: item.id,
        p_service_id: item.service_id,
        p_product_id: item.product_id,
        p_quantity: item.quantity,
        p_is_active: false,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Bahan "${item.product_name}" dihapus dari konsumsi layanan "${service.name}".`,
      });

      await loadData();
      await refreshData();
    } catch (err: unknown) {
      console.error('Remove consumption error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menghapus bahan konsumsi.';
      setFormError(msg);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                Konsumsi Bahan (Service Consumption)
              </h2>
              <p className="text-xs text-slate-400">
                Layanan: <strong className="text-amber-300">{service.name}</strong> ({service.code})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {formError && (
            <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-red-300 flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-slate-400">
              Setiap kali layanan ini diselesaikan di kasir POS, sistem secara otomatis akan
              mengurangi stok bahan produk yang terdaftar di bawah ini sesuai quantity yang ditentukan.
            </p>
          </div>

          {/* Add New Consumption Form */}
          <form
            onSubmit={handleAddConsumption}
            className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3"
          >
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Tambah / Ubah Bahan Konsumsi</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-7 space-y-1">
                <label className="block text-slate-400 font-semibold text-[11px]">Pilih Produk Bahan</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) [{p.base_unit}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-5 space-y-1">
                <label className="block text-slate-400 font-semibold text-[11px]">
                  Pemakaian ({selectedProduct?.base_unit || 'unit'})
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  required
                  placeholder="0.05"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Simpan Pemakaian Bahan</span>
              </button>
            </div>
          </form>

          {/* Current Consumptions List (Only Active) */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Daftar Bahan Yang Terpakai ({activeConsumptions.length})
            </h3>

            {isLoading ? (
              <div className="py-6 text-center text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-500" />
                <p>Memuat daftar konsumsi bahan...</p>
              </div>
            ) : activeConsumptions.length === 0 ? (
              <div className="p-6 bg-slate-950/40 border border-slate-800 rounded-xl text-center text-slate-500">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Layanan ini belum memiliki konfigurasi pemakaian bahan produk.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {activeConsumptions.map((item) => {
                  const isDeleting = deletingId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3 hover:border-slate-700 transition"
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold text-white">{item.product_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          SKU: {item.product_sku}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono font-bold text-xs">
                          {item.quantity} {item.product_base_unit}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleRemoveConsumption(item)}
                          disabled={isDeleting}
                          className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/40 transition"
                          title="Hapus Pemakaian Bahan"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
