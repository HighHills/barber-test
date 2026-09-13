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
  AlertTriangle,
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

  // Safeguard state
  const [confirmDeactivateCategory, setConfirmDeactivateCategory] =
    useState<ProductCategoryItem | null>(null);
  const [isSubmittingStatus, setIsSubmittingStatus] = useState<boolean>(false);

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

  // Operational Counts
  const activeCount = useMemo(() => categories.filter((c) => c.is_active).length, [categories]);
  const inactiveCount = useMemo(() => categories.length - activeCount, [categories, activeCount]);

  // Activate category directly
  const handleActivate = async (category: ProductCategoryItem) => {
    setTogglingId(category.id);

    try {
      const { error: rpcErr } = await supabase.rpc('save_product_category', {
        p_category_id: category.id,
        p_name: category.name,
        p_description: category.description,
        p_sort_order: category.sort_order,
        p_is_active: true,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Kategori "${category.name}" berhasil diaktifkan kembali.`,
      });

      setCategories((prev) =>
        prev.map((c) => (c.id === category.id ? { ...c, is_active: true } : c))
      );

      await refreshData();
    } catch (err: unknown) {
      console.error('Activate product category error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal mengaktifkan kategori produk';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setTogglingId(null);
    }
  };

  // Request deactivation with safeguard
  const handleRequestDeactivate = (category: ProductCategoryItem) => {
    if ((category.product_count ?? 0) > 0) {
      setConfirmDeactivateCategory(category);
    } else {
      handleConfirmDeactivate(category);
    }
  };

  // Confirm deactivation via RPC save_product_category
  const handleConfirmDeactivate = async (categoryTarget?: ProductCategoryItem) => {
    const target = categoryTarget || confirmDeactivateCategory;
    if (!target) return;

    setIsSubmittingStatus(true);
    setTogglingId(target.id);

    try {
      const { error: rpcErr } = await supabase.rpc('save_product_category', {
        p_category_id: target.id,
        p_name: target.name,
        p_description: target.description,
        p_sort_order: target.sort_order,
        p_is_active: false,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Kategori "${target.name}" berhasil dinonaktifkan.`,
      });

      setCategories((prev) =>
        prev.map((c) => (c.id === target.id ? { ...c, is_active: false } : c))
      );

      setConfirmDeactivateCategory(null);
      await refreshData();
    } catch (err: unknown) {
      console.error('Deactivate product category error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menonaktifkan kategori produk';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setIsSubmittingStatus(false);
      setTogglingId(null);
    }
  };

  // Keyboard Escape listener for safeguard dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDeactivateCategory && !isSubmittingStatus) {
          setConfirmDeactivateCategory(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDeactivateCategory, isSubmittingStatus]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return categories.filter((c) => {
      const matchQuery =
        !q ||
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
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-7 space-y-6 shadow-xs">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <FolderTree className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-white leading-tight">
              Kategori Produk & Retail
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Kelompokkan produk retail untuk etalase kasir dan pengelolaan inventaris.
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {categories.length} kategori · {activeCount} aktif · {inactiveCount} nonaktif
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => loadCategories(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-semibold border border-slate-700 disabled:opacity-50"
            title="Muat Ulang Data Kategori"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingCategory(null);
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-xs shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Kategori</span>
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
              placeholder="Cari nama atau deskripsi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition"
            />
          </div>

          {/* Status Segmented Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs shrink-0 self-start sm:self-auto">
            {(
              [
                { id: 'ALL', label: `Semua (${categories.length})` },
                { id: 'ACTIVE', label: `Aktif (${activeCount})` },
                { id: 'INACTIVE', label: `Nonaktif (${inactiveCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
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
            Menampilkan <strong className="text-white">{filteredCategories.length}</strong> dari{' '}
            <strong className="text-white">{categories.length}</strong> kategori
          </div>
          {(searchQuery || statusFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
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
            <p className="text-xs text-slate-400">Memuat data kategori produk...</p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <FolderTree className="w-8 h-8 text-slate-600 mx-auto opacity-50" />
            <p className="font-semibold text-slate-300">Tidak ada kategori produk yang sesuai</p>
            <p className="text-slate-500">
              {searchQuery || statusFilter !== 'ALL'
                ? 'Coba sesuaikan kata kunci pencarian atau reset filter status.'
                : 'Klik tombol "Tambah Kategori" di atas untuk membuat kategori produk baru.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredCategories.map((cat) => {
              const isToggling = togglingId === cat.id;

              return (
                <div
                  key={cat.id}
                  className="p-4 sm:p-5 transition hover:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  {/* Left Side: Name, Product Count, Sort Order, Description */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-white leading-tight">
                        {cat.name}
                      </h3>
                      {typeof cat.product_count === 'number' && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-medium text-slate-300">
                          <Package className="w-3.5 h-3.5 text-amber-400/80" />
                          <span>{cat.product_count} produk</span>
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-slate-500 bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-800/60">
                        Urutan {cat.sort_order}
                      </span>
                    </div>

                    {/* Description (HANYA render jika ada) */}
                    {cat.description && cat.description.trim() ? (
                      <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                        {cat.description}
                      </p>
                    ) : null}
                  </div>

                  {/* Right Side: Operational Status & Explicit Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t border-slate-800/60 sm:border-t-0 shrink-0">
                    {/* Status */}
                    <div className="pr-1">
                      {cat.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                          <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                          Nonaktif
                        </span>
                      )}
                    </div>

                    {/* Actions with min 40-44px touch targets */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategory(cat);
                          setIsModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80 font-medium text-xs transition"
                        aria-label={`Edit kategori ${cat.name}`}
                      >
                        <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Edit</span>
                      </button>

                      {cat.is_active ? (
                        <button
                          type="button"
                          onClick={() => handleRequestDeactivate(cat)}
                          disabled={isToggling}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 hover:bg-red-950/40 text-slate-400 hover:text-red-300 border border-slate-800 hover:border-red-900/50 text-xs font-medium transition disabled:opacity-40"
                          aria-label={`Nonaktifkan kategori ${cat.name}`}
                        >
                          {isToggling ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Power className="w-3.5 h-3.5" />
                          )}
                          <span>Nonaktifkan</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleActivate(cat)}
                          disabled={isToggling}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-800/40 text-xs font-medium transition disabled:opacity-40"
                          aria-label={`Aktifkan kembali kategori ${cat.name}`}
                        >
                          {isToggling ? (
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
              );
            })}
          </div>
        )}
      </div>

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

      {/* Safeguard Dialog: Confirmation Warning When Deactivating A Category With Products */}
      {confirmDeactivateCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-sm font-bold text-white">
                  Nonaktifkan kategori?
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Kategori <span className="text-amber-300 font-bold">"{confirmDeactivateCategory.name}"</span> saat ini digunakan oleh{' '}
                  <span className="font-bold text-white">{confirmDeactivateCategory.product_count} produk</span>.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-400 leading-relaxed space-y-1.5">
              <p className="text-slate-300 font-medium">Dampak Operasional:</p>
              <p>• Menonaktifkan kategori tidak akan menghapus produk, stok inventaris, riwayat pembelian, maupun transaksi sebelumnya.</p>
              <p>• Namun perubahan status kategori dapat memengaruhi ketersediaan atau pengelompokan kategori pada area operasional.</p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDeactivateCategory(null)}
                disabled={isSubmittingStatus}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeactivate()}
                disabled={isSubmittingStatus}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition shadow-xs disabled:opacity-40"
              >
                {isSubmittingStatus ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <span>Nonaktifkan Kategori</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
