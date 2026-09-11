'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { RoleItem, OutletItem } from '../../types/settings';
import {
  X,
  UserPlus,
  Loader2,
  AlertCircle,
  Mail,
  Lock,
  Phone,
  Store,
  Shield,
  Eye,
  EyeOff,
  Globe,
  Info,
} from 'lucide-react';

interface CreateSubaccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  roles: RoleItem[];
  outlets: OutletItem[];
  onSuccess: () => void;
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function CreateSubaccountModal({
  isOpen,
  onClose,
  roles,
  outlets,
  onSuccess,
  onNotification,
}: CreateSubaccountModalProps): React.JSX.Element | null {
  const { supabase } = usePos();

  const [displayName, setDisplayName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [phone, setPhone] = useState<string>('');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize defaults on open
  useEffect(() => {
    if (isOpen) {
      setDisplayName('');
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setPhone('');
      setFormError(null);

      // Default role to CASHIER if available, otherwise first role
      const cashierRole = roles.find((r) => r.code === 'CASHIER');
      setSelectedRoleId(cashierRole ? cashierRole.id : roles[0]?.id || '');

      // Default outlet to first available outlet
      setSelectedOutletId(outlets[0]?.id || '');
    }
  }, [isOpen, roles, outlets]);

  const selectedRole = useMemo(() => {
    return roles.find((r) => r.id === selectedRoleId);
  }, [roles, selectedRoleId]);

  if (!isOpen) return null;

  const roleCode = selectedRole?.code?.toUpperCase() || '';
  const isOwnerOrAdmin = roleCode === 'OWNER' || roleCode === 'ADMIN';
  const isOutletMandatory = ['MANAGER', 'CASHIER', 'BARBER', 'INVENTORY'].includes(roleCode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setFormError('Nama lengkap pengguna wajib diisi (minimal 2 karakter).');
      return;
    }

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError('Format alamat email login tidak valid.');
      return;
    }

    if (!password || password.length < 6) {
      setFormError('Password login akun minimal 6 karakter.');
      return;
    }

    if (!selectedRoleId) {
      setFormError('Harap tentukan peran (role) untuk akun baru.');
      return;
    }

    if (isOutletMandatory && !selectedOutletId) {
      setFormError(`Role ${roleCode} wajib ditugaskan pada salah satu cabang/outlet operasional.`);
      return;
    }

    if (outlets.length === 0) {
      setFormError('Belum ada cabang outlet yang terdaftar di sistem.');
      return;
    }

    // create_cashier_subaccount requires a valid outlet UUID
    const outletForCreate = selectedOutletId || outlets[0].id;

    setIsSubmitting(true);
    try {
      // 1. Invoke create_cashier_subaccount RPC
      const { data: createData, error: createErr } = await supabase.rpc(
        'create_cashier_subaccount',
        {
          p_email: trimmedEmail,
          p_password: password,
          p_display_name: trimmedName,
          p_phone: trimmedPhone || null,
          p_outlet_id: outletForCreate,
        }
      );

      if (createErr) {
        throw new Error(createErr.message);
      }

      const profileId = (createData as { profile_id?: string })?.profile_id;

      // 2. If the user selected a role other than CASHIER, or if role is OWNER/ADMIN (global access)
      if (profileId && (roleCode !== 'CASHIER' || isOwnerOrAdmin)) {
        const targetOutletId = isOwnerOrAdmin ? null : (selectedOutletId || null);
        const { error: roleErr } = await supabase.rpc('save_user_role', {
          p_profile_id: profileId,
          p_role_id: selectedRoleId,
          p_outlet_id: targetOutletId,
        });

        if (roleErr) {
          console.warn('Warning updating custom role post-creation:', roleErr);
        }
      }

      onNotification?.({
        type: 'SUCCESS',
        message: `Sub-akun "${trimmedName}" berhasil didaftarkan sebagai ${selectedRole?.name || 'Kasir'}!`,
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('Create subaccount error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal membuat sub-akun pengguna';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Tambah Sub-Akun Baru</h3>
              <p className="text-xs text-slate-400">
                Daftarkan akun login staf & atur peran serta cabang penugasan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {formError && (
            <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Display Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nama Lengkap Pengguna <span className="text-amber-400">*</span>
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="misal: Rian Pratama"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Email Login Akun <span className="text-amber-400">*</span>
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staf.cabang@barbershop.com"
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Digunakan pengguna untuk masuk ke aplikasi web dan POS.
            </p>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Password Login Akun <span className="text-amber-400">*</span>
            </label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Phone / WhatsApp */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nomor WhatsApp / Telepon (Opsional)
            </label>
            <div className="relative">
              <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08123456789"
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition font-mono"
              />
            </div>
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Peran Akun (Role) <span className="text-amber-400">*</span>
            </label>
            <div className="relative">
              <Shield className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 transition"
              >
                {roles
                  .filter((r) => r.is_active)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code}) {r.is_system ? '— Sistem' : '— Kustom'}
                    </option>
                  ))}
              </select>
            </div>
            {selectedRole?.description && (
              <p className="text-[11px] text-slate-400 mt-1 italic">
                {selectedRole.description}
              </p>
            )}
          </div>

          {/* Outlet Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Cabang Outlet Penugasan{' '}
              {isOutletMandatory ? <span className="text-amber-400">*</span> : null}
            </label>
            {isOwnerOrAdmin ? (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-2 text-xs text-amber-400">
                <Globe className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Role <strong>{roleCode}</strong> memiliki otoritas global ke seluruh cabang. Penugasan otomatis berlaku untuk semua cabang.
                </span>
              </div>
            ) : (
              <div className="relative">
                <Store className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <select
                  value={selectedOutletId}
                  onChange={(e) => setSelectedOutletId(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 transition"
                >
                  {!isOutletMandatory && (
                    <option value="">Akses Global (Semua Cabang)</option>
                  )}
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {isOutletMandatory && (
              <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3 text-slate-500 shrink-0" />
                <span>Staf dengan role ini terkunci melayani transaksi pada cabang ini saja.</span>
              </p>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition shadow-md shadow-amber-500/20 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Mendaftarkan...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Daftarkan Sub-Akun</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
