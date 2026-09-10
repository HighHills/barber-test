'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { SettingsUserItem, RoleItem, OutletItem } from '../../types/settings';
import {
  X,
  Shield,
  Loader2,
  AlertCircle,
  Info,
  CheckCircle2,
  Globe,
} from 'lucide-react';

interface UserRoleAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: SettingsUserItem | null;
  roles: RoleItem[];
  outlets: OutletItem[];
  onSuccess: () => void;
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function UserRoleAssignmentModal({
  isOpen,
  onClose,
  user,
  roles,
  outlets,
  onSuccess,
  onNotification,
}: UserRoleAssignmentModalProps): React.JSX.Element | null {
  const { supabase } = usePos();

  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize selected values from user when modal opens
  useEffect(() => {
    if (user) {
      setSelectedRoleId(user.role_id || '');
      setSelectedOutletId(user.outlet_id || '');
      setFormError(null);
    }
  }, [user, isOpen]);

  const selectedRole = useMemo(() => {
    return roles.find((r) => r.id === selectedRoleId);
  }, [roles, selectedRoleId]);

  if (!isOpen || !user) return null;

  // Determine outlet requirement based on role rules
  const roleCode = selectedRole?.code?.toUpperCase() || '';
  const isOwnerOrAdmin = roleCode === 'OWNER' || roleCode === 'ADMIN';
  const isAccounting = roleCode === 'ACCOUNTING';
  const isOutletMandatory = ['MANAGER', 'CASHIER', 'BARBER', 'INVENTORY'].includes(roleCode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedRoleId) {
      setFormError('Harap pilih peran (role) untuk pengguna ini.');
      return;
    }

    if (isOutletMandatory && !selectedOutletId) {
      setFormError(`Role ${roleCode} wajib ditugaskan pada salah satu cabang/outlet operasional.`);
      return;
    }

    // OWNER & ADMIN must have NULL outlet
    const p_outlet_id = isOwnerOrAdmin ? null : (selectedOutletId || null);

    setIsSubmitting(true);
    try {
      const { error: rpcErr } = await supabase.rpc('save_user_role', {
        p_profile_id: user.id,
        p_role_id: selectedRoleId,
        p_outlet_id: p_outlet_id,
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      onNotification?.({
        type: 'SUCCESS',
        message: `Role & cabang untuk pengguna "${user.display_name}" berhasil diperbarui!`,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('save_user_role error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui role & cabang pengguna';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                Ubah Peran & Cabang Pengguna
              </h2>
              <p className="text-xs text-slate-400">
                Penugasan role dan cakupan outlet untuk sub-akun sistem
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Info Bar */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-400">Pengguna: </span>
            <strong className="text-white font-semibold">{user.display_name}</strong>
            {user.email && (
              <span className="text-slate-500 ml-1.5 font-mono text-[11px]">({user.email})</span>
            )}
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
              user.is_active
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}
          >
            {user.is_active ? 'Aktif' : 'Nonaktif'}
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {formError && (
            <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-red-300 flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Role Selection */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-semibold">
              Peran / Role Pengguna <span className="text-red-400">*</span>
            </label>
            <select
              value={selectedRoleId}
              onChange={(e) => {
                const newRoleId = e.target.value;
                setSelectedRoleId(newRoleId);
                const r = roles.find((x) => x.id === newRoleId);
                if (r && (r.code === 'OWNER' || r.code === 'ADMIN')) {
                  setSelectedOutletId('');
                }
              }}
              required
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
            >
              <option value="" disabled>
                -- Pilih Peran (Role) --
              </option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.code}) {r.is_system ? '• System' : '• Custom'}
                </option>
              ))}
            </select>
            {selectedRole?.description && (
              <p className="text-[11px] text-slate-400 leading-relaxed italic">
                {selectedRole.description}
              </p>
            )}
          </div>

          {/* Outlet Selection with Dynamic Business Rules */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-slate-300 font-semibold">
              Penugasan Cabang / Outlet{' '}
              {isOutletMandatory && <span className="text-red-400">*</span>}
            </label>

            {isOwnerOrAdmin ? (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="font-semibold text-white">Akses Global Seluruh Cabang</div>
                  <div className="text-[11px] text-slate-400">
                    Role <strong className="text-amber-300">{roleCode}</strong> secara otomatis
                    memiliki akses ke seluruh outlet/cabang bisnis (Outlet ID: NULL).
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <select
                  value={selectedOutletId}
                  onChange={(e) => setSelectedOutletId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
                >
                  {isAccounting ? (
                    <option value="">-- Global / Akses Semua Cabang (Opsional) --</option>
                  ) : !isOutletMandatory ? (
                    <option value="">-- Global / Tidak Terikat Cabang Tertentu --</option>
                  ) : (
                    <option value="" disabled>
                      -- Pilih Cabang Operasional * --
                    </option>
                  )}
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.code}) {!o.is_active ? '[Cabang Nonaktif]' : ''}
                    </option>
                  ))}
                </select>

                {isOutletMandatory && (
                  <p className="text-[11px] text-amber-400/90 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    Role operasional ({roleCode}) wajib terasosiasi dengan cabang tertentu.
                  </p>
                )}
                {isAccounting && (
                  <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    Role Accounting dapat dikonfigurasi untuk seluruh cabang atau cabang tertentu.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold shadow-md shadow-amber-500/20 transition disabled:opacity-50 text-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan Peran...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Simpan Perubahan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
