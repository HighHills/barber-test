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
  Coins,
  Store,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface ProductsPanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function ProductsPanel({ onNotification }: ProductsPanelProps): React.JSX.Element {
  const { supabase, refreshData } = usePos();

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

  const [togglingId, setTogglingId] = useState<string | null>(null);

  // 1. Fetch Products, Categories, Outlets, Outlet Pricing, and Conversion Counts (SELECT Only)
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
          product_categories (name)
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
            outlet_name: outletMap.get(po.outlet_id)?.name || 'Unknown Outlet',
            outlet_code: outletMap.get(po.outlet_id)?.code || 'OUT',
          }));

        return {
          id: p.id,
          category_id: p.category_id,
          category_name: p.product_categories?.name || 'Tanpa Kategori',
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
  }, [supabase, onNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 2. Toggle Product Active Status via RPC save_product
  const handleToggleActive = async (product: ProductItem) => {
    setTogglingId(product.id);
    try {
      const nextActive = !product.is_active;

      const { data, error } = await supabase.rpc('save_product', {
        p_product_id: product.id,
        p_category_id: product.category_id,
        p_sku: product.sku,
        p_barcode: product.barcode,
        p_name: product.name,
        p_description: product.description,
        p_base_unit: product.base_unit,
        p_default_cost_price: product.default_cost_price,
        p_is_active: nextActive,
      });

      if (error) throw error;
      if (data && typeof data === 'object' && 'success' in data && !(data as any).success) {
        throw new Error((data as any).message || 'Gagal mengubah status produk');
      }

      onNotification?.({
        type: 'SUCCESS',
        message: `Produk "${product.name}" berhasil ${nextActive ? 'diaktifkan' : 'dinonaktifkan'}`,
      });

      // Optimistic update
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: nextActive } : p))
      );

      // Refresh POS state
      refreshData();
    } catch (err: any) {
      console.error('Failed to toggle product status:', err);
      onNotification?.({
        type: 'ERROR',
        message: err.message || 'Gagal mengubah status produk',
      });
    } finally {
      setTogglingId(null);
    }
  };

  // 3. Filtered Products
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
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && p.is_active) ||
        (statusFilter === 'INACTIVE' && !p.is_active);

      return matchSearch && matchCategory && matchStatus;
    });
  }, [products, searchQuery, categoryFilter, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Package className="w-6 h-6 text-amber-500" />
            Katalog Produk
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Kelola produk retail/konsumsi, SKU, barcode, harga per outlet, dan konversi multi-satuan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isLoading || isRefreshing}
            className="p-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors disabled:opacity-50"
            title="Muat Ulang Data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingProduct(null);
              setIsFormModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm rounded-lg transition-colors shadow-sm shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            Tambah Produk
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, SKU, atau barcode..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>

        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          >
            <option value="ALL">Semua Kategori Produk</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name} {!cat.is_active ? '(Nonaktif)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">Hanya Aktif</option>
            <option value="INACTIVE">Hanya Nonaktif</option>
          </select>
        </div>
      </div>

      {/* Main List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Memuat katalog produk...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-center px-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
            <Package className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
            {searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL'
              ? 'Tidak ada produk yang cocok'
              : 'Belum ada produk'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">
            {searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL'
              ? 'Coba sesuaikan kata kunci pencarian atau filter status yang Anda pilih.'
              : 'Tambahkan produk pertama untuk mulai mengelola stok dan penjualan di kasir POS.'}
          </p>
          {(searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL') ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
            >
              Reset Semua Filter
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingProduct(null);
                setIsFormModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Produk Sekarang
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredProducts.map((p) => {
            const hasConversions = (conversionCounts[p.id] || 0) > 0;
            return (
              <div
                key={p.id}
                className={`p-4 bg-white dark:bg-slate-900 rounded-xl border transition-all ${
                  p.is_active
                    ? 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    : 'border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40 opacity-75'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Info Left */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                      <Package className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {p.sku}
                        </span>
                        {p.barcode && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60">
                            <Barcode className="w-3 h-3 text-slate-400" />
                            {p.barcode}
                          </span>
                        )}
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/50">
                          {p.category_name}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          Satuan: <strong className="text-slate-800 dark:text-slate-200">{p.base_unit}</strong>
                        </span>
                        {p.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/50 dark:border-emerald-800/50">
                            <CheckCircle2 className="w-3 h-3" />
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                            <XCircle className="w-3 h-3" />
                            Nonaktif
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                        {p.name}
                      </h3>

                      {p.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                          {p.description}
                        </p>
                      )}

                      {/* Pricing per Outlet chips */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
                          <Store className="w-3.5 h-3.5" />
                          Harga Jual:
                        </span>
                        {p.product_outlets && p.product_outlets.length > 0 ? (
                          p.product_outlets.map((po) => (
                            <div
                              key={po.outlet_id}
                              className={`text-xs px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${
                                po.is_active
                                  ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium'
                                  : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-800 text-slate-400 line-through'
                              }`}
                            >
                              <span className="text-[10px] font-bold text-slate-400 uppercase">
                                {po.outlet_code}
                              </span>
                              <span>Rp {po.selling_price.toLocaleString('id-ID')}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-amber-600 dark:text-amber-400 italic">
                            Belum disetel di outlet manapun
                          </span>
                        )}

                        {p.default_cost_price !== null && (
                          <div className="text-xs px-2 py-1 rounded-md bg-slate-100/70 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 flex items-center gap-1 ml-auto">
                            <Coins className="w-3 h-3 text-slate-400" />
                            HPP: Rp {p.default_cost_price.toLocaleString('id-ID')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-2 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800 shrink-0 self-end lg:self-center">
                    {/* Unit Conversions Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setConversionProduct(p);
                        setIsConversionModalOpen(true);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        hasConversions
                          ? 'border-indigo-200 dark:border-indigo-800/60 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                      title="Atur Konversi Satuan (Multi-Unit)"
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>Konversi ({conversionCounts[p.id] || 0})</span>
                    </button>

                    {/* Edit Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProduct(p);
                        setIsFormModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title="Edit Produk"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    {/* Toggle Active Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleActive(p)}
                      disabled={togglingId === p.id}
                      className={`p-2 rounded-lg border transition-colors ${
                        p.is_active
                          ? 'border-emerald-200 dark:border-emerald-800 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                          : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title={p.is_active ? 'Nonaktifkan Produk' : 'Aktifkan Produk'}
                    >
                      {togglingId === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                      ) : (
                        <Power className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
    </div>
  );
}
