'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { ProductCategoryItem } from '../../types/settings';
import { ProductCategoryModal } from './product-category-modal';
import {
  FolderTree,
  Plus,
  Search,
  Edit2,
  Power,
  RefreshCw,
  Loader2,
  Package,
} from 'lucide-react';

interface ProductCategoriesPanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function ProductCategoriesPanel({
  onNotification,
}: ProductCategoriesPanelProps): React.JSX.Element {
  const { supabase, refreshData } = usePos();

  const [categories, setCategories] = useState<ProductCategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategoryItem | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // 1. Fetch categories & product counts (SELECT Only)
  const loadCategories = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      // 1. Fetch product categories
      const { data: catData, error: catErr } = await supabase
        .from('product_categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (catErr) throw catErr;

      // 2. Fetch product count per category
      const { data: prdData } = await supabase
        .from('products')
        .select('category_id');

      const countMap: Record<string, number> = {};
      if (prdData) {
        prdData.forEach((p: { category_id: string }) => {
          countMap[p.category_id] = (countMap[p.category_id] || 0) + 1;
        });
      }

      const formatted: ProductCategoryItem[] = (catData || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        sort_order: c.sort_order ?? 0,
        is_active: c.is_active !== false,
        created_at: c.created_at,
        updated_at: c.updated_at,
        product_count: countMap[c.id] || 0,
      }));

      setCategories(formatted);
    } catch (err: unknown) {
      console.error('Error loading product categories:', err);
      const msg = err instanceof Error ? err.message : 'Gagal memuat kategori produk';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase, onNotification]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // 2. Toggle active via RPC save_product_category
  const handleToggleActive = async (category: ProductCategoryItem) => {
    const newStatus = !category.is_active;
    setTogglingId(category.id);

    try {
      const { error: rpcErr } = await supabase.rpc('save_product_category', {
        p_category_id: category.id,
        p_name: category.name,
        p_description: category.description,
        p_sort_order: category.sort_order,
        p_is_active: newStatus,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Kategori "${category.name}" berhasil diubah menjadi: ${
          newStatus ? 'AKTIF' : 'NONAKTIF'
        }`,
      });

      setCategories((prev) =>
        prev.map((c) => (c.id === category.id ? { ...c, is_active: newStatus } : c))
      );

      await refreshData();
    } catch (err: unknown) {
      console.error('Toggle product category status error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status kategori produk';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setTogglingId(null);
    }
  };

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const q = searchQuery.toLowerCase();
      const matchQuery =
        !searchQuery ||
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q));

      const matchStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'ACTIVE'
          ? c.is_active
          : !c.is_active;

      return matchQuery && matchStatus;
    });
  }, [categories, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
            <FolderTree className="w-4 h-4" />
            <span>POS & Etalase Katalog</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Kategori Produk & Retail</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Kelompokkan produk pomade, tonic, perlengkapan styling, dan bahan kimia operasional
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => loadCategories(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-medium border border-slate-700"
            title="Muat Ulang Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>

          <button
            onClick={() => {
              setEditingCategory(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-xs shadow-md shadow-amber-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Kategori</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 relative text-xs">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari kategori produk..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition text-xs"
          />
        </div>

        <div className="w-full sm:w-48 text-xs">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">Hanya Aktif</option>
            <option value="INACTIVE">Hanya Nonaktif</option>
          </select>
        </div>
      </div>

      {/* Content Cards */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-500" />
          <p className="text-sm font-medium">Memuat data kategori produk...</p>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <FolderTree className="w-12 h-12 mx-auto mb-3 text-slate-600 opacity-60" />
          <p className="text-sm font-semibold text-white">Tidak ada kategori produk yang sesuai</p>
          <p className="text-xs text-slate-500 mt-1">
            Klik tombol "Tambah Kategori" di atas untuk membuat kategori produk baru.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCategories.map((cat) => {
            const isToggling = togglingId === cat.id;

            return (
              <div
                key={cat.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg hover:border-slate-700 transition flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-bold text-amber-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      Sort: {cat.sort_order}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        cat.is_active
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-red-500/10 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {cat.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white leading-snug">{cat.name}</h3>

                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {cat.description || 'Tidak ada deskripsi.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Package className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      <strong className="text-white">{cat.product_count}</strong> produk
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setEditingCategory(cat);
                        setIsModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                      title="Ubah Kategori"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                    </button>

                    <button
                      onClick={() => handleToggleActive(cat)}
                      disabled={isToggling}
                      className={`p-1.5 rounded-lg border transition ${
                        cat.is_active
                          ? 'bg-red-950/40 hover:bg-red-900/60 text-red-400 border-red-500/30'
                          : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border-emerald-500/30'
                      }`}
                      title={cat.is_active ? 'Nonaktifkan Kategori' : 'Aktifkan Kategori'}
                    >
                      {isToggling ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Power className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Product Category Modal */}
      <ProductCategoryModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCategory(null);
        }}
        category={editingCategory}
        onSuccess={() => loadCategories(true)}
        onNotification={onNotification}
      />
    </div>
  );
}
