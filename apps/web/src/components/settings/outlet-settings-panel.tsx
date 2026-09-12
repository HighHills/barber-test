'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { OutletItem } from '../../types/settings';
import { OutletFormModal } from './outlet-form-modal';
import {
  Store,
  Plus,
  Search,
  Edit2,
  Clock,
  Phone,
  Mail,
  MapPin,
  Loader2,
  AlertTriangle,
  Radio,
  Power,
} from 'lucide-react';

interface OutletSettingsPanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function OutletSettingsPanel({
  onNotification,
}: OutletSettingsPanelProps): React.JSX.Element {
  const { supabase, refreshData, currentOutlet } = usePos();

  const [outlets, setOutlets] = useState<OutletItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingOutlet, setEditingOutlet] = useState<OutletItem | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Safeguard dialog states
  const [confirmDeactivateOutlet, setConfirmDeactivateOutlet] = useState<OutletItem | null>(null);
  const [deactivateBlockedOutlet, setDeactivateBlockedOutlet] = useState<OutletItem | null>(null);
  const [isSubmittingStatus, setIsSubmittingStatus] = useState<boolean>(false);

  // 1. Load Outlets via SELECT
  const loadOutlets = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('outlets')
        .select('*')
        .order('code');

      if (error) throw error;
      setOutlets((data || []) as OutletItem[]);
    } catch (err: unknown) {
      console.error('Error loading outlets:', err);
      onNotification?.({
        type: 'ERROR',
        message: err instanceof Error ? err.message : 'Gagal memuat daftar cabang',
      });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, onNotification]);

  useEffect(() => {
    loadOutlets();
  }, [loadOutlets]);

  // Active / Inactive counts
  const activeCount = useMemo(() => outlets.filter((o) => o.is_active).length, [outlets]);
  const inactiveCount = useMemo(() => outlets.length - activeCount, [outlets, activeCount]);

  // Filtered outlets
  const filteredOutlets = useMemo(() => {
    return outlets.filter((o) => {
      const matchQuery =
        o.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.address && o.address.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'ACTIVE'
          ? o.is_active
          : !o.is_active;

      return matchQuery && matchStatus;
    });
  }, [outlets, searchQuery, statusFilter]);

  // 2. Save Outlet via RPC (save_outlet)
  const handleSaveOutlet = async (outletData: {
    id?: string;
    code: string;
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    timezone: string;
    is_active: boolean;
  }) => {
    const { error } = await supabase.rpc('save_outlet', {
      p_outlet_id: outletData.id || null,
      p_code: outletData.code,
      p_name: outletData.name,
      p_address: outletData.address || null,
      p_phone: outletData.phone || null,
      p_email: outletData.email || null,
      p_timezone: outletData.timezone || 'Asia/Jakarta',
      p_is_active: outletData.is_active,
    });

    if (error) {
      throw error;
    }

    onNotification?.({
      type: 'SUCCESS',
      message: `Cabang ${outletData.name} (${outletData.code}) berhasil disimpan!`,
    });

    await loadOutlets();
    await refreshData();
  };

  // 3. Status Change Safeguards: Activate directly, Deactivate with safeguard checks
  const handleActivate = async (outlet: OutletItem) => {
    setTogglingId(outlet.id);
    try {
      const { error } = await supabase.rpc('save_outlet', {
        p_outlet_id: outlet.id,
        p_code: outlet.code,
        p_name: outlet.name,
        p_address: outlet.address || null,
        p_phone: outlet.phone || null,
        p_email: outlet.email || null,
        p_timezone: outlet.timezone || 'Asia/Jakarta',
        p_is_active: true,
      });

      if (error) throw error;

      onNotification?.({
        type: 'SUCCESS',
        message: `Cabang ${outlet.name} (${outlet.code}) berhasil diaktifkan kembali.`,
      });

      await loadOutlets();
      await refreshData();
    } catch (err: unknown) {
      console.error('Error activating outlet:', err);
      onNotification?.({
        type: 'ERROR',
        message: err instanceof Error ? err.message : 'Gagal mengaktifkan cabang',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleRequestDeactivate = (outlet: OutletItem) => {
    if (activeCount <= 1) {
      setDeactivateBlockedOutlet(outlet);
      return;
    }
    setConfirmDeactivateOutlet(outlet);
  };

  const handleConfirmDeactivate = async () => {
    if (!confirmDeactivateOutlet) return;
    setIsSubmittingStatus(true);
    try {
      const outlet = confirmDeactivateOutlet;
      const { error } = await supabase.rpc('save_outlet', {
        p_outlet_id: outlet.id,
        p_code: outlet.code,
        p_name: outlet.name,
        p_address: outlet.address || null,
        p_phone: outlet.phone || null,
        p_email: outlet.email || null,
        p_timezone: outlet.timezone || 'Asia/Jakarta',
        p_is_active: false,
      });

      if (error) throw error;

      onNotification?.({
        type: 'SUCCESS',
        message: `Cabang ${outlet.name} (${outlet.code}) dinonaktifkan.`,
      });

      setConfirmDeactivateOutlet(null);
      await loadOutlets();
      await refreshData();
    } catch (err: unknown) {
      console.error('Error deactivating outlet:', err);
      onNotification?.({
        type: 'ERROR',
        message: err instanceof Error ? err.message : 'Gagal menonaktifkan cabang',
      });
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  // Keyboard Escape listener for safeguard dialogs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDeactivateOutlet && !isSubmittingStatus) {
          setConfirmDeactivateOutlet(null);
        }
        if (deactivateBlockedOutlet) {
          setDeactivateBlockedOutlet(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDeactivateOutlet, deactivateBlockedOutlet, isSubmittingStatus]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-7 space-y-6 shadow-xs">
      {/* Header & Operational Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Store className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-white leading-tight">
              Manajemen Outlet
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Kelola cabang, informasi operasional, dan status ketersediaan outlet.
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {outlets.length} cabang · {activeCount} beroperasi · {inactiveCount} nonaktif
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingOutlet(null);
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-xs shadow-amber-500/20 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Cabang</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode, nama, atau alamat cabang..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs shrink-0 self-start sm:self-auto">
          {(
            [
              { id: 'ALL', label: `Semua (${outlets.length})` },
              { id: 'ACTIVE', label: `Beroperasi (${activeCount})` },
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
            <p className="text-xs text-slate-400">Memuat data cabang...</p>
          </div>
        ) : filteredOutlets.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Tidak ada cabang yang sesuai dengan filter atau pencarian Anda.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredOutlets.map((outlet) => {
              const isCurrent = currentOutlet?.id === outlet.id;
              return (
                <div
                  key={outlet.id}
                  className={`p-4 sm:p-5 transition hover:bg-slate-900/50 ${
                    isCurrent ? 'bg-amber-500/[0.02]' : ''
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    {/* Branch Info (Levels 1 to 4) */}
                    <div className="space-y-2 flex-1 min-w-0">
                      {/* Level 1 & Level 2 & Current Outlet Badge */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                          {outlet.code}
                        </span>
                        <h3 className="text-sm font-bold text-white leading-tight">
                          {outlet.name}
                        </h3>
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold text-amber-300">
                            <Radio className="w-3 h-3 text-amber-400 animate-pulse" />
                            Sedang digunakan
                          </span>
                        )}
                      </div>

                      {/* Level 3: Alamat */}
                      {outlet.address && (
                        <div className="flex items-start gap-1.5 text-xs text-slate-300">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                          <span className="leading-relaxed">{outlet.address}</span>
                        </div>
                      )}

                      {/* Level 4: Kontak & Zona Waktu */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400">
                        {outlet.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="text-slate-300">{outlet.phone}</span>
                          </div>
                        )}
                        {outlet.email && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="text-slate-300">{outlet.email}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>{outlet.timezone}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status & Actions */}
                    <div className="flex items-center justify-between lg:justify-end gap-3 pt-2 lg:pt-0 border-t border-slate-800/60 lg:border-t-0 shrink-0">
                      {/* Operational Status */}
                      <div className="pr-1">
                        {outlet.is_active ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                            Beroperasi
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                            <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                            Nonaktif
                          </span>
                        )}
                      </div>

                      {/* Explicit Action Buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingOutlet(outlet);
                            setIsModalOpen(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold transition"
                          aria-label={`Edit data cabang ${outlet.name}`}
                        >
                          <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Edit</span>
                        </button>

                        {outlet.is_active ? (
                          <button
                            type="button"
                            onClick={() => handleRequestDeactivate(outlet)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-red-950/40 text-slate-400 hover:text-red-300 border border-slate-800 hover:border-red-800/40 text-xs font-medium transition"
                            aria-label={`Nonaktifkan cabang ${outlet.name}`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>Nonaktifkan</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleActivate(outlet)}
                            disabled={togglingId === outlet.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-800/40 text-xs font-medium transition disabled:opacity-40"
                            aria-label={`Aktifkan kembali cabang ${outlet.name}`}
                          >
                            {togglingId === outlet.id ? (
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

      {/* Form Modal */}
      <OutletFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveOutlet}
        editingOutlet={editingOutlet}
      />

      {/* Safeguard Dialog: Block Deactivating The Only Active Outlet */}
      {deactivateBlockedOutlet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">
                  Tidak Dapat Menonaktifkan Cabang
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Cabang <span className="font-mono text-amber-300 font-bold">[{deactivateBlockedOutlet.code}]</span> {deactivateBlockedOutlet.name} adalah satu-satunya cabang yang sedang beroperasi.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed pt-1">
                  Sistem memerlukan minimal satu cabang aktif agar kasir POS, antrean, dan pencatatan transaksi dapat berfungsi.
                </p>
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setDeactivateBlockedOutlet(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safeguard Dialog: Confirmation Warning When Deactivating An Outlet */}
      {confirmDeactivateOutlet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-sm font-bold text-white">
                  Konfirmasi Nonaktifkan Cabang
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Yakin ingin menonaktifkan operasional cabang <span className="font-mono text-amber-300 font-bold">[{confirmDeactivateOutlet.code}]</span> {confirmDeactivateOutlet.name}?
                </p>
              </div>
            </div>

            {currentOutlet?.id === confirmDeactivateOutlet.id && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 leading-relaxed">
                <span className="font-bold block mb-0.5">Perhatian: Cabang Sedang Digunakan</span>
                Cabang ini sedang menjadi konteks aktif pada sesi Anda saat ini. Menonaktifkannya akan secara otomatis mengalihkan sesi kasir ke cabang aktif lainnya.
              </div>
            )}

            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-400 leading-relaxed space-y-1">
              <p>• Cabang tidak akan muncul dalam pilihan kasir POS dan booking online.</p>
              <p>• Riwayat transaksi, nota, dan pembukuan lampau tetap tersimpan aman.</p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDeactivateOutlet(null)}
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
                  <span>Nonaktifkan Cabang</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
