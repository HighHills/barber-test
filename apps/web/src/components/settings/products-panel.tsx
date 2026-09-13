'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type {
  ProductItem,
  ProductCategoryItem,
  OutletItem,
  ProductOutletItem,
} from '../../types/settings';
import { ProductFormModal } from './product-form-modal';
import { ProductConversionModal } from './product-conversion-modal';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Scale,
  Power,
  RefreshCw,
  Loader2,
  Barcode,
  Store,
  AlertTriangle,
  Boxes,
  Coins,
  AlertCircle,
} from 'lucide-react';

interface ProductsPanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function ProductsPanel({ onNotification }: ProductsPanelProps): React.JSX.Element {
  const { supabase, refreshData, currentOutlet } = usePos();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<ProductCategoryItem[]>([]);
  const [outlets, setOutlets] = useState<OutletItem[]>([]);
  const [conversionCounts, setConversionCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);

  const [isConversionModalOpen, setIsConversionModalOpen] = useState<boolean>(false);
  const [conversionProduct, setConversionProduct] = useState<ProductItem | null>(null);

  // Safeguards & Status Toggle
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDeactivateProduct, setConfirmDeactivateProduct] = useState<ProductItem | null>(null);
  const [isSubmittingStatus, setIsSubmittingStatus] = useState<boolean>(false);

  // 1. Fetch Products, Categories, Outlets, Outlet Pricing, Stock, Recipes, and Conversion Counts (SELECT Only)
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      // 1. Fetch categories
      const { data: catData, error: catErr } = await supabase
        .from('product_categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (catErr) throw catErr;

      // 2. Fetch outlets
      const { data: outData, error: outErr } = await supabase
        .from('outlets')
        .select('*')
        .order('code', { ascending: true });
      if (outErr) throw outErr;

      // 3. Fetch products with category relation
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select(`
          id,
          category_id,
          sku,
          barcode,
          name,
          description,
          base_unit,
          default_cost_price,
          is_active,
          created_at,
          updated_at,
          product_categories (name, is_active)
        `)
        .order('name', { ascending: true });
      if (prodErr) throw prodErr;

      // 4. Fetch product_outlets
      const { data: poData, error: poErr } = await supabase
        .from('product_outlets')
        .select('*');
      if (poErr) throw poErr;

      // 5. Fetch product_unit_conversions count
      const { data: convData, error: convErr } = await supabase
        .from('product_unit_conversions')
        .select('id, product_id')
        .eq('is_active', true);
      if (convErr) throw convErr;

      const countsMap: Record<string, number> = {};
      (convData || []).forEach((c: any) => {
        countsMap[c.product_id] = (countsMap[c.product_id] || 0) + 1;
      });
      setConversionCounts(countsMap);

      // 6. Fetch service_consumptions count
      const { data: scData } = await supabase
        .from('service_consumptions')
        .select('product_id, is_active')
        .eq('is_active', true);

      const consumptionMap: Record<string, number> = {};
      (scData || []).forEach((sc: any) => {
        consumptionMap[sc.product_id] = (consumptionMap[sc.product_id] || 0) + 1;
      });

      // 7. Fetch current stock for current outlet (if active outlet selected)
      const stockMap: Record<string, number> = {};
      if (currentOutlet?.id) {
        const { data: invData } = await supabase
          .from('outlet_inventory')
          .select('product_id, quantity')
          .eq('outlet_id', currentOutlet.id);

        (invData || []).forEach((inv: any) => {
          stockMap[inv.product_id] = Number(inv.quantity || 0);
        });
      }

      // Map outlet pricing to each product
      const outletMap = new Map((outData || []).map((o: any) => [o.id, o]));
      const formattedProducts: ProductItem[] = (prodData || []).map((p: any) => {
        const outletPrices: ProductOutletItem[] = (poData || [])
          .filter((po: any) => po.product_id === p.id)
          .map((po: any) => ({
            product_id: po.product_id,
            outlet_id: po.outlet_id,
            selling_price: Number(po.selling_price || 0),
            is_active: po.is_active,
            outlet_name: outletMap.get(po.outlet_id)?.name || 'Cabang',
            outlet_code: outletMap.get(po.outlet_id)?.code || 'OUT',
          }));

        return {
          id: p.id,
          category_id: p.category_id,
          category_name: p.product_categories?.name || 'Tanpa Kategori',
          category_is_active: p.product_categories?.is_active !== false,
          sku: p.sku,
          barcode: p.barcode,
          name: p.name,
          description: p.description,
          base_unit: p.base_unit || 'pcs',
          default_cost_price: p.default_cost_price !== null ? Number(p.default_cost_price) : null,
          is_active: p.is_active,
          created_at: p.created_at,
          updated_at: p.updated_at,
          product_outlets: outletPrices,
          current_stock:
            currentOutlet?.id && stockMap[p.id] !== undefined ? stockMap[p.id] : null,
          service_consumption_count: consumptionMap[p.id] || 0,
        };
      });

      setProducts(formattedProducts);
      setCategories(catData || []);
      setOutlets(outData || []);
    } catch (err: any) {
      console.error('Failed to load products data:', err);
      onNotification?.({
        type: 'ERROR',
        message: err.message || 'Gagal memuat katalog produk',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase, currentOutlet, onNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Operational metrics
  const activeCount = useMemo(() => products.filter((p) => p.is_active).length, [products]);
  const inactiveCount = useMemo(() => products.length - activeCount, [products, activeCount]);
  const withConversionsCount = useMemo(
    () => products.filter((p) => (conversionCounts[p.id] || 0) > 0).length,
    [products, conversionCounts]
  );
  const withServiceUsageCount = useMemo(
    () => products.filter((p) => (p.service_consumption_count ?? 0) > 0).length,
    [products]
  );

  // Direct Activation via RPC save_product
  const handleActivate = async (product: ProductItem) => {
    setTogglingId(product.id);
    try {
      const { data, error } = await supabase.rpc('save_product', {
        p_product_id: product.id,
        p_category_id: product.category_id,
        p_sku: product.sku,
        p_barcode: product.barcode,
        p_name: product.name,
        p_description: product.description,
        p_base_unit: product.base_unit,
        p_default_cost_price: product.default_cost_price,
        p_is_active: true,
      });

      if (error) throw error;
      if (data && typeof data === 'object' && 'success' in data && !(data as any).success) {
        throw new Error((data as any).message || 'Gagal mengaktifkan produk');
      }

      onNotification?.({
        type: 'SUCCESS',
        message: `Produk "${product.name}" berhasil diaktifkan kembali.`,
      });

      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: true } : p))
      );

      await refreshData();
    } catch (err: any) {
      console.error('Activate product error:', err);
      onNotification?.({
        type: 'ERROR',
        message: err.message || 'Gagal mengaktifkan produk',
      });
    } finally {
      setTogglingId(null);
    }
  };

  // Confirmed Deactivation via RPC save_product
  const handleConfirmDeactivate = async () => {
    if (!confirmDeactivateProduct) return;

    setIsSubmittingStatus(true);
    try {
      const { data, error } = await supabase.rpc('save_product', {
        p_product_id: confirmDeactivateProduct.id,
        p_category_id: confirmDeactivateProduct.category_id,
        p_sku: confirmDeactivateProduct.sku,
        p_barcode: confirmDeactivateProduct.barcode,
        p_name: confirmDeactivateProduct.name,
        p_description: confirmDeactivateProduct.description,
        p_base_unit: confirmDeactivateProduct.base_unit,
        p_default_cost_price: confirmDeactivateProduct.default_cost_price,
        p_is_active: false,
      });

      if (error) throw error;
      if (data && typeof data === 'object' && 'success' in data && !(data as any).success) {
        throw new Error((data as any).message || 'Gagal menonaktifkan produk');
      }

      onNotification?.({
        type: 'SUCCESS',
        message: `Produk "${confirmDeactivateProduct.name}" berhasil dinonaktifkan.`,
      });

      setProducts((prev) =>
        prev.map((p) =>
          p.id === confirmDeactivateProduct.id ? { ...p, is_active: false } : p
        )
      );

      setConfirmDeactivateProduct(null);
      await refreshData();
    } catch (err: any) {
      console.error('Deactivate product error:', err);
      onNotification?.({
        type: 'ERROR',
        message: err.message || 'Gagal menonaktifkan produk',
      });
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  // Keyboard Escape listener for safeguard dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDeactivateProduct && !isSubmittingStatus) {
          setConfirmDeactivateProduct(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDeactivateProduct, isSubmittingStatus]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search
      const query = searchQuery.trim().toLowerCase();
      const matchSearch =
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        (p.barcode && p.barcode.toLowerCase().includes(query)) ||
        (p.description && p.description.toLowerCase().includes(query));

      // Category
      const matchCategory =
        categoryFilter === 'ALL' || p.category_id === categoryFilter;

      // Status
      const matchStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'ACTIVE'
          ? p.is_active
          : !p.is_active;

      return matchSearch && matchCategory && matchStatus;
    });
  }, [products, searchQuery, categoryFilter, statusFilter]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-7 space-y-6 shadow-xs">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-white leading-tight">
              Katalog Produk & Retail
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Kelola produk retail/konsumsi, SKU, barcode, harga per cabang, stok aktual, dan konversi multi-satuan.
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {products.length} produk terdaftar · {activeCount} aktif · {withConversionsCount} multi-satuan
            {withServiceUsageCount > 0 ? ` · ${withServiceUsageCount} digunakan di resep bahan` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-semibold border border-slate-700 disabled:opacity-50 min-h-[40px] cursor-pointer"
            title="Muat Ulang Data Produk"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingProduct(null);
              setIsFormModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-xs shadow-amber-500/20 min-h-[40px] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Produk</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari SKU, barcode, nama, atau deskripsi produk..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition min-h-[40px]"
            />
          </div>

          {/* Category Dropdown */}
          <div className="sm:w-56 shrink-0">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none transition min-h-[40px]"
            >
              <option value="ALL">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {!c.is_active ? '(Nonaktif)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Status Segmented Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs shrink-0 self-start sm:self-auto">
            {(
              [
                { id: 'ALL', label: `Semua (${products.length})` },
                { id: 'ACTIVE', label: `Aktif (${activeCount})` },
                { id: 'INACTIVE', label: `Nonaktif (${inactiveCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition min-h-[36px] cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-slate-800 text-amber-300 font-semibold shadow-xs border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Summary & Reset */}
        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
          <div>
            Menampilkan <strong className="text-white">{filteredProducts.length}</strong> dari{' '}
            <strong className="text-white">{products.length}</strong> produk
          </div>
          {(searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="text-amber-400 hover:underline cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Dense Operational List */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16 space-y-3">
            <Loader2 className="w-7 h-7 animate-spin text-amber-500" />
            <p className="text-xs text-slate-400">Memuat katalog produk...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <Package className="w-8 h-8 text-slate-600 mx-auto opacity-50" />
            <p className="font-semibold text-slate-300">Tidak ada produk yang sesuai kriteria</p>
            <p className="text-slate-500">
              {searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL'
                ? 'Coba sesuaikan kata kunci pencarian atau reset filter kategori/status.'
                : 'Klik tombol "Tambah Produk" untuk mendaftarkan barang retail atau stok bahan.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredProducts.map((p) => {
              const hasConversions = (conversionCounts[p.id] || 0) > 0;
              const recipeUsage = p.service_consumption_count || 0;

              // Current outlet price resolution
              const currentOutletPricing = p.product_outlets?.find(
                (po) => po.outlet_id === currentOutlet?.id
              );
              const activeOutletsCount =
                p.product_outlets?.filter((po) => po.is_active).length || 0;
              const totalOutletsCount = outlets.length;

              // Price range calculation across active outlets
              const activePrices = (p.product_outlets || [])
                .filter((po) => po.is_active)
                .map((po) => po.selling_price);
              const minPrice = activePrices.length > 0 ? Math.min(...activePrices) : null;
              const maxPrice = activePrices.length > 0 ? Math.max(...activePrices) : null;
              const hasPriceRange =
                minPrice !== null && maxPrice !== null && minPrice !== maxPrice;

              return (
                <div
                  key={p.id}
                  className="p-4 sm:p-5 transition hover:bg-slate-900/50"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Info, Tags, Description, Operational Context */}
                    <div className="space-y-2 flex-1 min-w-0">
                      {/* Line 1: SKU, Barcode, Name, Category, Base Unit */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                          {p.sku}
                        </span>
                        {p.barcode && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-400 font-medium">
                            <Barcode className="w-3 h-3 text-slate-500" />
                            {p.barcode}
                          </span>
                        )}
                        <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                          {p.name}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                            p.category_is_active === false
                              ? 'bg-amber-950/40 border-amber-800/40 text-amber-400'
                              : 'bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          {p.category_name}
                          {p.category_is_active === false ? ' (Nonaktif)' : ''}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[11px] text-slate-400 font-medium">
                          Satuan: <strong className="text-slate-200 font-mono">{p.base_unit}</strong>
                        </span>
                      </div>

                      {/* Line 2: Description (rendered only if present) */}
                      {p.description && (
                        <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 max-w-2xl">
                          {p.description}
                        </p>
                      )}

                      {/* Line 3: Operational Badges (Stock, HPP, Conversions, Recipes, Outlets) */}
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {/* Stock Badge for current outlet */}
                        {currentOutlet ? (
                          p.current_stock !== null && p.current_stock !== undefined ? (
                            p.current_stock > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                <Package className="w-3.5 h-3.5 text-emerald-400" />
                                <span>
                                  Stok: {p.current_stock.toLocaleString('id-ID')} {p.base_unit}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-400">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                                <span>Stok Habis (0 {p.base_unit})</span>
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 text-slate-400">
                              <Package className="w-3.5 h-3.5 text-slate-500" />
                              <span>Stok: Belum tercatat</span>
                            </span>
                          )
                        ) : null}

                        {/* Default Cost Price / HPP */}
                        {p.default_cost_price !== null && p.default_cost_price !== undefined && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono">
                            <Coins className="w-3.5 h-3.5 text-slate-500" />
                            <span>HPP: Rp {p.default_cost_price.toLocaleString('id-ID')}</span>
                          </span>
                        )}

                        {/* Unit Conversions Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setConversionProduct(p);
                            setIsConversionModalOpen(true);
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition border cursor-pointer ${
                            hasConversions
                              ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300'
                              : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-300'
                          }`}
                          title="Klik untuk konfigurasi konversi multi-satuan"
                        >
                          <Scale
                            className={`w-3.5 h-3.5 ${
                              hasConversions ? 'text-amber-400' : 'text-slate-500'
                            }`}
                          />
                          <span>
                            {hasConversions
                              ? `${conversionCounts[p.id]} konversi kemasan`
                              : '+ Konversi satuan'}
                          </span>
                        </button>

                        {/* Service consumption recipe dependency badge */}
                        {recipeUsage > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium">
                            <Boxes className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Bahan {recipeUsage} layanan</span>
                          </span>
                        )}

                        {/* Multi-outlet coverage */}
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400">
                          <Store className="w-3.5 h-3.5 text-slate-500" />
                          <span>
                            {activeOutletsCount}/{totalOutletsCount} cabang aktif
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Right: Pricing Context, Status, and Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center lg:items-center justify-between lg:justify-end gap-4 shrink-0 pt-3 lg:pt-0 border-t border-slate-800/60 lg:border-t-0">
                      {/* Dominant Price Context */}
                      <div className="text-left sm:text-right min-w-[150px]">
                        <div className="text-[11px] text-slate-400 font-medium truncate max-w-[180px]">
                          {currentOutlet ? `Harga di ${currentOutlet.name}` : 'Harga Cabang'}
                        </div>
                        {currentOutletPricing && currentOutletPricing.is_active ? (
                          <div className="text-base font-bold font-mono text-white tracking-tight">
                            Rp {currentOutletPricing.selling_price.toLocaleString('id-ID')}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 italic py-0.5">
                            Belum disetel di cabang ini
                          </div>
                        )}
                        {hasPriceRange && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            Rentang: Rp {minPrice?.toLocaleString('id-ID')} –{' '}
                            {maxPrice?.toLocaleString('id-ID')}
                          </div>
                        )}
                      </div>

                      {/* Operational Status */}
                      <div className="flex items-center">
                        {p.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                            Nonaktif
                          </span>
                        )}
                      </div>

                      {/* Operational Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setConversionProduct(p);
                            setIsConversionModalOpen(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-slate-700 text-xs font-semibold transition cursor-pointer"
                          title="Kelola konversi multi-satuan produk"
                          aria-label={`Atur konversi satuan untuk ${p.name}`}
                        >
                          <Scale className="w-3.5 h-3.5 text-amber-400" />
                          <span className="hidden sm:inline">Konversi</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct(p);
                            setIsFormModalOpen(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold transition cursor-pointer"
                          aria-label={`Edit produk ${p.name}`}
                        >
                          <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Edit</span>
                        </button>

                        {p.is_active ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDeactivateProduct(p)}
                            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] rounded-xl bg-slate-950 hover:bg-red-950/40 text-slate-400 hover:text-red-300 border border-slate-800 hover:border-red-800/40 text-xs font-medium transition cursor-pointer"
                            aria-label={`Nonaktifkan produk ${p.name}`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Nonaktifkan</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleActivate(p)}
                            disabled={togglingId === p.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] rounded-xl bg-slate-950 hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-800/40 text-xs font-medium transition disabled:opacity-40 cursor-pointer"
                            aria-label={`Aktifkan kembali produk ${p.name}`}
                          >
                            {togglingId === p.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Power className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            <span>Aktifkan</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Product Form Modal (save_product_catalog_with_outlets) */}
      <ProductFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingProduct(null);
        }}
        product={editingProduct}
        categories={categories}
        outlets={outlets}
        onSuccess={() => {
          loadData(true);
        }}
        onNotification={onNotification}
      />

      {/* Product Conversion Modal (save_product_unit_conversion) */}
      <ProductConversionModal
        isOpen={isConversionModalOpen}
        onClose={() => {
          setIsConversionModalOpen(false);
          setConversionProduct(null);
          loadData(true);
        }}
        product={conversionProduct}
        onNotification={onNotification}
      />

      {/* Safeguard Dialog: Confirmation Warning When Deactivating A Product */}
      {confirmDeactivateProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-sm font-bold text-white">
                  Konfirmasi Nonaktifkan Produk
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Yakin ingin menonaktifkan produk{' '}
                  <span className="font-mono text-amber-300 font-bold">
                    [{confirmDeactivateProduct.sku}]
                  </span>{' '}
                  {confirmDeactivateProduct.name}?
                </p>
              </div>
            </div>

            {/* Recipe usage alert if product is used as material in services */}
            {(confirmDeactivateProduct.service_consumption_count ?? 0) > 0 && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 leading-relaxed space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-amber-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Perhatian: Produk Digunakan di Resep Layanan
                </p>
                <p>
                  Produk ini tercatat sebagai bahan baku pada{' '}
                  <strong>{confirmDeactivateProduct.service_consumption_count} layanan aktif</strong>.
                  Menonaktifkan produk ini dapat menyebabkan transaksi layanan terkait di kasir POS terkendala bila bahan baku tidak dapat dipotong otomatis.
                </p>
              </div>
            )}

            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-400 leading-relaxed space-y-1.5">
              <p className="text-slate-300 font-medium">Dampak Operasional:</p>
              <p>• Produk tidak akan lagi muncul di katalog kasir POS untuk penjualan retail langsung.</p>
              <p>• Riwayat nota transaksi penjualan (<span className="font-mono text-slate-300">sale_items</span>) dan mutasi stok lampau (<span className="font-mono text-slate-300">inventory_movements</span>) tetap tersimpan aman.</p>
              <p>• Konfigurasi konversi satuan dan harga jual per cabang tetap dipertahankan dan dapat diaktifkan kembali sewaktu-waktu.</p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDeactivateProduct(null)}
                disabled={isSubmittingStatus}
                className="px-4 py-2 min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivate}
                disabled={isSubmittingStatus}
                className="flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition shadow-xs disabled:opacity-40 cursor-pointer"
              >
                {isSubmittingStatus ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <span>Nonaktifkan Produk</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
