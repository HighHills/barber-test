'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePos } from '../../context/pos-context';
import type { CatalogItem } from '../../types/pos';
import {
  X,
  Scissors,
  Package,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Barcode,
  Sparkles,
  Boxes,
} from 'lucide-react';

interface CatalogItemModalProps {
  isOpen: boolean;
  item?: CatalogItem | null;
  initialType?: 'SERVICE' | 'PRODUCT';
  onClose: () => void;
  onSuccess: () => void;
}

const DEFAULT_SERVICE_CATEGORIES = [
  'Haircut & Styling',
  'Shaving & Beard',
  'Hair Treatment',
  'Kids & Grooming',
  'Hair Coloring',
  'Massage & Relax',
];

const DEFAULT_PRODUCT_CATEGORIES = [
  'Pomade & Styling',
  'Shampoo & Conditioner',
  'Hair Tonic & Serum',
  'Beard Care',
  'Accessories & Tools',
  'Merchandise',
];

const BASE_UNITS = ['pcs', 'botol', 'jar', 'tube', 'kotak', 'sachet', 'pack'];

export function CatalogItemModal({
  isOpen,
  item,
  initialType = 'SERVICE',
  onClose,
  onSuccess,
}: CatalogItemModalProps): React.JSX.Element | null {
  const { supabase, currentOutlet } = usePos();
  const isEditing = Boolean(item && item.id);

  // Form State
  const [itemType, setItemType] = useState<'SERVICE' | 'PRODUCT'>(
    item ? item.type : initialType
  );
  const [name, setName] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [categoryName, setCategoryName] = useState<string>('');
  const [customCategory, setCustomCategory] = useState<string>('');
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [baseUnit, setBaseUnit] = useState<string>('pcs');
  const [barcode, setBarcode] = useState<string>('');
  const [initialStock, setInitialStock] = useState<string>('0');
  const [description, setDescription] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  // Available Categories from DB
  const [dbCategories, setDbCategories] = useState<string[]>([]);
  const [isNewCategory, setIsNewCategory] = useState<boolean>(false);

  // UI state
  const [loading, setLoading] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load existing categories
  const loadCategories = useCallback(async () => {
    try {
      if (itemType === 'SERVICE') {
        const { data } = await supabase
          .from('service_categories')
          .select('name')
          .order('name');
        if (data && data.length > 0) {
          const names = Array.from(new Set(data.map((d: any) => d.name).filter(Boolean)));
          setDbCategories(names);
        } else {
          setDbCategories(DEFAULT_SERVICE_CATEGORIES);
        }
      } else {
        const { data } = await supabase
          .from('product_categories')
          .select('name')
          .order('name');
        if (data && data.length > 0) {
          const names = Array.from(new Set(data.map((d: any) => d.name).filter(Boolean)));
          setDbCategories(names);
        } else {
          setDbCategories(DEFAULT_PRODUCT_CATEGORIES);
        }
      }
    } catch {
      setDbCategories(
        itemType === 'SERVICE' ? DEFAULT_SERVICE_CATEGORIES : DEFAULT_PRODUCT_CATEGORIES
      );
    }
  }, [supabase, itemType]);

  // Reset or pre-fill form
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setConfirmDelete(false);

    if (item) {
      setItemType(item.type);
      setName(item.name || '');
      setCode(item.code || '');
      setCategoryName(item.category_name || (item.type === 'SERVICE' ? 'Haircut & Styling' : 'Pomade & Styling'));
      setSellingPrice(String(item.selling_price || 0));
      setDurationMinutes(item.duration_minutes || 30);
      setBaseUnit(item.base_unit || 'pcs');
      setBarcode(item.barcode || '');
      setInitialStock('0');
      setDescription(item.description || '');
      setIsActive(item.is_active !== undefined ? item.is_active : true);
      setIsNewCategory(false);
      setCustomCategory('');
    } else {
      setItemType(initialType);
      setName('');
      // Generate default code
      const randNum = Math.floor(100 + Math.random() * 900);
      setCode(initialType === 'SERVICE' ? `SRV-${randNum}` : `PRD-${randNum}`);
      setCategoryName(initialType === 'SERVICE' ? 'Haircut & Styling' : 'Pomade & Styling');
      setSellingPrice('50000');
      setDurationMinutes(30);
      setBaseUnit('pcs');
      setBarcode('');
      setInitialStock('10');
      setDescription('');
      setIsActive(true);
      setIsNewCategory(false);
      setCustomCategory('');
    }

    loadCategories();
  }, [isOpen, item, initialType, loadCategories]);

  // Generate unique code helper
  const handleGenerateCode = () => {
    const prefix = itemType === 'SERVICE' ? 'SRV' : 'PRD';
    const randNum = Math.floor(100 + Math.random() * 900);
    setCode(`${prefix}-${randNum}`);
  };

  // Change Item Type (only in Create mode)
  const handleTypeChange = (newType: 'SERVICE' | 'PRODUCT') => {
    if (isEditing) return;
    setItemType(newType);
    const prefix = newType === 'SERVICE' ? 'SRV' : 'PRD';
    const randNum = Math.floor(100 + Math.random() * 900);
    setCode(`${prefix}-${randNum}`);
    setCategoryName(newType === 'SERVICE' ? 'Haircut & Styling' : 'Pomade & Styling');
    setIsNewCategory(false);
  };

  // Submit Save / Update
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOutlet) {
      setErrorMsg('Cabang aktif tidak ditemukan.');
      return;
    }

    if (!name.trim()) {
      setErrorMsg('Nama menu/item tidak boleh kosong.');
      return;
    }

    if (!code.trim()) {
      setErrorMsg('Kode / SKU tidak boleh kosong.');
      return;
    }

    const priceNum = parseFloat(sellingPrice) || 0;
    if (priceNum < 0) {
      setErrorMsg('Harga jual tidak boleh negatif.');
      return;
    }

    const finalCategory = isNewCategory
      ? customCategory.trim() || (itemType === 'SERVICE' ? 'Haircut & Styling' : 'Pomade & Styling')
      : categoryName.trim() || (itemType === 'SERVICE' ? 'Haircut & Styling' : 'Pomade & Styling');

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (itemType === 'SERVICE') {
        // 1. Try RPC upsert_catalog_service
        const { error: rpcErr } = await supabase.rpc('upsert_catalog_service', {
          p_id: item?.id || null,
          p_outlet_id: currentOutlet.id,
          p_name: name.trim(),
          p_code: code.trim(),
          p_category_name: finalCategory,
          p_duration_minutes: durationMinutes,
          p_selling_price: priceNum,
          p_description: description.trim() || null,
          p_is_active: isActive,
        });

        if (rpcErr) {
          console.warn('RPC upsert_catalog_service note, attempting direct table fallback:', rpcErr.message);
          // Fallback: Direct table insert/update
          let catId = item?.category_id;
          if (!catId) {
            // Find or insert category
            const { data: catFind } = await supabase
              .from('service_categories')
              .select('id')
              .ilike('name', finalCategory)
              .maybeSingle();

            if (catFind?.id) {
              catId = catFind.id;
            } else {
              const { data: newCat } = await supabase
                .from('service_categories')
                .insert({ name: finalCategory, is_active: true })
                .select('id')
                .single();
              catId = newCat?.id;
            }
          }

          if (!catId) throw new Error('Gagal memproses kategori layanan.');

          let targetServiceId = item?.id;
          if (!targetServiceId) {
            const { data: newSrv, error: srvErr } = await supabase
              .from('services')
              .insert({
                category_id: catId,
                code: code.trim(),
                name: name.trim(),
                description: description.trim() || null,
                duration_minutes: durationMinutes,
                is_active: isActive,
              })
              .select('id')
              .single();

            if (srvErr) throw srvErr;
            targetServiceId = newSrv.id;
          } else {
            const { error: updErr } = await supabase
              .from('services')
              .update({
                category_id: catId,
                code: code.trim(),
                name: name.trim(),
                description: description.trim() || null,
                duration_minutes: durationMinutes,
                is_active: isActive,
                updated_at: new Date().toISOString(),
              })
              .eq('id', targetServiceId);

            if (updErr) throw updErr;
          }

          // Link to service_outlets
          const { error: soErr } = await supabase
            .from('service_outlets')
            .upsert(
              {
                service_id: targetServiceId,
                outlet_id: currentOutlet.id,
                selling_price: priceNum,
                is_active: isActive,
              },
              { onConflict: 'service_id,outlet_id' }
            );

          if (soErr) throw soErr;
        }

        setSuccessMsg(isEditing ? 'Layanan berhasil diperbarui!' : 'Layanan baru berhasil ditambahkan!');
      } else {
        // 2. PRODUCT Handling
        const stockNum = parseFloat(initialStock) || 0;

        // Try RPC upsert_catalog_product
        const { error: rpcErr } = await supabase.rpc('upsert_catalog_product', {
          p_id: item?.id || null,
          p_outlet_id: currentOutlet.id,
          p_name: name.trim(),
          p_sku: code.trim(),
          p_barcode: barcode.trim() || null,
          p_category_name: finalCategory,
          p_base_unit: baseUnit.trim() || 'pcs',
          p_selling_price: priceNum,
          p_initial_stock: isEditing ? 0 : stockNum,
          p_description: description.trim() || null,
          p_is_active: isActive,
        });

        if (rpcErr) {
          console.warn('RPC upsert_catalog_product note, attempting direct table fallback:', rpcErr.message);
          // Direct table fallback
          let catId = item?.category_id;
          if (!catId) {
            const { data: catFind } = await supabase
              .from('product_categories')
              .select('id')
              .ilike('name', finalCategory)
              .maybeSingle();

            if (catFind?.id) {
              catId = catFind.id;
            } else {
              const { data: newCat } = await supabase
                .from('product_categories')
                .insert({ name: finalCategory, is_active: true })
                .select('id')
                .single();
              catId = newCat?.id;
            }
          }

          if (!catId) throw new Error('Gagal memproses kategori produk.');

          let targetProdId = item?.id;
          if (!targetProdId) {
            const { data: newPrd, error: prdErr } = await supabase
              .from('products')
              .insert({
                category_id: catId,
                sku: code.trim(),
                barcode: barcode.trim() || null,
                name: name.trim(),
                description: description.trim() || null,
                base_unit: baseUnit.trim() || 'pcs',
                is_active: isActive,
              })
              .select('id')
              .single();

            if (prdErr) throw prdErr;
            targetProdId = newPrd.id;

            // Seed initial stock
            if (stockNum > 0) {
              await supabase
                .from('outlet_inventory')
                .upsert({
                  outlet_id: currentOutlet.id,
                  product_id: targetProdId,
                  quantity: stockNum,
                  average_cost: 0,
                });
            }
          } else {
            const { error: updErr } = await supabase
              .from('products')
              .update({
                category_id: catId,
                sku: code.trim(),
                barcode: barcode.trim() || null,
                name: name.trim(),
                description: description.trim() || null,
                base_unit: baseUnit.trim() || 'pcs',
                is_active: isActive,
                updated_at: new Date().toISOString(),
              })
              .eq('id', targetProdId);

            if (updErr) throw updErr;
          }

          // Link to product_outlets
          const { error: poErr } = await supabase
            .from('product_outlets')
            .upsert(
              {
                product_id: targetProdId,
                outlet_id: currentOutlet.id,
                selling_price: priceNum,
                is_active: isActive,
              },
              { onConflict: 'product_id,outlet_id' }
            );

          if (poErr) throw poErr;
        }

        setSuccessMsg(isEditing ? 'Produk berhasil diperbarui!' : 'Produk baru berhasil ditambahkan!');
      }

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
    } catch (err: unknown) {
      console.error('Catalog save error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan item ke katalog.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // Handle Delete / Deactivate
  const handleDelete = async () => {
    if (!item?.id || !currentOutlet) return;

    setDeleting(true);
    setErrorMsg(null);
    try {
      // 1. Try RPC delete_catalog_item
      const { error: rpcErr } = await supabase.rpc('delete_catalog_item', {
        p_id: item.id,
        p_type: item.type,
        p_outlet_id: currentOutlet.id,
      });

      if (rpcErr) {
        console.warn('RPC delete note, using soft-delete fallback:', rpcErr.message);
        // Fallback: Soft-deactivate on outlet
        if (item.type === 'SERVICE') {
          await supabase
            .from('service_outlets')
            .update({ is_active: false })
            .eq('service_id', item.id)
            .eq('outlet_id', currentOutlet.id);
        } else {
          await supabase
            .from('product_outlets')
            .update({ is_active: false })
            .eq('product_id', item.id)
            .eq('outlet_id', currentOutlet.id);
        }
      }

      setSuccessMsg('Item berhasil dihapus / dinonaktifkan dari katalog cabang.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 600);
    } catch (err: unknown) {
      console.error('Catalog delete error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menghapus item katalog.';
      setErrorMsg(msg);
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative flex max-h-[92vh] w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
              itemType === 'SERVICE'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
            }`}>
              {itemType === 'SERVICE' ? <Scissors className="h-5 w-5" /> : <Package className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isEditing
                  ? `Edit ${itemType === 'SERVICE' ? 'Layanan Jasa' : 'Produk Ritel'}`
                  : 'Tambah Item Katalog POS'}
              </h2>
              <p className="text-xs text-slate-400">
                Penetapan harga dan ketersediaan untuk Cabang: <strong className="text-amber-400">{currentOutlet?.name || 'Cabang Aktif'}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Item Type Switcher (Only if Create Mode) */}
        {!isEditing && (
          <div className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-slate-50 p-3">
            <button
              type="button"
              onClick={() => handleTypeChange('SERVICE')}
              className={`flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition ${
                itemType === 'SERVICE'
                  ? 'bg-amber-500 text-slate-950 shadow-xs ring-1 ring-amber-400'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Scissors className="h-4 w-4" />
              Layanan Jasa (Service)
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('PRODUCT')}
              className={`flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition ${
                itemType === 'PRODUCT'
                  ? 'bg-blue-600 text-white shadow-xs ring-1 ring-blue-400'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Package className="h-4 w-4" />
              Produk Ritel (Retail)
            </button>
          </div>
        )}

        {/* Body Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
          {/* Notifications */}
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-600" />
              <div className="flex-1">
                <p className="font-bold text-red-900">Gagal Memproses</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-600" />
              <p className="font-semibold">{successMsg}</p>
            </div>
          )}

          {/* Item Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Nama {itemType === 'SERVICE' ? 'Layanan' : 'Produk'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                itemType === 'SERVICE'
                  ? 'misal: Gentlemen Classic Haircut & Wash'
                  : 'misal: Matte Clay Pomade Strong Hold 100g'
              }
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
              required
            />
          </div>

          {/* Code & Price Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Code / SKU */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  {itemType === 'SERVICE' ? 'Kode Layanan' : 'SKU Produk'} <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleGenerateCode}
                  className="text-[10px] text-amber-600 hover:text-amber-700 flex items-center gap-0.5 font-bold"
                >
                  <Sparkles className="h-2.5 w-2.5" /> Auto-Gen
                </button>
              </div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={itemType === 'SERVICE' ? 'SRV-001' : 'PRD-001'}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 font-mono placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                required
              />
            </div>

            {/* Selling Price */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Harga Jual di Cabang Ini (Rp) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                  Rp
                </span>
                <input
                  type="number"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  placeholder="50000"
                  min="0"
                  step="500"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 font-mono placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                  required
                />
              </div>
            </div>
          </div>

          {/* Category Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Kategori {itemType === 'SERVICE' ? 'Layanan' : 'Produk'}
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsNewCategory(!isNewCategory);
                  if (!isNewCategory) setCustomCategory('');
                }}
                className="text-[10px] text-amber-600 hover:text-amber-700 flex items-center gap-1 font-bold"
              >
                {isNewCategory ? 'Pilih dari Daftar' : '+ Kategori Baru'}
              </button>
            </div>

            {isNewCategory ? (
              <input
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="Ketik nama kategori baru..."
                className="w-full rounded-xl border border-amber-500 bg-amber-50/30 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                autoFocus
              />
            ) : (
              <select
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
              >
                {dbCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Type-Specific Fields */}
          {itemType === 'SERVICE' ? (
            /* Duration for Service */
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Estimasi Durasi Pengerjaan
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[15, 30, 45, 60, 90].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDurationMinutes(mins)}
                    className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 border ${
                      durationMinutes === mins
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    {mins}m
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Product Specific: Barcode, Unit, Initial Stock */
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Barcode */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Barcode / EAN (Opsional)
                  </label>
                  <div className="relative">
                    <Barcode className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="e.g. 899123456789"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-3.5 py-2 text-sm text-slate-900 font-mono placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Base Unit */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Satuan Dasar
                  </label>
                  <select
                    value={baseUnit}
                    onChange={(e) => setBaseUnit(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                  >
                    {BASE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Initial Stock (Only for new product) */}
              {!isEditing && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Stok Awal di Cabang Ini
                  </label>
                  <div className="relative">
                    <Boxes className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      value={initialStock}
                      onChange={(e) => setInitialStock(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-3.5 py-2 text-sm text-slate-900 font-mono placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Stok akan langsung ditambahkan ke inventaris cabang ({currentOutlet?.name}).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Deskripsi Singkat (Opsional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Deskripsi layanan atau manfaat produk..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none transition-colors"
            />
          </div>

          {/* Active Status Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <p className="text-xs font-bold text-slate-800">Status Ketersediaan</p>
              <p className="text-[11px] text-slate-500">
                Item {isActive ? 'aktif dan tampil' : 'disembunyikan'} di katalog POS cabang ini
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                isActive ? 'bg-amber-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition shadow-xs ${
                  isActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Delete Section (Edit Mode Only) */}
          {isEditing && (
            <div className="pt-2 border-t border-slate-100">
              {confirmDelete ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 space-y-2">
                  <p className="text-xs font-bold text-red-900">
                    Konfirmasi Hapus {itemType === 'SERVICE' ? 'Layanan' : 'Produk'}?
                  </p>
                  <p className="text-[11px] text-red-700 leading-relaxed">
                    Jika item sudah memiliki riwayat transaksi penjualan, item akan dinonaktifkan secara aman agar neraca & komisi tidak terganggu.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-1 transition shadow-xs"
                    >
                      {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Ya, Hapus Sekarang
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-bold py-1.5 px-2.5 rounded-lg hover:bg-red-50 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus / Nonaktifkan Item Ini
                </button>
              )}
            </div>
          )}

          {/* Actions Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition shadow-xs ${
                itemType === 'SERVICE'
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'bg-blue-600 text-white hover:bg-blue-500'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  {isEditing ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {isEditing ? 'Simpan Perubahan' : 'Tambah ke Katalog'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
