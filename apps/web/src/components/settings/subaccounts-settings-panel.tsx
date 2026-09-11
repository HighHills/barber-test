'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { SettingsUserItem, RoleItem, OutletItem } from '../../types/settings';
import { UserRoleAssignmentModal } from './user-role-assignment-modal';
import { CreateSubaccountModal } from './create-subaccount-modal';
import {
  KeyRound,
  Search,
  Shield,
  Store,
  Mail,
  Phone,
  Loader2,
  RefreshCw,
  Edit3,
  Power,
  CheckCircle2,
  XCircle,
  Globe,
  UserPlus,
} from 'lucide-react';

interface SubaccountsSettingsPanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function SubaccountsSettingsPanel({
  onNotification,
}: SubaccountsSettingsPanelProps): React.JSX.Element {
  const { supabase } = usePos();

  const [users, setUsers] = useState<SettingsUserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [outlets, setOutlets] = useState<OutletItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [outletFilter, setOutletFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);
  const [selectedUser, setSelectedUser] = useState<SettingsUserItem | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  // 1. Fetch Users, Roles, Outlets
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      // Call list_settings_users RPC
      const { data: usersData, error: usersErr } = await supabase.rpc('list_settings_users');
      if (usersErr) throw usersErr;

      // Select Roles (Read-Only)
      const { data: rolesData, error: rolesErr } = await supabase
        .from('roles')
        .select('id, code, name, description, is_system, is_active, created_at, updated_at')
        .order('name');
      if (rolesErr) throw rolesErr;

      // Select Outlets (Read-Only)
      const { data: outletsData, error: outletsErr } = await supabase
        .from('outlets')
        .select('*')
        .order('name');
      if (outletsErr) throw outletsErr;

      setUsers((usersData || []) as SettingsUserItem[]);
      setRoles((rolesData || []) as RoleItem[]);
      setOutlets((outletsData || []) as OutletItem[]);
    } catch (err: unknown) {
      console.error('Error loading subaccounts data:', err);
      const msg = err instanceof Error ? err.message : 'Gagal memuat data sub-akun pengguna';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase, onNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 2. Toggle Status Aktif via RPC set_user_active
  const handleToggleActive = async (user: SettingsUserItem) => {
    const newStatus = !user.is_active;
    const actionLabel = newStatus ? 'mengaktifkan' : 'menonaktifkan';

    const confirmed = window.confirm(
      `Yakin ingin ${actionLabel} akun untuk "${user.display_name}"?`
    );
    if (!confirmed) return;

    setTogglingUserId(user.id);
    try {
      const { error: rpcErr } = await supabase.rpc('set_user_active', {
        p_profile_id: user.id,
        p_is_active: newStatus,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Status akun "${user.display_name}" berhasil diubah menjadi: ${
          newStatus ? 'AKTIF' : 'NONAKTIF'
        }`,
      });

      // Optimistic update + background reload
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: newStatus } : u))
      );
    } catch (err: unknown) {
      console.error('set_user_active error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status aktif pengguna';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setTogglingUserId(null);
    }
  };

  // 3. Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Search query (name, email, phone)
      const q = searchQuery.toLowerCase();
      const matchQuery =
        !searchQuery ||
        u.display_name.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.phone && u.phone.toLowerCase().includes(q));

      // Role filter
      const matchRole =
        roleFilter === 'ALL' ||
        u.role_id === roleFilter ||
        u.role_code === roleFilter;

      // Outlet filter
      const matchOutlet =
        outletFilter === 'ALL'
          ? true
          : outletFilter === 'GLOBAL'
          ? !u.outlet_id
          : u.outlet_id === outletFilter;

      // Status filter
      const matchStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'ACTIVE'
          ? u.is_active
          : !u.is_active;

      return matchQuery && matchRole && matchOutlet && matchStatus;
    });
  }, [users, searchQuery, roleFilter, outletFilter, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
            <KeyRound className="w-4 h-4" />
            <span>Manajemen Pengguna & Akses</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Daftar Sub-Akun Pengguna</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Kelola hak akses role operasional dan cakupan cabang outlet untuk seluruh staf & pengguna
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, email, telp..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition text-xs"
            />
          </div>

          {/* Role Filter */}
          <div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
            >
              <option value="ALL">Semua Peran (Role)</option>
              {roles.map((r) => (
                <option key={r.id} value={r.code}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </div>

          {/* Outlet Filter */}
          <div>
            <select
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
            >
              <option value="ALL">Semua Penugasan Cabang</option>
              <option value="GLOBAL">Akses Global (Semua Cabang)</option>
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
            Menampilkan <strong className="text-white">{filteredUsers.length}</strong> dari{' '}
            <strong className="text-white">{users.length}</strong> pengguna terdaftar
          </div>
          {(searchQuery || roleFilter !== 'ALL' || outletFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setRoleFilter('ALL');
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

      {/* Users Content Table / Cards */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-500" />
          <p className="text-sm font-medium">Memuat data sub-akun pengguna...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <KeyRound className="w-12 h-12 mx-auto mb-3 text-slate-600 opacity-60" />
          <p className="text-sm font-semibold text-white">Tidak ada sub-akun yang sesuai kriteria</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Coba sesuaikan kata kunci pencarian atau bersihkan filter pencarian di atas.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Pengguna</th>
                  <th className="py-3.5 px-4">Kontak</th>
                  <th className="py-3.5 px-4">Peran (Role)</th>
                  <th className="py-3.5 px-4">Penugasan Cabang</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredUsers.map((u) => {
                  const isToggling = togglingUserId === u.id;
                  const isSystemRole = u.role_is_system === true;

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Name & Initials */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-amber-400 shrink-0 text-xs">
                            {u.display_name ? u.display_name.slice(0, 2).toUpperCase() : 'US'}
                          </div>
                          <div>
                            <div className="font-semibold text-white group-hover:text-amber-300 transition-colors">
                              {u.display_name}
                            </div>
                            {u.email ? (
                              <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                                <Mail className="w-3 h-3 text-slate-500" />
                                <span>{u.email}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">Tanpa email</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-4 text-slate-300">
                        {u.phone ? (
                          <div className="flex items-center gap-1 font-mono text-[11px]">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span>{u.phone}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      {/* Role & System / Custom Badge */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="font-semibold text-slate-200">
                              {u.role_name || u.role_code || 'Belum Ditugaskan'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                isSystemRole
                                  ? 'bg-slate-800 text-slate-400 border border-slate-700'
                                  : 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                              }`}
                            >
                              {isSystemRole ? 'System Role' : 'Custom Role'}
                            </span>
                            {u.role_code && (
                              <span className="text-[10px] font-mono text-slate-500">
                                ({u.role_code})
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Outlet */}
                      <td className="py-3 px-4">
                        {u.outlet_id ? (
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Store className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="font-medium">{u.outlet_name || 'Cabang'}</span>
                            {u.outlet_code && (
                              <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">
                                {u.outlet_code}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-amber-400/90 font-medium">
                            <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>Semua Cabang (Global)</span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            u.is_active
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/10 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {u.is_active ? (
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
                          {/* Ubah Role & Outlet Button */}
                          <button
                            onClick={() => {
                              setSelectedUser(u);
                              setIsRoleModalOpen(true);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition font-medium text-xs hover:border-amber-500/40"
                            title="Ubah Role dan Outlet Cabang"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                            <span className="hidden md:inline">Ubah Role</span>
                          </button>

                          {/* Toggle Active/Inactive Button */}
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={isToggling}
                            className={`p-1.5 rounded-lg border transition ${
                              u.is_active
                                ? 'bg-red-950/40 hover:bg-red-900/60 text-red-400 border-red-500/30'
                                : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border-emerald-500/30'
                            }`}
                            title={
                              u.is_active
                                ? 'Nonaktifkan Akun Pengguna'
                                : 'Aktifkan Akun Pengguna'
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

      {/* Role Assignment Modal */}
      <UserRoleAssignmentModal
        isOpen={isRoleModalOpen}
        onClose={() => {
          setIsRoleModalOpen(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        roles={roles}
        outlets={outlets}
        onSuccess={() => loadData(true)}
        onNotification={onNotification}
      />

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
