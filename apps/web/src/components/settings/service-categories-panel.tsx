'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { ServiceCategoryItem } from '../../types/settings';
import { ServiceCategoryModal } from './service-category-modal';
import {
  Tags,
  Plus,
  Search,
  Edit2,
  Power,
  RefreshCw,
  Loader2,
  Layers,
} from 'lucide-react';

interface ServiceCategoriesPanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function ServiceCategoriesPanel({
  onNotification,
}: ServiceCategoriesPanelProps): React.JSX.Element {
  const { supabase, refreshData } = usePos();

  const [categories, setCategories] = useState<ServiceCategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategoryItem | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // 1. Fetch categories & service counts (SELECT Only)
  const loadCategories = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      // 1. Fetch service categories
      const { data: catData, error: catErr } = await supabase
        .from('service_categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (catErr) throw catErr;

      // 2. Fetch service count per category
      const { data: srvData } = await supabase
        .from('services')
        .select('category_id');

      const countMap: Record<string, number> = {};
      if (srvData) {
        srvData.forEach((s: { category_id: string }) => {
          countMap[s.category_id] = (countMap[s.category_id] || 0) + 1;
        });
      }

      const formatted: ServiceCategoryItem[] = (catData || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        sort_order: c.sort_order ?? 0,
        is_active: c.is_active !== false,
        created_at: c.created_at,
        updated_at: c.updated_at,
        service_count: countMap[c.id] || 0,
      }));

      setCategories(formatted);
    } catch (err: unknown) {
      console.error('Error loading service categories:', err);
      const msg = err instanceof Error ? err.message : 'Gagal memuat kategori layanan';
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

  // 2. Toggle active via RPC save_service_category
  const handleToggleActive = async (category: ServiceCategoryItem) => {
    const newStatus = !category.is_active;
    setTogglingId(category.id);

    try {
      const { error: rpcErr } = await supabase.rpc('save_service_category', {
        p_category_id: category.id,
        p_name: category.name,
        p_description: category.description,
        p_sort_order: category.sort_order,
        p_is_active: newStatus,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Kategori "${category.name}" berhasil ${
          newStatus ? 'diaktifkan' : 'dinonaktifkan'
        }.`,
      });

      setCategories((prev) =>
        prev.map((c) => (c.id === category.id ? { ...c, is_active: newStatus } : c))
      );

      await refreshData();
    } catch (err: unknown) {
      console.error('Toggle category status error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status kategori';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setTogglingId(null);
    }
  };

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
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Tags className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-white leading-tight">
              Kategori Layanan
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Kelola kelompok menu treatment, pangkas rambut, dan cukur untuk katalog POS.
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
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-medium border border-slate-700/80"
            title="Muat ulang data kategori"
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
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-xs shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Kategori</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama atau deskripsi kategori..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition"
          />
        </div>

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

      {/* Dense Operational List */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16 space-y-3">
            <Loader2 className="w-7 h-7 animate-spin text-amber-500" />
            <p className="text-xs text-slate-400">Memuat data kategori layanan...</p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Tidak ada kategori layanan yang sesuai dengan filter atau pencarian Anda.
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
                  {/* Left Side: Hierarchy & Information */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-white leading-tight">
                        {cat.name}
                      </h3>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-medium text-slate-300">
                        <Layers className="w-3 h-3 text-amber-400/80" />
                        <span>{cat.service_count} layanan</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-800/60">
                        Urutan {cat.sort_order}
                      </span>
                    </div>

                    {/* Description (Rendered ONLY if present) */}
                    {cat.description && cat.description.trim() ? (
                      <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                        {cat.description}
                      </p>
                    ) : null}
                  </div>

                  {/* Right Side: Operational Status & Explicit Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t border-slate-800/60 sm:border-t-0 shrink-0">
                    {/* Operational Status */}
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

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategory(cat);
                          setIsModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 font-medium text-xs transition"
                        title={`Edit ${cat.name}`}
                      >
                        <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleActive(cat)}
                        disabled={isToggling}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition text-xs font-medium ${
                          cat.is_active
                            ? 'bg-slate-900 hover:bg-red-950/40 text-slate-400 hover:text-red-300 border-slate-800 hover:border-red-900/50'
                            : 'bg-emerald-950/30 hover:bg-emerald-950/50 text-emerald-400 border-emerald-500/30 hover:border-emerald-500/50'
                        }`}
                        title={cat.is_active ? `Nonaktifkan ${cat.name}` : `Aktifkan ${cat.name}`}
                      >
                        {isToggling ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Power className="w-3.5 h-3.5" />
                        )}
                        <span>{cat.is_active ? 'Nonaktifkan' : 'Aktifkan'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Category Modal */}
      <ServiceCategoryModal
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

