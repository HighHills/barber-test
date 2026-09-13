'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePos } from '../../context/pos-context';
import type {
  ProductItem,
  ProductCategoryItem,
  OutletItem,
  CatalogOutletPayload,
} from '../../types/settings';
import {
  X,
  Package,
  Store,
  Barcode,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Scale,
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
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);

  // Initial snapshot for dirty state detection
  const initialSnapshotRef = useRef<string>('');

  // Active system outlets (outlets that are active in business)
  const activeSystemOutlets = useMemo(
    () => outlets.filter((o) => o.is_active !== false),
    [outlets]
  );

  // Initialize form state
  useEffect(() => {
    if (!isOpen) {
      setShowDiscardConfirm(false);
      return;
    }

    let initialSku = '';
    let initialBarcode = '';
    let initialName = '';
    let initialCategory = categories[0]?.id || '';
    let initialBaseUnit = 'pcs';
    let initialCost = '0';
    let initialDesc = '';
    let initialIsActive = true;
    const priceMap: Record<string, OutletPriceState> = {};

    if (product) {
      initialSku = product.sku || '';
      initialBarcode = product.barcode || '';
      initialName = product.name || '';
      initialCategory = product.category_id || categories[0]?.id || '';
      initialBaseUnit = product.base_unit || 'pcs';
      initialCost = product.default_cost_price !== null ? product.default_cost_price.toString() : '0';
      initialDesc = product.description || '';
      initialIsActive = product.is_active !== false;

      // Map existing outlet prices
      activeSystemOutlets.forEach((o) => {
        const assigned = product.product_outlets?.find((po) => po.outlet_id === o.id);
        priceMap[o.id] = {
          outlet_id: o.id,
          selling_price: assigned ? assigned.selling_price.toString() : '0',
          is_active: assigned ? assigned.is_active : true,
        };
      });
    } else {
      initialSku = '';
      initialBarcode = '';
      initialName = '';
      initialCategory = categories[0]?.id || '';
      initialBaseUnit = 'pcs';
      initialCost = '0';
      initialDesc = '';
      initialIsActive = true;

      // New product: default selling price is empty string, NOT magic number 75000
      activeSystemOutlets.forEach((o) => {
        priceMap[o.id] = {
          outlet_id: o.id,
          selling_price: '',
          is_active: true,
        };
      });
    }

    setSku(initialSku);
    setBarcode(initialBarcode);
    setName(initialName);
    setCategoryId(initialCategory);
    setBaseUnit(initialBaseUnit);
    setDefaultCostPrice(initialCost);
    setDescription(initialDesc);
    setIsActive(initialIsActive);
    setOutletPrices(priceMap);
    setFormError(null);
    setShowDiscardConfirm(false);

    // Save initial state snapshot for dirty comparison
    initialSnapshotRef.current = JSON.stringify({
      sku: initialSku,
      barcode: initialBarcode,
      name: initialName,
      categoryId: initialCategory,
      baseUnit: initialBaseUnit,
      defaultCostPrice: initialCost,
      description: initialDesc,
      isActive: initialIsActive,
      outletPrices: priceMap,
    });
  }, [product, categories, activeSystemOutlets, isOpen]);

  // Check if form is dirty
  const isDirty = useMemo(() => {
    if (!initialSnapshotRef.current) return false;
    const currentSnapshot = JSON.stringify({
      sku,
      barcode,
      name,
      categoryId,
      baseUnit,
      defaultCostPrice,
      description,
      isActive,
      outletPrices,
    });
    return currentSnapshot !== initialSnapshotRef.current;
  }, [sku, barcode, name, categoryId, baseUnit, defaultCostPrice, description, isActive, outletPrices]);

  // Safe close handler
  const handleRequestClose = () => {
    if (isDirty && !isSubmitting) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else {
          handleRequestClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showDiscardConfirm, isDirty, isSubmitting]);

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
      setFormError('Satuan dasar (base unit) produk wajib diisi.');
      return;
    }

    const costNum = parseFloat(defaultCostPrice) || 0;
    if (costNum < 0) {
      setFormError('Estimasi HPP (Default Cost Price) tidak boleh bernilai negatif.');
      return;
    }

    // Filter to active system outlets where the outlet is marked active in the modal
    const selectedOutlets = activeSystemOutlets.filter((o) => outletPrices[o.id]?.is_active);

    if (selectedOutlets.length === 0) {
      setFormError('Pilih dan aktifkan minimal satu cabang outlet untuk produk ini.');
      return;
    }

    // Validate outlet prices
    for (const o of selectedOutlets) {
      const pState = outletPrices[o.id];
      const rawPrice = pState?.selling_price?.trim() || '';
      if (rawPrice === '') {
        setFormError(`Harga jual pada cabang "${o.name}" wajib diisi (minimal Rp 0).`);
        return;
      }
      const pNum = parseFloat(rawPrice);
      if (isNaN(pNum) || pNum < 0) {
        setFormError(`Harga jual pada cabang "${o.name}" tidak valid (minimal Rp 0).`);
        return;
      }
    }

    const outletsPayload: CatalogOutletPayload[] = selectedOutlets.map((o) => {
      const pState = outletPrices[o.id];
      return {
        outlet_id: o.id,
        selling_price: parseFloat(pState?.selling_price || '0') || 0,
        is_active: true,
      };
    });

    // Validate no duplicate outlet_id
    const outletIdSet = new Set<string>();
    for (const item of outletsPayload) {
      if (outletIdSet.has(item.outlet_id)) {
        setFormError('Konfigurasi cabang outlet tidak boleh duplikat.');
        return;
      }
      outletIdSet.add(item.outlet_id);
    }

    setIsSubmitting(true);
    try {
      const p_product_id = product ? product.id : null;

      // Single atomic master RPC: save_product_catalog_with_outlets
      const { error: rpcErr } = await supabase.rpc(
        'save_product_catalog_with_outlets',
        {
          p_product_id,
          p_category_id: categoryId,
          p_sku: trimmedSku,
          p_barcode: barcode.trim() || null,
          p_name: trimmedName,
          p_description: description.trim() || null,
          p_base_unit: trimmedUnit,
          p_default_cost_price: costNum,
          p_is_active: isActive,
          p_outlets: outletsPayload,
        }
      );

      if (rpcErr) throw rpcErr;

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
      console.error('save_product_catalog_with_outlets error:', err);
      const rawMsg = err instanceof Error ? err.message : 'Gagal menyimpan produk.';
      if (rawMsg.includes('products_sku_key') || rawMsg.includes('23505') || rawMsg.toLowerCase().includes('sku')) {
        setFormError(`Kode SKU "${trimmedSku}" sudah terdaftar pada produk lain. Silakan gunakan kode SKU berbeda.`);
      } else if (rawMsg.includes('Minimal satu konfigurasi outlet')) {
        setFormError('Pilih dan aktifkan minimal satu cabang outlet untuk produk ini.');
      } else if (rawMsg.includes('Harga modal')) {
        setFormError('Estimasi HPP produk tidak boleh bernilai negatif.');
      } else {
        setFormError(rawMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] relative">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {isEditing ? 'Ubah Produk & Retail' : 'Tambah Produk Baru'}
              </h2>
              <p className="text-xs text-slate-400">
                Konfigurasi identitas SKU, satuan stok, dan tarif harga per cabang
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            disabled={isSubmitting}
            aria-label="Tutup modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
          {formError && (
            <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-red-300 flex items-start gap-2 text-xs animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{formError}</span>
            </div>
          )}

          {/* SECTION 1: IDENTITAS PRODUK */}
          <div className="space-y-3.5">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
              1. Identitas Produk
            </span>

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
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none transition uppercase"
                />
                <p className="text-[10px] text-slate-500">Kode unik inventaris global untuk stok dan barcode.</p>
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
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl text-white font-mono placeholder-slate-600 focus:outline-none transition text-xs"
                  />
                </div>
                <p className="text-[10px] text-slate-500">Dapat dipindai langsung dengan scanner laser POS.</p>
              </div>

              {/* Name */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-slate-300 font-semibold">
                  Nama Produk <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Chief Oilbased Pomade Vanilla 100gr"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none transition"
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-slate-300 font-semibold">
                  Kategori Produk <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                >
                  <option value="" disabled>
                    -- Pilih Kategori Produk --
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {!c.is_active ? '(Nonaktif)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-slate-300 font-semibold">Deskripsi Produk (Opsional)</label>
                <textarea
                  rows={2}
                  placeholder="Keterangan bahan, aroma, panduan penggunaan, atau kemasan..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none transition resize-none"
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-800/80" />

          {/* SECTION 2: SATUAN & HPP */}
          <div className="space-y-3.5">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
              2. Satuan & HPP (Harga Pokok)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Base Unit with Quick Suggestion Chips */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">
                  Satuan Dasar (Base Unit) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Scale className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="pcs / ml / gram / botol"
                    value={baseUnit}
                    onChange={(e) => setBaseUnit(e.target.value.toLowerCase())}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl text-xs text-white font-mono placeholder-slate-600 focus:outline-none transition"
                  />
                </div>
                {/* Quick Unit Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500 mr-1">Saran:</span>
                  {COMMON_BASE_UNITS.slice(0, 6).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setBaseUnit(unit)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                        baseUnit === unit
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Cost Price (HPP) */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">
                  Estimasi HPP (Default Cost Price)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono font-semibold">
                    Rp
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="500"
                    placeholder="0"
                    value={defaultCostPrice}
                    onChange={(e) => setDefaultCostPrice(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl text-xs text-white font-mono focus:outline-none transition"
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  Biaya modal referensi untuk perhitungan margin laba kotor.
                </p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-800/80" />

          {/* SECTION 3: HARGA & KETERSEDIAAN CABANG */}
          <div className="space-y-3.5">
            <div>
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                3. Matriks Harga & Ketersediaan Cabang
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tentukan harga jual produk retail dan status ketersediaan pada masing-masing cabang. Produk hanya dapat ditransaksikan di kasir pada cabang yang diaktifkan.
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/80 p-1">
              {activeSystemOutlets.map((o) => {
                const pState = outletPrices[o.id] || {
                  outlet_id: o.id,
                  selling_price: '',
                  is_active: true,
                };

                return (
                  <div
                    key={o.id}
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-slate-300 shrink-0">
                        <Store className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-200 truncate">{o.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{o.code}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-xs font-mono font-medium">Rp</span>
                        <input
                          type="number"
                          min={0}
                          step="1000"
                          placeholder="0"
                          value={pState.selling_price}
                          onChange={(e) => handlePriceChange(o.id, e.target.value)}
                          disabled={!pState.is_active}
                          className="w-32 px-3 py-1.5 bg-slate-900 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl text-right text-white font-mono text-xs focus:outline-none transition disabled:opacity-40 disabled:bg-slate-950"
                        />
                      </div>

                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-300 select-none min-h-[40px] px-2 py-1 rounded-lg hover:bg-slate-800/50 transition">
                        <input
                          type="checkbox"
                          checked={pState.is_active}
                          onChange={() => handleOutletActiveToggle(o.id)}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-950 accent-amber-500 cursor-pointer"
                        />
                        <span className={pState.is_active ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                          {pState.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-800/80" />

          {/* SECTION 4: STATUS MASTER */}
          <div className="space-y-3.5">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
              4. Status Master Produk
            </span>

            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-slate-700 bg-slate-950 accent-amber-500 cursor-pointer"
                />
                <div>
                  <span className="text-slate-200 font-bold block text-xs">
                    Katalog Master Produk Aktif
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    Produk nonaktif tidak ditampilkan pada katalog kasir seluruh cabang dan tidak dapat dipilih untuk transaksi baru.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleRequestClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 min-h-[40px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-semibold border border-slate-700/80"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2.5 min-h-[40px] bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold shadow-xs shadow-amber-500/20 transition disabled:opacity-40 text-xs"
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

        {/* Discard Changes Confirmation Dialog */}
        {showDiscardConfirm && (
          <div className="absolute inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Perubahan Belum Disimpan</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Data yang sudah Anda ubah akan hilang jika menutup formulir ini.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="px-3.5 py-2 min-h-[40px] bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition border border-slate-700/80"
                >
                  Tetap di Sini
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDiscardConfirm(false);
                    onClose();
                  }}
                  className="px-3.5 py-2 min-h-[40px] bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition shadow-xs"
                >
                  Buang Perubahan
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
