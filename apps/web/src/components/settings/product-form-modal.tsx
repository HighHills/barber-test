'use client';

import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import type { ProductItem, ProductCategoryItem, OutletItem } from '../../types/settings';
import {
  X,
  Package,
  Store,
  Barcode,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Coins,
} from 'lucide-react';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductItem | null;
  categories: ProductCategoryItem[];
  outlets: OutletItem[];
  onSuccess: () => void;
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

interface OutletPriceState {
  outlet_id: string;
  selling_price: string;
  is_active: boolean;
}

const COMMON_BASE_UNITS = ['pcs', 'ml', 'gram', 'botol', 'jar', 'tube', 'kotak', 'sachet', 'pack'];

export function ProductFormModal({
  isOpen,
  onClose,
  product,
  categories,
  outlets,
  onSuccess,
  onNotification,
}: ProductFormModalProps): React.JSX.Element | null {
  const { supabase, refreshData } = usePos();
  const isEditing = Boolean(product);

  // Form states
  const [sku, setSku] = useState<string>('');
  const [barcode, setBarcode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [baseUnit, setBaseUnit] = useState<string>('pcs');
  const [defaultCostPrice, setDefaultCostPrice] = useState<string>('0');
  const [description, setDescription] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  // Outlet pricing matrix
  const [outletPrices, setOutletPrices] = useState<Record<string, OutletPriceState>>({});

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize form state
  useEffect(() => {
    if (product) {
      setSku(product.sku || '');
      setBarcode(product.barcode || '');
      setName(product.name || '');
      setCategoryId(product.category_id || categories[0]?.id || '');
      setBaseUnit(product.base_unit || 'pcs');
      setDefaultCostPrice(product.default_cost_price?.toString() || '0');
      setDescription(product.description || '');
      setIsActive(product.is_active !== false);

      // Map existing outlet prices
      const priceMap: Record<string, OutletPriceState> = {};
      outlets.forEach((o) => {
        const assigned = product.product_outlets?.find((po) => po.outlet_id === o.id);
        priceMap[o.id] = {
          outlet_id: o.id,
          selling_price: assigned ? assigned.selling_price.toString() : '75000',
          is_active: assigned ? assigned.is_active : true,
        };
      });
      setOutletPrices(priceMap);
    } else {
      setSku('');
      setBarcode('');
      setName('');
      setCategoryId(categories[0]?.id || '');
      setBaseUnit('pcs');
      setDefaultCostPrice('0');
      setDescription('');
      setIsActive(true);

      const priceMap: Record<string, OutletPriceState> = {};
      outlets.forEach((o) => {
        priceMap[o.id] = {
          outlet_id: o.id,
          selling_price: '75000',
          is_active: true,
        };
      });
      setOutletPrices(priceMap);
    }
    setFormError(null);
  }, [product, categories, outlets, isOpen]);

  if (!isOpen) return null;

  const handlePriceChange = (outletId: string, price: string) => {
    setOutletPrices((prev) => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        selling_price: price,
      },
    }));
  };

  const handleOutletActiveToggle = (outletId: string) => {
    setOutletPrices((prev) => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        is_active: !prev[outletId].is_active,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedSku = sku.trim().toUpperCase();
    const trimmedName = name.trim();
    const trimmedUnit = baseUnit.trim().toLowerCase();

    // Validations
    if (!trimmedSku) {
      setFormError('SKU Produk wajib diisi.');
      return;
    }
    if (!trimmedName) {
      setFormError('Nama Produk wajib diisi.');
      return;
    }
    if (!categoryId) {
      setFormError('Pilih kategori produk.');
      return;
    }
    if (!trimmedUnit) {
      setFormError('Base unit produk wajib diisi.');
      return;
    }

    const costNum = parseFloat(defaultCostPrice) || 0;
    if (costNum < 0) {
      setFormError('Default cost price tidak boleh bernilai negatif.');
      return;
    }

    // Validate outlet prices
    for (const o of outlets) {
      const pState = outletPrices[o.id];
      const pNum = parseFloat(pState?.selling_price || '0');
      if (isNaN(pNum) || pNum < 0) {
        setFormError(`Harga jual pada cabang "${o.name}" tidak valid.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const p_product_id = product ? product.id : null;

      // 1. Call save_product RPC
      const { data: savedProductId, error: prdErr } = await supabase.rpc('save_product', {
        p_product_id,
        p_category_id: categoryId,
        p_sku: trimmedSku,
        p_barcode: barcode.trim() || null,
        p_name: trimmedName,
        p_description: description.trim() || null,
        p_base_unit: trimmedUnit,
        p_default_cost_price: costNum,
        p_is_active: isActive,
      });

      if (prdErr) throw prdErr;

      // Resolve target product id
      const targetProductId = (savedProductId as string) || product?.id;

      // 2. Save each outlet's price via save_product_outlet RPC
      if (targetProductId) {
        for (const o of outlets) {
          const pState = outletPrices[o.id];
          const sPrice = parseFloat(pState?.selling_price || '0') || 0;
          const sActive = pState?.is_active ?? true;

          const { error: poErr } = await supabase.rpc('save_product_outlet', {
            p_product_id: targetProductId,
            p_outlet_id: o.id,
            p_selling_price: sPrice,
            p_is_active: sActive,
          });

          if (poErr) throw poErr;
        }
      }

      onNotification?.({
        type: 'SUCCESS',
        message: isEditing
          ? `Produk "${trimmedName}" berhasil diperbarui!`
          : `Produk "${trimmedName}" berhasil ditambahkan ke katalog!`,
      });

      await refreshData();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('save_product error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan produk.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {isEditing ? 'Ubah Produk & Retail' : 'Tambah Produk Baru'}
              </h2>
              <p className="text-xs text-slate-400">
                Konfigurasi SKU, barcode, unit dasar, dan tarif harga per cabang
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {formError && (
            <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-red-300 flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Core Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* SKU */}
            <div className="space-y-1.5">
              <label className="block text-slate-300 font-semibold">
                SKU Produk <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="CONTOH: PRD-POM-01"
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 transition text-xs"
              />
            </div>

            {/* Barcode */}
            <div className="space-y-1.5">
              <label className="block text-slate-300 font-semibold">Barcode / EAN (Opsional)</label>
              <div className="relative">
                <Barcode className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="8991234567890"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 transition text-xs"
                />
              </div>
            </div>

            {/* Name */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-slate-300 font-semibold">
                Nama Produk <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Chief Oilbased Pomade Vanilla 100gr"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition text-xs"
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="block text-slate-300 font-semibold">
                Kategori Produk <span className="text-red-400">*</span>
              </label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
              >
                <option value="" disabled>
                  -- Pilih Kategori --
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Base Unit */}
            <div className="space-y-1.5">
              <label className="block text-slate-300 font-semibold">
                Satuan Dasar (Base Unit) <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="pcs / ml / gram"
                  value={baseUnit}
                  onChange={(e) => setBaseUnit(e.target.value.toLowerCase())}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 transition text-xs"
                />
                <select
                  value={baseUnit}
                  onChange={(e) => setBaseUnit(e.target.value)}
                  className="px-2 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-xs focus:outline-none"
                >
                  {COMMON_BASE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Default Cost Price */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-slate-300 font-semibold">
                Estimasi Harga Pokok Pembelian (Default Cost Price / HPP)
              </label>
              <div className="relative">
                <Coins className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  min={0}
                  step="500"
                  value={defaultCostPrice}
                  onChange={(e) => setDefaultCostPrice(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-semibold">Deskripsi Produk</label>
            <textarea
              rows={2}
              placeholder="Keterangan kandungan, aroma, atau panduan penggunaan produk..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition text-xs resize-none"
            />
          </div>

          {/* Active Toggle */}
          <div className="pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
              />
              <span className="text-slate-300 font-medium">
                Produk Aktif (Tampil di kasir POS dan inventaris)
              </span>
            </label>
          </div>

          {/* Outlet Pricing Matrix */}
          <div className="space-y-3 pt-2">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-amber-400" />
                <span>Matriks Harga Tiap Cabang Outlet</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Tentukan harga jual produk retail dan status ketersediaan pada masing-masing cabang
              </p>
            </div>

            <div className="space-y-2">
              {outlets.map((o) => {
                const pState = outletPrices[o.id] || {
                  outlet_id: o.id,
                  selling_price: '75000',
                  is_active: true,
                };

                return (
                  <div
                    key={o.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">{o.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{o.code}</div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 text-xs font-medium">Rp</span>
                        <input
                          type="number"
                          min={0}
                          step="1000"
                          value={pState.selling_price}
                          onChange={(e) => handlePriceChange(o.id, e.target.value)}
                          className="w-28 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-right text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          checked={pState.is_active}
                          onChange={() => handleOutletActiveToggle(o.id)}
                          className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                        />
                        <span>Aktif</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold shadow-md shadow-amber-500/20 transition disabled:opacity-50 text-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Perbarui Produk' : 'Simpan Produk'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
