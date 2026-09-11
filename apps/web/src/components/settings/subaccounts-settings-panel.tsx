'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { CashierSubaccountListItem, OutletItem } from '../../types/settings';
import { CreateSubaccountModal } from './create-subaccount-modal';
import {
  KeyRound,
  Search,
  Store,
  Mail,
  Phone,
  Loader2,
  RefreshCw,
  Power,
  CheckCircle2,
  XCircle,
  UserPlus,
  Clock,
} from 'lucide-react';

interface SubaccountsSettingsPanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function SubaccountsSettingsPanel({
  onNotification,
}: SubaccountsSettingsPanelProps): React.JSX.Element {
  const { supabase } = usePos();

  const [cashiers, setCashiers] = useState<CashierSubaccountListItem[]>([]);
  const [outlets, setOutlets] = useState<OutletItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [outletFilter, setOutletFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [togglingCashierId, setTogglingCashierId] = useState<string | null>(null);

  // 1. Fetch Cashiers via list_cashier_subaccounts RPC & Outlets (Read-Only)
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      // Call list_cashier_subaccounts RPC
      const { data: cashiersData, error: cashiersErr } = await supabase.rpc('list_cashier_subaccounts');
      if (cashiersErr) throw cashiersErr;

      // Select Outlets (Read-Only)
      const { data: outletsData, error: outletsErr } = await supabase
        .from('outlets')
        .select('*')
        .order('name');
      if (outletsErr) throw outletsErr;

      setCashiers((cashiersData || []) as CashierSubaccountListItem[]);
      setOutlets((outletsData || []) as OutletItem[]);
    } catch (err: unknown) {
      console.error('Error loading cashier subaccounts data:', err);
      const msg = err instanceof Error ? err.message : 'Gagal memuat data sub-akun kasir';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase, onNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 2. Toggle Status Aktif via RPC toggle_cashier_status
  const handleToggleActive = async (cashier: CashierSubaccountListItem) => {
    const newStatus = !cashier.is_active;
    const actionLabel = newStatus ? 'mengaktifkan' : 'menonaktifkan';

    const confirmed = window.confirm(
      `Yakin ingin ${actionLabel} akun kasir untuk "${cashier.display_name}"?`
    );
    if (!confirmed) return;

    setTogglingCashierId(cashier.id);
    try {
      const { error: rpcErr } = await supabase.rpc('toggle_cashier_status', {
        p_profile_id: cashier.id,
        p_is_active: newStatus,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Status akun kasir "${cashier.display_name}" berhasil diubah menjadi: ${
          newStatus ? 'AKTIF' : 'NONAKTIF'
        }`,
      });

      // Optimistic update + background reload
      setCashiers((prev) =>
        prev.map((c) => (c.id === cashier.id ? { ...c, is_active: newStatus } : c))
      );
      await loadData(true);
    } catch (err: unknown) {
      console.error('toggle_cashier_status error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status kasir';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setTogglingCashierId(null);
    }
  };

  // 3. Filtered Cashiers
  const filteredCashiers = useMemo(() => {
    return cashiers.filter((c) => {
      // Search query (name, email, phone)
      const q = searchQuery.toLowerCase();
      const matchQuery =
        !searchQuery ||
        c.display_name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q));

      // Outlet filter
      const matchOutlet =
        outletFilter === 'ALL'
          ? true
          : c.outlet_id === outletFilter;

      // Status filter
      const matchStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'ACTIVE'
          ? c.is_active
          : !c.is_active;

      return matchQuery && matchOutlet && matchStatus;
    });
  }, [cashiers, searchQuery, outletFilter, statusFilter]);

  const formatDisplayDate = (isoStr?: string) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
            <KeyRound className="w-4 h-4" />
            <span>Manajemen Akses POS Kasir</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Sub-Akun Kasir</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Kelola akun login kasir cabang dan kontrol status operasional POS
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition text-xs font-bold shadow-md shadow-amber-500/20"
            title="Tambah Sub-Akun Kasir Baru"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Tambah Kasir</span>
          </button>

          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-medium border border-slate-700"
            title="Muat Ulang Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, email, telp kasir..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition text-xs"
            />
          </div>

          {/* Outlet Filter */}
          <div>
            <select
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
            >
              <option value="ALL">Semua Cabang Outlet</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.code})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
            >
              <option value="ALL">Semua Status Akun</option>
              <option value="ACTIVE">Hanya Aktif</option>
              <option value="INACTIVE">Hanya Nonaktif</option>
            </select>
          </div>
        </div>

        {/* Counter Info */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
          <div>
            Menampilkan <strong className="text-white">{filteredCashiers.length}</strong> dari{' '}
            <strong className="text-white">{cashiers.length}</strong> kasir terdaftar
          </div>
          {(searchQuery || outletFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setOutletFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="text-amber-400 hover:underline"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Cashiers Content Table */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-500" />
          <p className="text-sm font-medium">Memuat data sub-akun kasir...</p>
        </div>
      ) : filteredCashiers.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <KeyRound className="w-12 h-12 mx-auto mb-3 text-slate-600 opacity-60" />
          <p className="text-sm font-semibold text-white">Tidak ada sub-akun kasir yang sesuai kriteria</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Coba sesuaikan kata kunci pencarian atau bersihkan filter di atas, atau klik tombol &quot;Tambah Kasir&quot; untuk mendaftarkan kasir baru.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Kasir</th>
                  <th className="py-3.5 px-4">Kontak</th>
                  <th className="py-3.5 px-4">Cabang Penugasan</th>
                  <th className="py-3.5 px-4">Terdaftar</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredCashiers.map((c) => {
                  const isToggling = togglingCashierId === c.id;

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Name & Initials */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-amber-400 shrink-0 text-xs">
                            {c.display_name ? c.display_name.slice(0, 2).toUpperCase() : 'KS'}
                          </div>
                          <div>
                            <div className="font-semibold text-white group-hover:text-amber-300 transition-colors">
                              {c.display_name}
                            </div>
                            {c.email ? (
                              <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                                <Mail className="w-3 h-3 text-slate-500" />
                                <span>{c.email}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">Tanpa email</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-4 text-slate-300">
                        {c.phone ? (
                          <div className="flex items-center gap-1 font-mono text-[11px]">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span>{c.phone}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      {/* Outlet */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Store className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="font-medium">{c.outlet_name || 'Cabang'}</span>
                          {c.outlet_code && (
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">
                              {c.outlet_code}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Registered Date */}
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{formatDisplayDate(c.created_at)}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            c.is_active
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/10 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {c.is_active ? (
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
                          {/* Toggle Active/Inactive Button */}
                          <button
                            onClick={() => handleToggleActive(c)}
                            disabled={isToggling}
                            className={`p-1.5 rounded-lg border transition ${
                              c.is_active
                                ? 'bg-red-950/40 hover:bg-red-900/60 text-red-400 border-red-500/30'
                                : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border-emerald-500/30'
                            }`}
                            title={
                              c.is_active
                                ? 'Nonaktifkan Akun Kasir'
                                : 'Aktifkan Akun Kasir'
                            }
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

      {/* Create Subaccount Modal */}
      <CreateSubaccountModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        outlets={outlets}
        onSuccess={() => loadData(true)}
        onNotification={onNotification}
      />
    </div>
  );
}
