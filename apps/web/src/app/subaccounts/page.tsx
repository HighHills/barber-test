'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePos, PosProvider } from '../../context/pos-context';
import { RoleGuard } from '../../components/auth/role-guard';
import type { CashierSubAccountItem } from '../../types/pos';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Building2,
  Mail,
  Phone,
  Lock,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  PlayCircle,
  RotateCcw,
  RefreshCw,
  Store,
  Package,
  BarChart3,
  TrendingUp,
  Eye,
  EyeOff,
  UserCheck,
  Power,
} from 'lucide-react';

function SubaccountsContent(): React.JSX.Element {
  const {
    supabase,
    availableOutlets,
    currentOutlet,
    simulatedRole,
    assignedOutletId,
    simulateRole,
  } = usePos();

  // Data states
  const [cashiers, setCashiers] = useState<CashierSubAccountItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOutletFilter, setSelectedOutletFilter] = useState<string>('ALL');

  // Form states
  const [displayName, setDisplayName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [phone, setPhone] = useState<string>('');
  const [selectedOutletId, setSelectedOutletId] = useState<string>(
    availableOutlets[0]?.id || ''
  );

  // Notifications
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Sync default selected outlet
  useEffect(() => {
    if (availableOutlets.length > 0 && !selectedOutletId) {
      setSelectedOutletId(availableOutlets[0].id);
    }
  }, [availableOutlets, selectedOutletId]);

  // 1. Fetch all cashiers
  const loadCashiers = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Try RPC list_cashier_subaccounts first
      const { data: rpcData, error: rpcErr } = await supabase.rpc('list_cashier_subaccounts');

      if (!rpcErr && rpcData) {
        setCashiers(rpcData as CashierSubAccountItem[]);
        return;
      }

      // Fallback: Direct join query
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
    loadCashiers();
  }, [loadCashiers]);

  // 2. Handle Create Subaccount
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!displayName.trim() || !email.trim() || !password.trim() || !selectedOutletId) {
      setErrorMsg('Harap isi seluruh field bertanda bintang (*).');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password akun kasir minimal 6 karakter.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Try calling create_cashier_subaccount RPC
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
        `Sub-akun kasir untuk "${displayName}" berhasil didaftarkan! Kasir kini dapat login dan ditugaskan melayani transaksi di cabang terkait.`
      );

      // Reset form
      setDisplayName('');
      setEmail('');
      setPassword('');
      setPhone('');
      await loadCashiers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat sub-akun kasir';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Toggle Status Aktif / Nonaktif
  const handleToggleStatus = async (cashier: CashierSubAccountItem) => {
    setTogglingId(cashier.id);
    try {
      const newStatus = !cashier.is_active;
      // 1. Try RPC toggle_cashier_status
      const { error: rpcErr } = await supabase.rpc('toggle_cashier_status', {
        p_cashier_profile_id: cashier.id,
        p_is_active: newStatus,
      });

      if (rpcErr) {
        // Fallback: try modern role-agnostic RPC set_user_active
        const { error: fallbackErr } = await supabase.rpc('set_user_active', {
          p_profile_id: cashier.id,
          p_is_active: newStatus,
        });

        if (fallbackErr) {
          throw new Error(fallbackErr.message || rpcErr.message);
        }
      }

      setCashiers((prev) =>
        prev.map((c) => (c.id === cashier.id ? { ...c, is_active: newStatus } : c))
      );
      setSuccessMsg(
        `Status akun ${cashier.display_name} berhasil diubah menjadi: ${
          newStatus ? 'AKTIF' : 'NONAKTIF'
        }`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status kasir';
      setErrorMsg(msg);
    } finally {
      setTogglingId(null);
    }
  };

  // Filtered Cashiers
  const filteredCashiers = useMemo(() => {
    return cashiers.filter((c) => {
      // Outlet filter
      if (selectedOutletFilter !== 'ALL' && c.outlet_id !== selectedOutletFilter) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = c.display_name.toLowerCase().includes(q);
        const matchPhone = c.phone?.toLowerCase().includes(q);
        const matchOutlet = c.outlet_name.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchOutlet) return false;
      }

      return true;
    });
  }, [cashiers, selectedOutletFilter, searchQuery]);

  // Summary Metrics
  const activeCount = useMemo(() => cashiers.filter((c) => c.is_active).length, [cashiers]);
  const coveredOutletsCount = useMemo(() => {
    const ids = new Set(cashiers.map((c) => c.outlet_id).filter(Boolean));
    return ids.size;
  }, [cashiers]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* 1. Global Header (Matching POS, Accounting, Inventory) */}
      <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 text-xs font-semibold transition border border-slate-700"
              title="Kembali ke Terminal POS"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>POS Terminal</span>
            </Link>

            <div className="h-5 w-px bg-slate-700 hidden sm:block" />

            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white leading-tight">
                  Manajemen Sub-Akun Kasir
                </h1>
                <p className="text-[11px] text-slate-400">
                  Kontrol Hak Akses Multi-Cabang & Penugasan Kasir (RBAC)
                </p>
              </div>
            </div>
          </div>

          {/* Quick Owner Navigation Links */}
          <div className="flex items-center gap-2">
            <Link
              href="/inventory"
              className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-slate-700 transition"
              title="Manajemen Persediaan Stok Cabang"
            >
              <Package className="w-3.5 h-3.5 text-amber-400" />
              <span>Stok</span>
            </Link>
            <Link
              href="/accounting"
              className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-slate-700 transition"
              title="Laporan Keuangan & Akuntansi (Owner)"
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Keuangan</span>
            </Link>
            <Link
              href="/analytics"
              className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-slate-700 transition"
              title="Analitik Bisnis Eksekutif (Owner)"
            >
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span>Analitik</span>
            </Link>

            <button
              onClick={loadCashiers}
              disabled={loading}
              className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white"
              title="Muat Ulang Data Kasir"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Simulation Banner if Active */}
        {simulatedRole && (
          <div className="border-t border-amber-500/30 bg-amber-500/15 px-6 py-2 text-xs text-amber-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4 animate-pulse text-amber-400" />
              <span>
                Mode Simulasi Kasir Aktif: Outlet Terkunci di{' '}
                <strong>{currentOutlet?.name || assignedOutletId}</strong>
              </span>
            </div>
            <button
              onClick={() => simulateRole(null)}
              className="flex items-center gap-1 rounded bg-amber-500 px-2 py-0.5 font-bold text-slate-950 transition hover:bg-amber-400"
            >
              <RotateCcw className="h-3 w-3" />
              Kembalikan Akses Owner
            </button>
          </div>
        )}
      </header>

      {/* 2. Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-6">
        {/* KPI Metrics Overview (White Cards with subtle shadow) */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">Total Sub-Akun</span>
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{cashiers.length}</span>
              <span className="text-xs text-slate-500">kasir</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">Kasir Aktif</span>
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <UserCheck className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">{activeCount}</span>
              <span className="text-xs text-slate-500">siap tugas</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">Cabang Tercover</span>
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Store className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-blue-600">{coveredOutletsCount}</span>
              <span className="text-xs text-slate-500">dari {availableOutlets.length} outlet</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">Proteksi Keamanan</span>
              <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-sm font-bold text-purple-700">Multi-Outlet RBAC</span>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">Kasir terkunci hanya ke POS & Stok cabang</p>
          </div>
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div className="flex-1">
              <p className="font-bold text-red-900">Gagal Memproses Permintaan</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-700">
              ✕
            </button>
          </div>
        )}

        {successMsg && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
            <div className="flex-1">
              <p className="font-bold text-emerald-900">Operasi Berhasil</p>
              <p className="mt-0.5">{successMsg}</p>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-800">
              ✕
            </button>
          </div>
        )}

        {/* 3. Two-Column Dashboard Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Register New Cashier Form (5 cols on lg) */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 sm:text-base">
                    Buat Sub-Akun Kasir Baru
                  </h2>
                  <p className="text-xs text-slate-500">
                    Tugaskan kasir ke cabang spesifik secara aman
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreateAccount} className="mt-5 space-y-4">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nama Lengkap Kasir <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="misal: Rian Pratama"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                  />
                </div>

                {/* Email Login */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Email Login Kasir <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="kasir.sudirman@barbershop.com"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Digunakan kasir untuk login masuk ke terminal POS.
                  </p>
                </div>

                {/* Password with Eye Toggle */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Password Akun Kasir <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-10 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* WhatsApp / Phone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    No. WhatsApp / HP (Opsional)
                  </label>
                  <div className="relative">
                    <Phone className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="08123456789"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Outlet Assignment */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Cabang Outlet Penugasan <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <select
                      value={selectedOutletId}
                      onChange={(e) => setSelectedOutletId(e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                    >
                      {availableOutlets.map((outlet) => (
                        <option key={outlet.id} value={outlet.id}>
                          {outlet.name} ({outlet.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[10px] text-amber-700 mt-1.5 font-medium">
                    🔒 Kasir ini hanya diizinkan membuka kasir dan melihat transaksi di cabang ini.
                  </p>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-xs font-bold text-slate-950 shadow-md shadow-amber-500/20 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Mendaftarkan Sub-Akun...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Daftarkan Sub-Akun Kasir
                    </>
                  )}
                </button>
              </form>

              {/* Security Badge Info */}
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
                <div className="flex items-center gap-2 font-semibold text-slate-800 mb-1">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Isolasi Multi-Cabang Aman</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Sub-akun dibuat dengan role <strong>CASHIER</strong> di tabel <code className="text-amber-700 font-mono">user_roles</code>. Kasir tidak memiliki akses ke laporan keuangan, analitik, maupun cabang lain.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: List of Existing Cashiers (7 cols on lg) */}
          <div className="space-y-4 lg:col-span-7">
            {/* Search & Filter Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kasir berdasarkan nama, nomor HP, atau cabang..."
                  className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-none shadow-xs"
                />
              </div>

              {/* Outlet Filter */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedOutletFilter}
                  onChange={(e) => setSelectedOutletFilter(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-700 focus:border-amber-500 focus:outline-none shadow-xs"
                >
                  <option value="ALL">Semua Cabang ({cashiers.length})</option>
                  {availableOutlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Cashiers List */}
            {loading ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-500 shadow-xs">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500 mb-3" />
                <p className="text-sm font-medium">Memuat data sub-akun kasir...</p>
              </div>
            ) : filteredCashiers.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-500 shadow-xs">
                <Users className="h-12 w-12 text-slate-400 mb-3 stroke-1" />
                <p className="text-sm font-bold text-slate-700">Tidak ada sub-akun ditemukan</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  {searchQuery
                    ? 'Coba ganti kata kunci pencarian Anda.'
                    : 'Belum ada sub-akun kasir yang didaftarkan. Gunakan formulir di sebelah kiri untuk membuat sub-akun kasir pertama.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCashiers.map((cashier) => {
                  const isSimulated =
                    simulatedRole === 'CASHIER' && assignedOutletId === cashier.outlet_id;

                  return (
                    <div
                      key={cashier.id}
                      className={`rounded-2xl border bg-white p-4 transition shadow-xs ${
                        isSimulated
                          ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-400/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Profile Info */}
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 border border-amber-200 text-sm font-black text-amber-800 shadow-xs">
                            {cashier.display_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900">
                                {cashier.display_name}
                              </h3>
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  cashier.is_active
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {cashier.is_active ? 'Aktif' : 'Nonaktif'}
                              </span>
                              {isSimulated && (
                                <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-slate-950 animate-pulse">
                                  Simulasi Aktif
                                </span>
                              )}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3.5 w-3.5 text-amber-600" />
                                <strong className="text-slate-800">{cashier.outlet_name}</strong> ({cashier.outlet_code})
                              </span>
                              {cashier.phone && cashier.phone !== '-' && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-slate-400" />
                                  {cashier.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 justify-end">
                          {/* Toggle Active Switch */}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(cashier)}
                            disabled={togglingId === cashier.id}
                            className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition border ${
                              cashier.is_active
                                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                            title={cashier.is_active ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
                          >
                            <Power className="h-3 w-3" />
                            <span>{cashier.is_active ? 'Nonaktifkan' : 'Aktifkan'}</span>
                          </button>

                          {/* Simulation Button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isSimulated) {
                                simulateRole(null);
                              } else {
                                simulateRole('CASHIER', cashier.outlet_id);
                              }
                            }}
                            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition shadow-xs ${
                              isSimulated
                                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                                : 'bg-slate-50 hover:bg-amber-50 text-amber-900 border border-slate-200 hover:border-amber-300'
                            }`}
                            title="Uji coba sistem menggunakan sudut pandang dan pembatasan kasir ini"
                          >
                            {isSimulated ? (
                              <>
                                <RotateCcw className="h-3.5 w-3.5" />
                                Akhiri Simulasi
                              </>
                            ) : (
                              <>
                                <PlayCircle className="h-3.5 w-3.5 text-amber-600" />
                                Simulasi Kasir
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SubaccountsPage(): React.JSX.Element {
  return (
    <PosProvider>
      <RoleGuard allowedRoles={['OWNER', 'ADMIN']} pageTitle="Manajemen Sub-Akun Kasir">
        <SubaccountsContent />
      </RoleGuard>
    </PosProvider>
  );
}
