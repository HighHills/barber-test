'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type {
  ServiceItem,
  ServiceCategoryItem,
  OutletItem,
  ServiceOutletItem,
} from '../../types/settings';
import { ServiceFormModal } from './service-form-modal';
import { ServiceConsumptionModal } from './service-consumption-modal';
import {
  Scissors,
  Plus,
  Search,
  Edit2,
  Boxes,
  Power,
  RefreshCw,
  Loader2,
  Clock,
  AlertTriangle,
  Store,
} from 'lucide-react';

interface ServicesPanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function ServicesPanel({ onNotification }: ServicesPanelProps): React.JSX.Element {
  const { supabase, refreshData, currentOutlet } = usePos();

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategoryItem[]>([]);
  const [outlets, setOutlets] = useState<OutletItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);

  const [isConsumptionModalOpen, setIsConsumptionModalOpen] = useState<boolean>(false);
  const [consumptionService, setConsumptionService] = useState<ServiceItem | null>(null);

  // Safeguard state
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDeactivateService, setConfirmDeactivateService] = useState<ServiceItem | null>(null);
  const [isSubmittingStatus, setIsSubmittingStatus] = useState<boolean>(false);

  // 1. Fetch Services, Categories, Outlets, and Outlet Pricing (SELECT Only)
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      // 1. Fetch categories
      const { data: catData, error: catErr } = await supabase
        .from('service_categories')
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

      // 3. Fetch services with category relation
      const { data: srvData, error: srvErr } = await supabase
        .from('services')
        .select(`
          id,
          category_id,
          code,
          name,
          description,
          duration_minutes,
          default_cost_price,
          is_active,
          created_at,
          updated_at,
          service_categories (name)
        `)
        .order('name', { ascending: true });
      if (srvErr) throw srvErr;

      // 4. Fetch service_outlets
      const { data: soData, error: soErr } = await supabase
        .from('service_outlets')
        .select('*');
      if (soErr) throw soErr;

      // 5. Fetch service_consumptions count
      const { data: scData } = await supabase
        .from('service_consumptions')
        .select('service_id, is_active')
        .eq('is_active', true);

      const consumptionCountMap: Record<string, number> = {};
      if (scData) {
        scData.forEach((sc: { service_id: string }) => {
          consumptionCountMap[sc.service_id] = (consumptionCountMap[sc.service_id] || 0) + 1;
        });
      }

      // Map service outlets
      const soMap: Record<string, ServiceOutletItem[]> = {};
      if (soData) {
        soData.forEach((so: any) => {
          if (!soMap[so.service_id]) soMap[so.service_id] = [];
          const out = (outData || []).find((o: any) => o.id === so.outlet_id);
          soMap[so.service_id].push({
            service_id: so.service_id,
            outlet_id: so.outlet_id,
            selling_price: parseFloat(so.selling_price) || 0,
            is_active: so.is_active !== false,
            outlet_name: out?.name || 'Cabang',
            outlet_code: out?.code || 'OUT',
          });
        });
      }

      const formattedServices: ServiceItem[] = (srvData || []).map((s: any) => ({
        id: s.id,
        category_id: s.category_id,
        category_name: s.service_categories?.name || 'Umum',
        code: s.code,
        name: s.name,
        description: s.description,
        duration_minutes: s.duration_minutes,
        default_cost_price: s.default_cost_price ? parseFloat(s.default_cost_price) : 0,
        is_active: s.is_active !== false,
        created_at: s.created_at,
        updated_at: s.updated_at,
        service_outlets: soMap[s.id] || [],
        consumption_count: consumptionCountMap[s.id] || 0,
      }));

      setCategories((catData || []) as ServiceCategoryItem[]);
      setOutlets((outData || []) as OutletItem[]);
      setServices(formattedServices);
    } catch (err: unknown) {
      console.error('Error loading services:', err);
      const msg = err instanceof Error ? err.message : 'Gagal memuat katalog layanan';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase, onNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Operational metrics
  const activeCount = useMemo(() => services.filter((s) => s.is_active).length, [services]);
  const inactiveCount = useMemo(() => services.length - activeCount, [services, activeCount]);
  const withBahanCount = useMemo(
    () => services.filter((s) => (s.consumption_count ?? 0) > 0).length,
    [services]
  );

  // Activate Service directly
  const handleActivate = async (service: ServiceItem) => {
    setTogglingId(service.id);
    try {
      const { error: rpcErr } = await supabase.rpc('save_service', {
        p_service_id: service.id,
        p_category_id: service.category_id,
        p_code: service.code,
        p_name: service.name,
        p_description: service.description,
        p_duration_minutes: service.duration_minutes,
        p_default_cost_price: service.default_cost_price,
        p_is_active: true,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Layanan "${service.name}" berhasil diaktifkan kembali.`,
      });

      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, is_active: true } : s))
      );

      await refreshData();
    } catch (err: unknown) {
      console.error('Activate service error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal mengaktifkan layanan';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setTogglingId(null);
    }
  };

  // Confirm Deactivation via RPC save_service
  const handleConfirmDeactivate = async () => {
    if (!confirmDeactivateService) return;

    setIsSubmittingStatus(true);
    try {
      const { error: rpcErr } = await supabase.rpc('save_service', {
        p_service_id: confirmDeactivateService.id,
        p_category_id: confirmDeactivateService.category_id,
        p_code: confirmDeactivateService.code,
        p_name: confirmDeactivateService.name,
        p_description: confirmDeactivateService.description,
        p_duration_minutes: confirmDeactivateService.duration_minutes,
        p_default_cost_price: confirmDeactivateService.default_cost_price,
        p_is_active: false,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Layanan "${confirmDeactivateService.name}" berhasil dinonaktifkan.`,
      });

      setServices((prev) =>
        prev.map((s) => (s.id === confirmDeactivateService.id ? { ...s, is_active: false } : s))
      );

      setConfirmDeactivateService(null);
      await refreshData();
    } catch (err: unknown) {
      console.error('Deactivate service error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menonaktifkan layanan';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  // Keyboard Escape listener for confirmation safeguard dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDeactivateService && !isSubmittingStatus) {
          setConfirmDeactivateService(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDeactivateService, isSubmittingStatus]);

  // Filtered Services
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const q = searchQuery.toLowerCase();
      const matchQuery =
        !searchQuery ||
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q));

      const matchCategory =
        categoryFilter === 'ALL' || s.category_id === categoryFilter;

      const matchStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'ACTIVE'
          ? s.is_active
          : !s.is_active;

      return matchQuery && matchCategory && matchStatus;
    });
  }, [services, searchQuery, categoryFilter, statusFilter]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-7 space-y-6 shadow-xs">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Scissors className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-white leading-tight">
              Layanan & Menu Barbershop
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Kelola katalog layanan, durasi waktu potong rambut, tarif per cabang, dan resep konsumsi bahan.
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {services.length} layanan terdaftar · {activeCount} aktif · {withBahanCount} dengan resep bahan
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-semibold border border-slate-700 disabled:opacity-50"
            title="Muat Ulang Data Layanan"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingService(null);
              setIsFormModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-xs shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Layanan</span>
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
              placeholder="Cari kode, nama, atau deskripsi layanan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition"
            />
          </div>

          {/* Category Dropdown */}
          <div className="sm:w-56 shrink-0">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none transition"
            >
              <option value="ALL">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Segmented Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs shrink-0 self-start sm:self-auto">
            {(
              [
                { id: 'ALL', label: `Semua (${services.length})` },
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
            Menampilkan <strong className="text-white">{filteredServices.length}</strong> dari{' '}
            <strong className="text-white">{services.length}</strong> layanan
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
            <p className="text-xs text-slate-400">Memuat katalog layanan...</p>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <Scissors className="w-8 h-8 text-slate-600 mx-auto opacity-50" />
            <p className="font-semibold text-slate-300">Tidak ada layanan yang sesuai kriteria</p>
            <p className="text-slate-500">
              {searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL'
                ? 'Coba sesuaikan kata kunci pencarian atau reset filter kategori/status.'
                : 'Klik tombol "Tambah Layanan" untuk mendaftarkan menu layanan baru.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredServices.map((srv) => {
              // Current outlet price resolution
              const currentOutletPricing = srv.service_outlets?.find(
                (so) => so.outlet_id === currentOutlet?.id
              );
              const activeOutletsCount =
                srv.service_outlets?.filter((so) => so.is_active).length || 0;
              const totalOutletsCount = outlets.length;

              // Price range calculation across active outlets
              const activePrices = (srv.service_outlets || [])
                .filter((so) => so.is_active)
                .map((so) => so.selling_price);
              const minPrice = activePrices.length > 0 ? Math.min(...activePrices) : null;
              const maxPrice = activePrices.length > 0 ? Math.max(...activePrices) : null;
              const hasPriceRange =
                minPrice !== null && maxPrice !== null && minPrice !== maxPrice;

              const recipeCount = srv.consumption_count ?? 0;

              return (
                <div
                  key={srv.id}
                  className="p-4 sm:p-5 transition hover:bg-slate-900/50"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Info, Tags, Description, Recipe & Coverage */}
                    <div className="space-y-2 flex-1 min-w-0">
                      {/* Line 1: Code, Name, Category, Duration */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                          {srv.code}
                        </span>
                        <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                          {srv.name}
                        </h3>
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-medium">
                          {srv.category_name}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[11px] text-slate-400 font-medium">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>{srv.duration_minutes} menit</span>
                        </span>
                      </div>

                      {/* Line 2: Description (rendered only if present) */}
                      {srv.description && (
                        <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 max-w-2xl">
                          {srv.description}
                        </p>
                      )}

                      {/* Line 3: Recipe indicator & Multi-outlet coverage */}
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setConsumptionService(srv);
                            setIsConsumptionModalOpen(true);
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition border ${
                            recipeCount > 0
                              ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300'
                              : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-300'
                          }`}
                          title="Klik untuk konfigurasi pemakaian bahan layanan ini"
                        >
                          <Boxes
                            className={`w-3.5 h-3.5 ${
                              recipeCount > 0 ? 'text-amber-400' : 'text-slate-500'
                            }`}
                          />
                          <span>
                            {recipeCount > 0
                              ? `${recipeCount} bahan dikonfigurasi`
                              : 'Belum ada bahan'}
                          </span>
                        </button>

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
                            Belum tersedia di cabang ini
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
                        {srv.is_active ? (
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
                            setConsumptionService(srv);
                            setIsConsumptionModalOpen(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-slate-700 text-xs font-semibold transition"
                          title="Kelola resep bahan layanan"
                        >
                          <Boxes className="w-3.5 h-3.5 text-amber-400" />
                          <span className="hidden sm:inline">Bahan</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingService(srv);
                            setIsFormModalOpen(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold transition"
                          aria-label={`Edit layanan ${srv.name}`}
                        >
                          <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Edit</span>
                        </button>

                        {srv.is_active ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDeactivateService(srv)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-red-950/40 text-slate-400 hover:text-red-300 border border-slate-800 hover:border-red-800/40 text-xs font-medium transition"
                            aria-label={`Nonaktifkan layanan ${srv.name}`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>Nonaktifkan</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleActivate(srv)}
                            disabled={togglingId === srv.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-800/40 text-xs font-medium transition disabled:opacity-40"
                            aria-label={`Aktifkan kembali layanan ${srv.name}`}
                          >
                            {togglingId === srv.id ? (
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

      {/* Service Form Modal */}
      <ServiceFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingService(null);
        }}
        service={editingService}
        categories={categories}
        outlets={outlets}
        onSuccess={() => loadData(true)}
        onNotification={onNotification}
      />

      {/* Service Consumption Modal */}
      <ServiceConsumptionModal
        isOpen={isConsumptionModalOpen}
        onClose={() => {
          setIsConsumptionModalOpen(false);
          setConsumptionService(null);
        }}
        service={consumptionService}
        onNotification={onNotification}
        onSuccess={() => loadData(true)}
      />

      {/* Safeguard Dialog: Confirmation Warning When Deactivating A Service */}
      {confirmDeactivateService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-sm font-bold text-white">
                  Konfirmasi Nonaktifkan Layanan
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Yakin ingin menonaktifkan layanan{' '}
                  <span className="font-mono text-amber-300 font-bold">
                    [{confirmDeactivateService.code}]
                  </span>{' '}
                  {confirmDeactivateService.name}?
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-400 leading-relaxed space-y-1.5">
              <p className="text-slate-300 font-medium">Dampak Operasional:</p>
              <p>• Layanan ini tidak akan lagi muncul di katalog kasir POS maupun sistem reservasi/antrean online.</p>
              <p>• Riwayat nota transaksi lampau (<span className="font-mono text-slate-300">sale_items</span>) tetap tersimpan aman dan tidak terhapus.</p>
              <p>• Resep pemakaian bahan dan tarif harga cabang tetap dipertahankan dan dapat diaktifkan kembali sewaktu-waktu.</p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDeactivateService(null)}
                disabled={isSubmittingStatus}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivate}
                disabled={isSubmittingStatus}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition shadow-xs disabled:opacity-40"
              >
                {isSubmittingStatus ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <span>Nonaktifkan Layanan</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
