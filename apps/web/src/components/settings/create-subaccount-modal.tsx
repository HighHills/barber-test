'use client';

import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import type { OutletItem } from '../../types/settings';
import {
  X,
  UserPlus,
  Loader2,
  AlertCircle,
  Mail,
  Lock,
  Phone,
  Store,
  ShieldCheck,
  Eye,
  EyeOff,
  Info,
} from 'lucide-react';

interface CreateSubaccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  outlets: OutletItem[];
  onSuccess: () => void;
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function CreateSubaccountModal({
  isOpen,
  onClose,
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
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize form defaults when opened
  useEffect(() => {
    if (isOpen) {
      setDisplayName('');
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setPhone('');
      setFormError(null);

      // Default outlet to first available active outlet
      const firstActiveOutlet = outlets.find((o) => o.is_active) || outlets[0];
      setSelectedOutletId(firstActiveOutlet?.id || '');
    }
  }, [isOpen, outlets]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Synchronize validations with backend create_cashier_subaccount RPC constraints
    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setFormError('Nama kasir wajib diisi (minimal 2 karakter).');
      return;
    }

    if (!trimmedEmail || trimmedEmail.length < 5 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError('Format email kasir tidak valid.');
      return;
    }

    if (!password || password.length < 6) {
      setFormError('Password akun kasir minimal 6 karakter.');
      return;
    }

    if (!selectedOutletId) {
      setFormError('Outlet penugasan kasir wajib ditentukan.');
      return;
    }

    // Verify selected outlet is active
    const outletObj = outlets.find((o) => o.id === selectedOutletId);
    if (!outletObj || !outletObj.is_active) {
      setFormError('Outlet tujuan tidak ditemukan atau tidak aktif.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Atomic RPC create_cashier_subaccount only. No subsequent role assignment calls.
      const { error: rpcErr } = await supabase.rpc('create_cashier_subaccount', {
        p_email: trimmedEmail,
        p_password: password,
        p_display_name: trimmedName,
        p_phone: trimmedPhone || null,
        p_outlet_id: selectedOutletId,
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      onNotification?.({
        type: 'SUCCESS',
        message: `Sub-akun kasir "${trimmedName}" berhasil didaftarkan untuk cabang ${outletObj.name}!`,
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('create_cashier_subaccount error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal membuat sub-akun kasir';
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
              <h3 className="text-base font-bold text-white">Tambah Sub-Akun Kasir</h3>
              <p className="text-xs text-slate-400">
                Daftarkan akun login kasir baru dan tugaskan ke cabang spesifik
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

          {/* Role Info Banner */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-2.5 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-white flex items-center gap-1.5">
                <span>Peran Sistem:</span>
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold font-mono">
                  CASHIER
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Akun ini akan dibuat dengan hak akses Kasir POS dan otomatis terkunci hanya dapat melayani transaksi pada cabang penugasan.
              </p>
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nama Lengkap Kasir <span className="text-amber-400">*</span>
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="misal: Rian Pratama"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Email Login Kasir <span className="text-amber-400">*</span>
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kasir.sudirman@barbershop.com"
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Digunakan kasir untuk masuk ke terminal POS.
            </p>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Password Akun Kasir <span className="text-amber-400">*</span>
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
              Nomor WhatsApp / HP (Opsional)
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

          {/* Outlet Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Cabang Outlet Penugasan <span className="text-amber-400">*</span>
            </label>
            <div className="relative">
              <Store className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <select
                value={selectedOutletId}
                onChange={(e) => setSelectedOutletId(e.target.value)}
                required
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 transition"
              >
                {outlets
                  .filter((o) => o.is_active)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.code})
                    </option>
                  ))}
              </select>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <Info className="w-3 h-3 text-slate-500 shrink-0" />
              <span>Kasir ini hanya diizinkan membuka sesi kasir dan bertransaksi di cabang ini.</span>
            </p>
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
                  <span>Daftarkan Sub-Akun Kasir</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
