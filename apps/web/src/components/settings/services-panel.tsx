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
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface ServicesPanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function ServicesPanel({ onNotification }: ServicesPanelProps): React.JSX.Element {
  const { supabase, refreshData } = usePos();

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

  const [togglingId, setTogglingId] = useState<string | null>(null);

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

  // 2. Toggle active status via RPC save_service
  const handleToggleActive = async (service: ServiceItem) => {
    const newStatus = !service.is_active;
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
        p_is_active: newStatus,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Layanan "${service.name}" berhasil diubah menjadi: ${
          newStatus ? 'AKTIF' : 'NONAKTIF'
        }`,
      });

      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, is_active: newStatus } : s))
      );

      await refreshData();
    } catch (err: unknown) {
      console.error('Toggle service status error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status layanan';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setTogglingId(null);
    }
  };

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
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
            <Scissors className="w-4 h-4" />
            <span>POS & Etalase Katalog</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Layanan & Menu Barbershop</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Daftar paket potong rambut, durasi operasional, harga per outlet cabang, dan pemakaian bahan
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-medium border border-slate-700"
            title="Muat Ulang Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>

          <button
            onClick={() => {
              setEditingService(null);
              setIsFormModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-xs shadow-md shadow-amber-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Layanan</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama atau kode layanan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition text-xs"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
            >
              <option value="ALL">Semua Kategori Layanan</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
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

        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
          <div>
            Menampilkan <strong className="text-white">{filteredServices.length}</strong> dari{' '}
            <strong className="text-white">{services.length}</strong> layanan
          </div>
          {(searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="text-amber-400 hover:underline"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Services Table */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-500" />
          <p className="text-sm font-medium">Memuat katalog layanan...</p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <Scissors className="w-12 h-12 mx-auto mb-3 text-slate-600 opacity-60" />
          <p className="text-sm font-semibold text-white">Tidak ada layanan yang sesuai kriteria</p>
          <p className="text-xs text-slate-500 mt-1">
            Klik tombol "Tambah Layanan" untuk mendaftarkan menu baru ke sistem.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Layanan</th>
                  <th className="py-3.5 px-4">Kategori</th>
                  <th className="py-3.5 px-4">Durasi</th>
                  <th className="py-3.5 px-4">Harga Outlet</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredServices.map((srv) => {
                  const isToggling = togglingId === srv.id;

                  return (
                    <tr
                      key={srv.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Name & Code */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <div className="font-bold text-white group-hover:text-amber-300 transition-colors">
                            {srv.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {srv.code}
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-medium">
                          {srv.category_name}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="py-3 px-4 text-slate-300">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{srv.duration_minutes} menit</span>
                        </div>
                      </td>

                      {/* Outlet Prices Preview */}
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {srv.service_outlets && srv.service_outlets.length > 0 ? (
                            srv.service_outlets.map((so) => (
                              <span
                                key={so.outlet_id}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                                  so.is_active
                                    ? 'bg-slate-950 text-slate-200 border-slate-800'
                                    : 'bg-red-950/20 text-red-400/80 border-red-900/30 line-through'
                                }`}
                                title={`${so.outlet_name}: Rp ${so.selling_price.toLocaleString('id-ID')}`}
                              >
                                {so.outlet_code}: {so.selling_price >= 1000 ? `${so.selling_price / 1000}k` : so.selling_price}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500 text-[11px] italic">Belum diset</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            srv.is_active
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/10 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {srv.is_active ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Aktif</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3" />
                              <span>Nonaktif</span>
                            </>
                          )}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Consumption Button */}
                          <button
                            onClick={() => {
                              setConsumptionService(srv);
                              setIsConsumptionModalOpen(true);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg border border-slate-700 transition font-medium text-xs hover:border-amber-500/40"
                            title="Konfigurasi Pemakaian Bahan Produk"
                          >
                            <Boxes className="w-3.5 h-3.5 text-amber-400" />
                            <span className="hidden lg:inline">Bahan</span>
                          </button>

                          {/* Edit Button */}
                          <button
                            onClick={() => {
                              setEditingService(srv);
                              setIsFormModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                            title="Ubah Detail & Tarif Layanan"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                          </button>

                          {/* Toggle Active Button */}
                          <button
                            onClick={() => handleToggleActive(srv)}
                            disabled={isToggling}
                            className={`p-1.5 rounded-lg border transition ${
                              srv.is_active
                                ? 'bg-red-950/40 hover:bg-red-900/60 text-red-400 border-red-500/30'
                                : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border-emerald-500/30'
                            }`}
                            title={srv.is_active ? 'Nonaktifkan Layanan' : 'Aktifkan Layanan'}
                          >
                            {isToggling ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Power className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
      />
    </div>
  );
}
