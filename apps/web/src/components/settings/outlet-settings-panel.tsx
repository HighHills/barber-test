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
  CheckCircle2,
  XCircle,
  Clock,
  Phone,
  Mail,
  MapPin,
  Loader2,
} from 'lucide-react';

interface OutletSettingsPanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function OutletSettingsPanel({
  onNotification,
}: OutletSettingsPanelProps): React.JSX.Element {
  const { supabase, refreshData } = usePos();

  const [outlets, setOutlets] = useState<OutletItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingOutlet, setEditingOutlet] = useState<OutletItem | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

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

  // 3. Quick toggle active status via RPC
  const handleToggleStatus = async (outlet: OutletItem) => {
    setTogglingId(outlet.id);
    try {
      const newStatus = !outlet.is_active;
      const { error } = await supabase.rpc('save_outlet', {
        p_outlet_id: outlet.id,
        p_code: outlet.code,
        p_name: outlet.name,
        p_address: outlet.address || null,
        p_phone: outlet.phone || null,
        p_email: outlet.email || null,
        p_timezone: outlet.timezone || 'Asia/Jakarta',
        p_is_active: newStatus,
      });

      if (error) throw error;

      onNotification?.({
        type: 'SUCCESS',
        message: `Status cabang ${outlet.code} berhasil diubah menjadi ${
          newStatus ? 'Aktif' : 'Nonaktif'
        }`,
      });

      await loadOutlets();
      await refreshData();
    } catch (err: unknown) {
      console.error('Error toggling outlet status:', err);
      onNotification?.({
        type: 'ERROR',
        message: err instanceof Error ? err.message : 'Gagal memperbarui status outlet',
      });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Store className="w-5 h-5 text-amber-400" />
            <span>Manajemen Outlet & Cabang</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Daftar cabang barbershop, kontak operasional, zona waktu, dan status aktivasi.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingOutlet(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md shadow-amber-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Cabang Baru</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode cabang, nama, atau alamat..."
            className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 self-stretch sm:self-auto bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          {(
            [
              { id: 'ALL', label: 'Semua' },
              { id: 'ACTIVE', label: 'Aktif' },
              { id: 'INACTIVE', label: 'Nonaktif' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === tab.id
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table / List */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm text-slate-400">Memuat data cabang...</p>
          </div>
        ) : filteredOutlets.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            Tidak ada cabang yang sesuai dengan filter atau pencarian Anda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="p-4">Cabang</th>
                  <th className="p-4">Alamat & Kontak</th>
                  <th className="p-4">Zona Waktu</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredOutlets.map((outlet) => (
                  <tr
                    key={outlet.id}
                    className="hover:bg-slate-800/40 transition group text-slate-300"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                          {outlet.code}
                        </span>
                        <div>
                          <div className="font-bold text-white text-sm leading-tight">
                            {outlet.name}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-4 max-w-xs">
                      <div className="space-y-1">
                        {outlet.address && (
                          <div className="flex items-center gap-1.5 text-slate-400 truncate">
                            <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="truncate">{outlet.address}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          {outlet.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-600" />
                              {outlet.phone}
                            </span>
                          )}
                          {outlet.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3 text-slate-600" />
                              {outlet.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="p-4 font-mono text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{outlet.timezone}</span>
                      </div>
                    </td>

                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleToggleStatus(outlet)}
                        disabled={togglingId === outlet.id}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                          outlet.is_active
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-slate-700'
                        }`}
                        title="Klik untuk mengubah status aktif/nonaktif"
                      >
                        {togglingId === outlet.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : outlet.is_active ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        <span>{outlet.is_active ? 'Aktif' : 'Nonaktif'}</span>
                      </button>
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setEditingOutlet(outlet);
                            setIsModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 transition"
                          title="Edit Data Cabang"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <OutletFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveOutlet}
        editingOutlet={editingOutlet}
      />
    </div>
  );
}
