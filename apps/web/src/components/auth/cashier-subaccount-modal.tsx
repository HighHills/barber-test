'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePos } from '../../context/pos-context';
import {
  Users,
  UserPlus,
  Lock,
  Building2,
  Mail,
  Phone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  PlayCircle,
  RotateCcw,
  Store,
} from 'lucide-react';
import type { CashierSubAccountItem } from '../../types/pos';

interface CashierSubaccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CashierSubaccountModal({
  isOpen,
  onClose,
}: CashierSubaccountModalProps): React.JSX.Element | null {
  const {
    supabase,
    availableOutlets,
    currentOutlet,
    simulatedRole,
    assignedOutletId,
    simulateRole,
  } = usePos();

  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [cashiers, setCashiers] = useState<CashierSubAccountItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedOutletId, setSelectedOutletId] = useState<string>(
    availableOutlets[0]?.id || ''
  );

  useEffect(() => {
    if (availableOutlets.length > 0 && !selectedOutletId) {
      setSelectedOutletId(availableOutlets[0].id);
    }
  }, [availableOutlets, selectedOutletId]);

  // Load existing cashiers
  const loadCashiers = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Attempt calling list_cashier_subaccounts RPC
      const { data: rpcData, error: rpcErr } = await supabase.rpc('list_cashier_subaccounts');

      if (!rpcErr && rpcData) {
        setCashiers(rpcData as CashierSubAccountItem[]);
        return;
      }

      // 2. Direct join query fallback
      const { data: profileRoles, error: queryErr } = await supabase
        .from('user_roles')
        .select(`
          id,
          outlet_id,
          created_at,
          outlets (id, code, name),
          roles (code, name),
          profiles (id, display_name, phone, is_active)
        `)
        .order('created_at', { ascending: false });

      if (queryErr) throw queryErr;

      if (profileRoles) {
        const formatted: CashierSubAccountItem[] = profileRoles
          .filter((ur: any) => ur.roles?.code === 'CASHIER')
          .map((ur: any) => ({
            id: ur.profiles?.id || ur.id,
            display_name: ur.profiles?.display_name || 'Kasir Cabang',
            phone: ur.profiles?.phone || '-',
            role_code: ur.roles?.code || 'CASHIER',
            role_name: ur.roles?.name || 'POS Cashier',
            outlet_id: ur.outlet_id || ur.outlets?.id,
            outlet_name: ur.outlets?.name || 'Cabang Belum Ditugaskan',
            outlet_code: ur.outlets?.code || 'OUT',
            is_active: ur.profiles?.is_active !== false,
            created_at: ur.created_at,
          }));
        setCashiers(formatted);
      }
    } catch (err: unknown) {
      console.warn('Load cashiers warning:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (isOpen) {
      loadCashiers();
      setSuccessMsg(null);
      setErrorMsg(null);
    }
  }, [isOpen, loadCashiers]);

  // Handle Create Subaccount
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!displayName.trim() || !email.trim() || !password.trim() || !selectedOutletId) {
      setErrorMsg('Harap isi seluruh field wajib bertanda bintang (*)');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password akun kasir minimal 6 karakter');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Try RPC create_cashier_subaccount
      const { error: rpcErr } = await supabase.rpc('create_cashier_subaccount', {
        p_email: email.trim(),
        p_password: password,
        p_display_name: displayName.trim(),
        p_phone: phone.trim() || null,
        p_outlet_id: selectedOutletId,
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      setSuccessMsg(
        `Sub-akun kasir untuk "${displayName}" berhasil dibuat! Kasir kini dapat login dan ditugaskan ke outlet terkait.`
      );
      // Reset form
      setDisplayName('');
      setEmail('');
      setPassword('');
      setPhone('');
      await loadCashiers();
      setActiveTab('list');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat sub-akun kasir';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-700/80 bg-slate-900 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Kelola Sub-Akun Kasir Cabang</h2>
              <p className="text-xs text-slate-400">
                Buat dan batasi akses kasir sesuai outlet penugasan (Multi-Outlet RBAC)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Simulation Notice Banner */}
        {simulatedRole && (
          <div className="flex items-center justify-between bg-amber-500/15 border-b border-amber-500/30 px-6 py-2.5 text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4 animate-pulse" />
              <span>
                Simulasi Kasir Aktif: Outlet Terkunci di{' '}
                <strong>{currentOutlet?.name || assignedOutletId}</strong>
              </span>
            </div>
            <button
              onClick={() => simulateRole(null)}
              className="flex items-center gap-1 rounded bg-amber-500 px-2 py-0.5 font-bold text-slate-950 hover:bg-amber-400 transition"
            >
              <RotateCcw className="h-3 w-3" />
              Kembalikan Owner
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 px-6">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition ${
              activeTab === 'list'
                ? 'border-amber-500 text-amber-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="h-4 w-4" />
            Daftar Kasir Terdaftar ({cashiers.length})
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition ml-6 ${
              activeTab === 'create'
                ? 'border-amber-500 text-amber-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="h-4 w-4" />
            Tambah Sub-Akun Baru
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-400" />
              <div>
                <p className="font-semibold text-red-200">Gagal Memproses</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-400" />
              <div>
                <p className="font-semibold text-emerald-200">Berhasil</p>
                <p>{successMsg}</p>
              </div>
            </div>
          )}

          {activeTab === 'list' && (
            <div className="space-y-3">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-500 mb-2" />
                  <p className="text-xs">Memuat daftar kasir...</p>
                </div>
              ) : cashiers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center">
                  <Store className="mx-auto h-8 w-8 text-slate-500 mb-2" />
                  <p className="text-sm font-medium text-slate-300">Belum Ada Sub-Akun Kasir</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Buat sub-akun pertama agar staf kasir Anda hanya dapat mengakses POS & inventaris di cabang masing-masing.
                  </p>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition"
                  >
                    <UserPlus className="h-4 w-4" />
                    Buat Sub-Akun Kasir Sekarang
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/40">
                  {cashiers.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-3 transition hover:bg-slate-800/30"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-amber-400 font-bold text-sm ring-1 ring-slate-700">
                          {c.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white text-sm">
                              {c.display_name}
                            </span>
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                              {c.role_code}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                            <span className="flex items-center gap-1 text-slate-300 font-medium">
                              <Building2 className="h-3 w-3 text-amber-400" />
                              {c.outlet_name} ({c.outlet_code})
                            </span>
                            {c.phone && c.phone !== '-' && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {c.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => {
                            simulateRole('CASHIER', c.outlet_id);
                            onClose();
                          }}
                          className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition shadow-sm"
                          title="Uji sistem menggunakan sudut pandang dan hak akses kasir ini"
                        >
                          <PlayCircle className="h-3.5 w-3.5" />
                          Simulasi Kasir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">
                <p className="font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" /> Jaminan Keamanan Kasir
                </p>
                <p>
                  Setiap kasir hanya bisa mengakses transaksi cabang mereka. Menu Akuntansi/Keuangan dan Analitik Eksekutif disembunyikan dan di-lock total oleh database RLS.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'create' && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nama Lengkap Kasir *
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Contoh: Rian Pratama"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    No. WhatsApp / HP
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Email Login Kasir *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="kasir.cabang@barbershop.co.id"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Password Login Kasir * (Min. 6 Karakter)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-amber-400 mb-1 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Outlet Penugasan Kasir (Terkunci Ketat) *
                </label>
                <select
                  required
                  value={selectedOutletId}
                  onChange={(e) => setSelectedOutletId(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                >
                  {availableOutlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.name} ({outlet.code})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  Kasir yang didaftarkan <strong>hanya dapat melayani dan melihat stok di outlet ini</strong>, dan tidak dapat berpindah ke outlet lain.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Membuat Sub-Akun...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Simpan & Tugaskan Kasir
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
