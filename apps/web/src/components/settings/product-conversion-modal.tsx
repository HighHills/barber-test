'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePos } from '../../context/pos-context';
import type { ProductItem, ProductUnitConversionItem } from '../../types/settings';
import {
  X,
  Scale,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Package,
  Info,
} from 'lucide-react';

interface ProductConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductItem | null;
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function ProductConversionModal({
  isOpen,
  onClose,
  product,
  onNotification,
}: ProductConversionModalProps): React.JSX.Element | null {
  const { supabase, refreshData } = usePos();

  const [conversions, setConversions] = useState<ProductUnitConversionItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Form states for new conversion
  const [unitName, setUnitName] = useState<string>('');
  const [multiplier, setMultiplier] = useState<string>('1000');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 1. Fetch conversions for product (SELECT Only)
  const loadData = useCallback(async () => {
    if (!product) return;
    setIsLoading(true);
    setFormError(null);

    try {
      const { data, error } = await supabase
        .from('product_unit_conversions')
        .select('*')
        .eq('product_id', product.id)
        .eq('is_active', true)
        .order('multiplier_to_base', { ascending: true });

      if (error) throw error;

      const formatted: ProductUnitConversionItem[] = (data || []).map((c: any) => ({
        id: c.id,
        product_id: c.product_id,
        unit_name: c.unit_name,
        multiplier_to_base: parseFloat(c.multiplier_to_base) || 1,
        is_active: c.is_active !== false,
        created_at: c.created_at,
        updated_at: c.updated_at,
      }));

      setConversions(formatted);
    } catch (err: unknown) {
      console.error('Error loading product conversions:', err);
      const msg = err instanceof Error ? err.message : 'Gagal memuat konversi satuan';
      setFormError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [product, supabase]);

  useEffect(() => {
    if (isOpen && product) {
      loadData();
    }
  }, [isOpen, product, loadData]);

  if (!isOpen || !product) return null;

  // 2. Add / Save conversion via RPC save_product_unit_conversion
  const handleAddConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedUnit = unitName.trim().toUpperCase();
    if (!trimmedUnit) {
      setFormError('Nama satuan kemasan wajib diisi.');
      return;
    }

    const multNum = parseFloat(multiplier);
    if (isNaN(multNum) || multNum <= 0) {
      setFormError('Nilai pengali satuan ke base unit (multiplier) harus lebih besar dari 0.');
      return;
    }

    if (trimmedUnit.toLowerCase() === product.base_unit.toLowerCase()) {
      setFormError(`Satuan "${trimmedUnit}" sama dengan base unit produk. Tidak perlu dikonversi.`);
      return;
    }

    // Check existing
    const existing = conversions.find((c) => c.unit_name.toUpperCase() === trimmedUnit);
    const p_conversion_id = existing ? existing.id : null;

    setIsSubmitting(true);
    try {
      const { error: rpcErr } = await supabase.rpc('save_product_unit_conversion', {
        p_conversion_id,
        p_product_id: product.id,
        p_unit_name: trimmedUnit,
        p_multiplier_to_base: multNum,
        p_is_active: true,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Konversi 1 ${trimmedUnit} = ${multNum} ${product.base_unit} berhasil disimpan!`,
      });

      setUnitName('');
      setMultiplier('1000');
      await loadData();
      await refreshData();
    } catch (err: unknown) {
      console.error('save_product_unit_conversion error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan konversi satuan.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Delete conversion (set is_active = false via RPC)
  const handleRemoveConversion = async (item: ProductUnitConversionItem) => {
    setDeletingId(item.id);
    try {
      const { error: rpcErr } = await supabase.rpc('save_product_unit_conversion', {
        p_conversion_id: item.id,
        p_product_id: item.product_id,
        p_unit_name: item.unit_name,
        p_multiplier_to_base: item.multiplier_to_base,
        p_is_active: false,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Konversi satuan "${item.unit_name}" berhasil dihapus.`,
      });

      await loadData();
      await refreshData();
    } catch (err: unknown) {
      console.error('Remove conversion error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menghapus konversi satuan.';
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
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                Konversi Satuan Produk (Unit Conversion)
              </h2>
              <p className="text-xs text-slate-400">
                Produk: <strong className="text-amber-300">{product.name}</strong> (Base Unit:{' '}
                <strong className="text-white">{product.base_unit}</strong>)
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
              Gunakan konversi satuan jika produk dibeli atau disimpan dalam satuan besar (misal:
              LITER, DUS, BOTOL) tetapi dikonsumsi atau dijual dalam satuan kecil ({product.base_unit}).
            </p>
          </div>

          {/* Add Conversion Form */}
          <form
            onSubmit={handleAddConversion}
            className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3"
          >
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Tambah / Ubah Satuan Konversi</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-6 space-y-1">
                <label className="block text-slate-400 font-semibold text-[11px]">Nama Satuan Baru</label>
                <input
                  type="text"
                  required
                  placeholder="LITER / BOTOL / PACK"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value.toUpperCase())}
                  className="w-full px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="sm:col-span-6 space-y-1">
                <label className="block text-slate-400 font-semibold text-[11px]">
                  Nilai Pengali ke ({product.base_unit})
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  required
                  placeholder="1000"
                  value={multiplier}
                  onChange={(e) => setMultiplier(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
              <div>
                Rumus: 1 {unitName || '[Satuan]'} = {multiplier || '0'} {product.base_unit}
              </div>

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
                <span>Simpan Konversi</span>
              </button>
            </div>
          </form>

          {/* Current Conversions List */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Daftar Satuan Konversi Terdaftar ({conversions.length})
            </h3>

            {isLoading ? (
              <div className="py-6 text-center text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-500" />
                <p>Memuat daftar konversi...</p>
              </div>
            ) : conversions.length === 0 ? (
              <div className="p-6 bg-slate-950/40 border border-slate-800 rounded-xl text-center text-slate-500">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Produk ini hanya menggunakan base unit tunggal ({product.base_unit}).</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {conversions.map((item) => {
                  const isDeleting = deletingId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3 hover:border-slate-700 transition"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-white font-mono">{item.unit_name}</div>
                        <div className="text-[11px] text-slate-400">
                          1 {item.unit_name} ={' '}
                          <strong className="text-amber-300">{item.multiplier_to_base}</strong>{' '}
                          {product.base_unit}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveConversion(item)}
                        disabled={isDeleting}
                        className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/40 transition"
                        title="Hapus Satuan Konversi"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
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
