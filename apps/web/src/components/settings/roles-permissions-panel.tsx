'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { RoleItem, PermissionItem, RolePermissionItem } from '../../types/settings';
import { CustomRoleFormModal } from './custom-role-form-modal';
import {
  ShieldCheck,
  Shield,
  Plus,
  Edit2,
  Lock,
  Unlock,
  Save,
  Loader2,
  RefreshCw,
  Power,
} from 'lucide-react';

interface RolesPermissionsPanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

// Module label dictionary with Indonesian translations & icons
const moduleLabels: Record<string, { title: string; desc: string }> = {
  pos: { title: 'Point of Sale (POS)', desc: 'Penjualan kasir, refund, void, dan sesi kasir' },
  inventory: { title: 'Inventaris & Stok', desc: 'Stok barang, transfer antar cabang, dan pembelian' },
  booking: { title: 'Booking & Jadwal', desc: 'Reservasi appointment pelanggan dan kalender' },
  queue: { title: 'Antrean Walk-in', desc: 'Pemanggilan dan tata kelola antrean operasional' },
  finance: { title: 'Keuangan & Akuntansi', desc: 'Jurnal finansial, neraca, laba rugi, dan tutup periode' },
  commission: { title: 'Komisi Kapster', desc: 'Perhitungan dan pengelolaan komisi staf' },
  catalog: { title: 'Katalog & Harga', desc: 'Manajemen layanan, produk, dan harga cabang' },
  employee: { title: 'Karyawan & Staff', desc: 'Profil staf, jadwal kerja shift, dan cuti' },
  user: { title: 'Pengguna & Otorisasi', desc: 'Sub-akun pengguna dan penugasan role' },
  settings: { title: 'Pengaturan Bisnis', desc: 'Konfigurasi global bisnis, pajak, dan outlet' },
};

export function RolesPermissionsPanel({
  onNotification,
}: RolesPermissionsPanelProps): React.JSX.Element {
  const { supabase } = usePos();

  // Data states
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissionItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Selected Role & Working Permissions
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [workingPermissionCodes, setWorkingPermissionCodes] = useState<Set<string>>(new Set());
  const [isSavingPermissions, setIsSavingPermissions] = useState<boolean>(false);

  // Modals
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [togglingRoleId, setTogglingRoleId] = useState<string | null>(null);

  // 1. Fetch Roles, Permissions, RolePermissions (SELECT Only)
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      // 1. Roles (SELECT)
      const { data: rolesData, error: rolesErr } = await supabase
        .from('roles')
        .select('*')
        .order('is_system', { ascending: false })
        .order('code');
      if (rolesErr) throw rolesErr;

      // 2. Permissions (SELECT)
      const { data: permData, error: permErr } = await supabase
        .from('permissions')
        .select('*')
        .order('module')
        .order('code');
      if (permErr) throw permErr;

      // 3. Role-Permissions Mappings (SELECT)
      const { data: rpData, error: rpErr } = await supabase
        .from('role_permissions')
        .select('role_id, permission_id');
      if (rpErr) throw rpErr;

      const loadedRoles = (rolesData || []) as RoleItem[];
      const loadedPerms = (permData || []) as PermissionItem[];
      const loadedRp = (rpData || []) as RolePermissionItem[];

      setRoles(loadedRoles);
      setPermissions(loadedPerms);
      setRolePermissions(loadedRp);

      // Default select first role if none selected or if selected role was deleted
      setSelectedRoleId((prev) => {
        if (prev && loadedRoles.some((r) => r.id === prev)) return prev;
        return loadedRoles[0]?.id || '';
      });
    } catch (err: unknown) {
      console.error('Error loading roles & permissions:', err);
      const msg = err instanceof Error ? err.message : 'Gagal memuat data roles & permissions';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase, onNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Selected Role Object
  const selectedRole = useMemo(() => {
    return roles.find((r) => r.id === selectedRoleId) || null;
  }, [roles, selectedRoleId]);

  // Permission dictionary lookup: permission_id -> code
  const permissionIdToCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    permissions.forEach((p) => map.set(p.id, p.code));
    return map;
  }, [permissions]);

  // Initial Permission Codes for current selected role
  const initialPermissionCodesForSelectedRole = useMemo(() => {
    if (!selectedRoleId) return new Set<string>();
    const assignedIds = rolePermissions
      .filter((rp) => rp.role_id === selectedRoleId)
      .map((rp) => rp.permission_id);

    const codes = new Set<string>();
    assignedIds.forEach((id) => {
      const code = permissionIdToCodeMap.get(id);
      if (code) codes.add(code);
    });
    return codes;
  }, [selectedRoleId, rolePermissions, permissionIdToCodeMap]);

  // Sync working permissions when selected role or loaded mappings change
  useEffect(() => {
    setWorkingPermissionCodes(new Set(initialPermissionCodesForSelectedRole));
  }, [initialPermissionCodesForSelectedRole]);

  // Check if permissions have unsaved modifications
  const hasUnsavedPermissions = useMemo(() => {
    if (!selectedRole || selectedRole.is_system) return false;
    if (workingPermissionCodes.size !== initialPermissionCodesForSelectedRole.size) return true;
    for (const code of workingPermissionCodes) {
      if (!initialPermissionCodesForSelectedRole.has(code)) return true;
    }
    return false;
  }, [selectedRole, workingPermissionCodes, initialPermissionCodesForSelectedRole]);

  // Permissions grouped by module
  const permissionsByModule = useMemo(() => {
    const map: Record<string, PermissionItem[]> = {};
    permissions.forEach((p) => {
      const mod = p.module || 'other';
      if (!map[mod]) map[mod] = [];
      map[mod].push(p);
    });
    return map;
  }, [permissions]);

  // Toggle single permission for custom role
  const handleTogglePermission = (code: string) => {
    if (!selectedRole || selectedRole.is_system) return;

    setWorkingPermissionCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // Toggle all permissions in a module
  const handleToggleModuleAll = (moduleKey: string) => {
    if (!selectedRole || selectedRole.is_system) return;

    const modulePerms = permissionsByModule[moduleKey] || [];
    const allModuleCodes = modulePerms.map((p) => p.code);
    const isAllChecked = allModuleCodes.every((c) => workingPermissionCodes.has(c));

    setWorkingPermissionCodes((prev) => {
      const next = new Set(prev);
      if (isAllChecked) {
        // Uncheck all in module
        allModuleCodes.forEach((c) => next.delete(c));
      } else {
        // Check all in module
        allModuleCodes.forEach((c) => next.add(c));
      }
      return next;
    });
  };

  // Save Permissions for Custom Role via RPC save_role_permissions
  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    if (selectedRole.is_system) {
      onNotification?.({
        type: 'ERROR',
        message: 'System Role bersifat read-only dan tidak dapat diubah.',
      });
      return;
    }

    setIsSavingPermissions(true);
    try {
      const permissionCodesArray = Array.from(workingPermissionCodes);

      const { error: rpcErr } = await supabase.rpc('save_role_permissions', {
        p_role_id: selectedRole.id,
        p_permission_codes: permissionCodesArray,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Hak akses untuk role "${selectedRole.name}" berhasil disimpan (${permissionCodesArray.length} hak akses aktif).`,
      });

      // Reload role-permissions mappings
      await loadData(true);
    } catch (err: unknown) {
      console.error('save_role_permissions error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan hak akses role';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setIsSavingPermissions(false);
    }
  };

  // Quick Toggle Active/Inactive for Custom Role via RPC save_custom_role
  const handleToggleRoleActive = async (role: RoleItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (role.is_system) return;

    const newStatus = !role.is_active;
    setTogglingRoleId(role.id);

    try {
      const { error: rpcErr } = await supabase.rpc('save_custom_role', {
        p_role_id: role.id,
        p_code: role.code,
        p_name: role.name,
        p_description: role.description || null,
        p_is_active: newStatus,
      });

      if (rpcErr) throw rpcErr;

      onNotification?.({
        type: 'SUCCESS',
        message: `Status role "${role.name}" berhasil diubah menjadi: ${
          newStatus ? 'AKTIF' : 'NONAKTIF'
        }`,
      });

      setRoles((prev) =>
        prev.map((r) => (r.id === role.id ? { ...r, is_active: newStatus } : r))
      );
    } catch (err: unknown) {
      console.error('Toggle role status error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status role';
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setTogglingRoleId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Hak Akses & Keamanan Sistem</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Roles & Permissions Matrix</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Kelola peran sistem bawaan dan definisikan hak akses granular untuk peran kustom
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
              setEditingRole(null);
              setIsRoleModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-xs shadow-md shadow-amber-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Role Custom</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-500" />
          <p className="text-sm font-medium">Memuat matriks roles dan hak akses...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Roles Cards List (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Daftar Peran ({roles.length})
              </span>
              <span className="text-[11px] text-slate-500">Pilih untuk melihat izin</span>
            </div>

            <div className="space-y-2">
              {roles.map((r) => {
                const isSelected = r.id === selectedRoleId;
                const isSystem = r.is_system;
                const assignedPermCount = rolePermissions.filter((rp) => rp.role_id === r.id).length;
                const isToggling = togglingRoleId === r.id;

                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRoleId(r.id)}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer select-none relative ${
                      isSelected
                        ? 'bg-slate-800/90 border-amber-500/60 shadow-lg shadow-amber-500/5'
                        : 'bg-slate-900/80 border-slate-800 hover:bg-slate-850 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3
                            className={`text-xs font-bold truncate ${
                              isSelected ? 'text-amber-300' : 'text-white'
                            }`}
                          >
                            {r.name}
                          </h3>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                            {r.code}
                          </span>
                        </div>

                        {r.description && (
                          <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                            {r.description}
                          </p>
                        )}
                      </div>

                      {/* Right Action Icons for Custom Role */}
                      {!isSystem && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingRole(r);
                              setIsRoleModalOpen(true);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
                            title="Ubah Nama & Info Role"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                          </button>
                          <button
                            onClick={(e) => handleToggleRoleActive(r, e)}
                            disabled={isToggling}
                            className={`p-1 rounded-lg transition ${
                              r.is_active
                                ? 'text-emerald-400 hover:bg-emerald-950/40'
                                : 'text-slate-500 hover:bg-slate-800'
                            }`}
                            title={r.is_active ? 'Role Aktif' : 'Role Nonaktif'}
                          >
                            {isToggling ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Power className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Card Footer Badges */}
                    <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                            isSystem
                              ? 'bg-slate-800 text-slate-300 border border-slate-700'
                              : 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                          }`}
                        >
                          {isSystem ? 'System' : 'Custom'}
                        </span>
                        {!r.is_active && (
                          <span className="px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/30">
                            Nonaktif
                          </span>
                        )}
                      </div>

                      <div className="text-slate-400 font-medium">
                        <strong className="text-white">{assignedPermCount}</strong> / {permissions.length} izin
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Permission Matrix for Selected Role (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {selectedRole ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
                {/* Selected Role Header Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-white">{selectedRole.name}</span>
                      <span className="text-xs font-mono text-amber-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        {selectedRole.code}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          selectedRole.is_system
                            ? 'bg-slate-800 text-slate-300 border border-slate-700'
                            : 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                        }`}
                      >
                        {selectedRole.is_system ? 'System Role' : 'Custom Role'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {selectedRole.description || 'Tidak ada deskripsi tambahan untuk peran ini.'}
                    </p>
                  </div>

                  {/* Save Button for Custom Role */}
                  {!selectedRole.is_system && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSavePermissions}
                        disabled={isSavingPermissions || !hasUnsavedPermissions}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition shadow-md ${
                          hasUnsavedPermissions
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 animate-pulse'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {isSavingPermissions ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Menyimpan...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>
                              {hasUnsavedPermissions
                                ? 'Simpan Hak Akses'
                                : 'Hak Akses Tersimpan'}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* System vs Custom Role Notice */}
                {selectedRole.is_system ? (
                  <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-start gap-2.5">
                    <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-white">
                        Matriks Izin Read-Only (System Role)
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        Peran sistem merupakan fondasi bawaan aplikasi Barbershop SaaS. Hak akses
                        pada peran ini telah diproteksi demi menjamin keamanan transaksi POS, buku
                        besar akuntansi, dan integritas database.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Unlock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        Pilih izin yang ingin diberikan untuk role kustom ini, lalu klik tombol{' '}
                        <strong>Simpan Hak Akses</strong>.
                      </span>
                    </div>
                    {hasUnsavedPermissions && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold shrink-0">
                        Ada perubahan belum disimpan
                      </span>
                    )}
                  </div>
                )}

                {/* Permission Modules Matrix */}
                <div className="space-y-6 pt-1">
                  {Object.keys(permissionsByModule).map((moduleKey) => {
                    const modulePerms = permissionsByModule[moduleKey];
                    const info = moduleLabels[moduleKey] || {
                      title: `Modul: ${moduleKey.toUpperCase()}`,
                      desc: 'Hak akses fungsionalitas sistem',
                    };

                    const allModuleCodes = modulePerms.map((p) => p.code);
                    const checkedModuleCodes = allModuleCodes.filter((c) =>
                      workingPermissionCodes.has(c)
                    );
                    const isAllModuleChecked =
                      allModuleCodes.length > 0 &&
                      checkedModuleCodes.length === allModuleCodes.length;

                    return (
                      <div
                        key={moduleKey}
                        className="bg-slate-950/60 border border-slate-800/80 rounded-2xl overflow-hidden"
                      >
                        {/* Module Header Bar */}
                        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-2 h-2 rounded-full bg-amber-400" />
                            <div>
                              <h4 className="text-xs font-bold text-white leading-tight">
                                {info.title}
                              </h4>
                              <p className="text-[11px] text-slate-500">{info.desc}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-slate-400 font-mono">
                              <strong className="text-white">{checkedModuleCodes.length}</strong> /{' '}
                              {allModuleCodes.length} aktif
                            </span>

                            {/* Select All in Module Button (for Custom Roles only) */}
                            {!selectedRole.is_system && (
                              <button
                                type="button"
                                onClick={() => handleToggleModuleAll(moduleKey)}
                                className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold transition underline decoration-dotted"
                              >
                                {isAllModuleChecked ? 'Batalkan Semua' : 'Pilih Semua'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Permission Checkboxes Grid */}
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          {modulePerms.map((perm) => {
                            const isChecked = workingPermissionCodes.has(perm.code);
                            const isSystem = selectedRole.is_system;

                            return (
                              <label
                                key={perm.id}
                                className={`flex items-start gap-2.5 p-3 rounded-xl border transition select-none ${
                                  isSystem
                                    ? isChecked
                                      ? 'bg-slate-900/90 border-slate-700/80 text-slate-300'
                                      : 'bg-slate-950/40 border-slate-850 text-slate-600 opacity-60'
                                    : isChecked
                                    ? 'bg-amber-500/10 border-amber-500/30 text-white cursor-pointer'
                                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 cursor-pointer'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={isSystem}
                                  checked={isChecked}
                                  onChange={() => handleTogglePermission(perm.code)}
                                  className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500 disabled:opacity-50"
                                />

                                <div className="space-y-0.5 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`font-semibold ${
                                        isChecked ? 'text-white' : 'text-slate-400'
                                      }`}
                                    >
                                      {perm.name}
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-500">
                                    {perm.code}
                                  </div>
                                  {perm.description && (
                                    <p className="text-[11px] text-slate-400 leading-snug pt-0.5">
                                      {perm.description}
                                    </p>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                <Shield className="w-12 h-12 mx-auto mb-3 text-slate-600 opacity-60" />
                <p className="text-sm font-semibold text-white">Pilih Role untuk Memeriksa Izin</p>
                <p className="text-xs text-slate-500 mt-1">
                  Pilih salah satu peran di panel kiri untuk meninjau atau menyesuaikan matriks hak akses.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Role Modal */}
      <CustomRoleFormModal
        isOpen={isRoleModalOpen}
        onClose={() => {
          setIsRoleModalOpen(false);
          setEditingRole(null);
        }}
        editingRole={editingRole}
        onSuccess={() => loadData(true)}
        onNotification={onNotification}
      />
    </div>
  );
}
