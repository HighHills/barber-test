'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { PaymentMethodItem, FinancialAccountItem } from '../../types/settings';
import { PaymentMethodModal } from './payment-method-modal';
import {
  CreditCard,
  Plus,
  Search,
  Edit2,
  Power,
  RefreshCw,
  Loader2,
  Building,
  AlertTriangle,
} from 'lucide-react';

interface PaymentMethodsPanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function PaymentMethodsPanel({ onNotification }: PaymentMethodsPanelProps): React.JSX.Element {
  const { supabase, refreshData } = usePos();

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccountItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethodItem | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // 1. Fetch Payment Methods and Financial Accounts (SELECT Only)
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      // 1. Fetch active financial accounts for mapping
      const { data: faData, error: faErr } = await supabase
        .from('financial_accounts')
        .select('id, account_code, account_name, account_type, is_active')
        .eq('is_active', true)
        .order('account_code', { ascending: true });
      if (faErr) throw faErr;

      // 2. Fetch payment methods with financial_account relation
      const { data: pmData, error: pmErr } = await supabase
        .from('payment_methods')
        .select(`
          id,
          code,
          name,
          type,
          financial_account_id,
          is_active,
          financial_accounts (account_code, account_name)
        `)
        .order('name', { ascending: true });
      if (pmErr) throw pmErr;

      const formatted: PaymentMethodItem[] = (pmData || []).map((pm: any) => ({
        id: pm.id,
        code: pm.code,
        name: pm.name,
        type: pm.type,
        financial_account_id: pm.financial_account_id,
        financial_account_code: pm.financial_accounts?.account_code,
        financial_account_name: pm.financial_accounts?.account_name,
        is_active: pm.is_active,
      }));

      setPaymentMethods(formatted);
      setFinancialAccounts(faData || []);
    } catch (err: unknown) {
      console.error('Failed to load payment methods data:', err);
      const msg = err instanceof Error ? err.message : 'Gagal memuat metode pembayaran';
      onNotification?.({
        type: 'ERROR',
        message: msg,
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase, onNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Operational Counts
  const activeCount = useMemo(() => paymentMethods.filter((pm) => pm.is_active).length, [paymentMethods]);
  const inactiveCount = useMemo(() => paymentMethods.length - activeCount, [paymentMethods, activeCount]);
  const withAccountCount = useMemo(
    () => paymentMethods.filter((pm) => Boolean(pm.financial_account_id)).length,
    [paymentMethods]
  );

  // 2. Toggle Status via RPC save_payment_method
  const handleToggleActive = async (method: PaymentMethodItem) => {
    setTogglingId(method.id);
    try {
      const nextActive = !method.is_active;

      const { data, error } = await supabase.rpc('save_payment_method', {
        p_payment_method_id: method.id,
        p_code: method.code,
        p_name: method.name,
        p_type: method.type,
        p_financial_account_id: method.financial_account_id,
        p_is_active: nextActive,
      });

      if (error) throw error;
      if (data && typeof data === 'object' && 'success' in data && !(data as any).success) {
        throw new Error((data as any).message || 'Gagal mengubah status metode pembayaran');
      }

      onNotification?.({
        type: 'SUCCESS',
        message: `Metode pembayaran "${method.name}" berhasil ${nextActive ? 'diaktifkan' : 'dinonaktifkan'}`,
      });

      // Optimistic update
      setPaymentMethods((prev) =>
        prev.map((pm) => (pm.id === method.id ? { ...pm, is_active: nextActive } : pm))
      );

      // Refresh POS state
      await refreshData();
    } catch (err: unknown) {
      console.error('Failed to toggle payment method status:', err);
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status metode pembayaran';
      onNotification?.({
        type: 'ERROR',
        message: msg,
      });
    } finally {
      setTogglingId(null);
    }
  };

  // 3. Filtered Methods
  const filteredMethods = useMemo(() => {
    return paymentMethods.filter((pm) => {
      const query = searchQuery.trim().toLowerCase();
      const matchSearch =
        !query ||
        pm.name.toLowerCase().includes(query) ||
        pm.code.toLowerCase().includes(query) ||
        (pm.financial_account_name && pm.financial_account_name.toLowerCase().includes(query)) ||
        (pm.financial_account_code && pm.financial_account_code.toLowerCase().includes(query));

      const matchType = typeFilter === 'ALL' || pm.type === typeFilter;

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && pm.is_active) ||
        (statusFilter === 'INACTIVE' && !pm.is_active);

      return matchSearch && matchType && matchStatus;
    });
  }, [paymentMethods, searchQuery, typeFilter, statusFilter]);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'CASH':
        return 'Tunai (Cash)';
      case 'QRIS':
        return 'QRIS';
      case 'BANK_TRANSFER':
        return 'Transfer Bank';
      case 'EDC':
        return 'Mesin EDC';
      case 'E_WALLET':
        return 'E-Wallet';
      case 'DEBIT':
        return 'Debit';
      case 'CREDIT_CARD':
        return 'Kartu Kredit';
      default:
        return type;
    }
  };

  const isFiltered = Boolean(searchQuery.trim() || typeFilter !== 'ALL' || statusFilter !== 'ALL');

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-7 space-y-6 shadow-xs">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-white leading-tight">
              Metode Pembayaran
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Kelola kanal transaksi pembayaran kasir POS dan pemetaan akun buku besar (Chart of Accounts).
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {paymentMethods.length} metode terdaftar · {activeCount} aktif · {inactiveCount} nonaktif · {withAccountCount} terhubung ke COA
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isLoading || isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-medium border border-slate-700/80 min-h-[40px]"
            title="Muat ulang data metode pembayaran"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingMethod(null);
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-xs shadow-amber-500/20 min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Metode</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, kode, atau akun COA..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition min-h-[40px]"
          />
        </div>

        {/* Type Filter */}
        <div className="w-full lg:w-48 shrink-0">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none transition min-h-[40px]"
          >
            <option value="ALL">Semua Tipe Pembayaran</option>
            <option value="CASH">Tunai (Cash)</option>
            <option value="QRIS">QRIS</option>
            <option value="BANK_TRANSFER">Transfer Bank</option>
            <option value="EDC">Mesin EDC</option>
            <option value="E_WALLET">E-Wallet</option>
            <option value="DEBIT">Debit</option>
            <option value="CREDIT_CARD">Kartu Kredit</option>
          </select>
        </div>

        {/* Status Segmented Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs shrink-0 self-start lg:self-auto">
          {(
            [
              { id: 'ALL', label: `Semua (${paymentMethods.length})` },
              { id: 'ACTIVE', label: `Aktif (${activeCount})` },
              { id: 'INACTIVE', label: `Nonaktif (${inactiveCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition min-h-[32px] ${
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

      {/* Main List */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16 space-y-3">
            <Loader2 className="w-7 h-7 animate-spin text-amber-500" />
            <p className="text-xs text-slate-400">Memuat data metode pembayaran...</p>
          </div>
        ) : filteredMethods.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                {isFiltered
                  ? 'Tidak ada metode pembayaran yang cocok'
                  : 'Belum ada metode pembayaran terdaftar'}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                {isFiltered
                  ? 'Coba sesuaikan kata kunci pencarian atau filter status yang Anda pilih.'
                  : 'Daftarkan metode pembayaran untuk kasir POS seperti Tunai, QRIS, atau Transfer Bank.'}
              </p>
            </div>
            {isFiltered ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setTypeFilter('ALL');
                  setStatusFilter('ALL');
                }}
                className="inline-flex items-center text-xs font-semibold text-amber-400 hover:text-amber-300 hover:underline pt-2"
              >
                Reset Semua Filter
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingMethod(null);
                  setIsModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-xs shadow-amber-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Metode Sekarang</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredMethods.map((pm) => {
              const isToggling = togglingId === pm.id;

              return (
                <div
                  key={pm.id}
                  className={`p-4 sm:p-5 transition hover:bg-slate-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    !pm.is_active ? 'opacity-70 bg-slate-950/40' : ''
                  }`}
                >
                  {/* Left Side: Information & Mapping */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {pm.code}
                      </span>
                      <h3 className="text-sm font-bold text-white leading-tight">
                        {pm.name}
                      </h3>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/80">
                        {getTypeLabel(pm.type)}
                      </span>
                      {pm.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 bg-slate-800/80 px-2.5 py-0.5 rounded-full border border-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                          Nonaktif
                        </span>
                      )}
                    </div>

                    {/* Financial Account COA Mapping */}
                    <div className="flex items-center flex-wrap gap-2 text-xs">
                      {pm.financial_account_code ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
                          <Building className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-slate-400">Akun COA:</span>
                          <span className="font-mono text-amber-400 font-semibold">
                            [{pm.financial_account_code}]
                          </span>
                          <span className="text-slate-200 font-medium">
                            {pm.financial_account_name}
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400/90 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Belum dipetakan ke akun buku kas/bank (COA)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Side: Operational Actions */}
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMethod(pm);
                        setIsModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700/80 min-h-[40px]"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleActive(pm)}
                      disabled={isToggling}
                      className={`flex items-center justify-center p-2 rounded-xl border transition min-h-[40px] min-w-[40px] ${
                        pm.is_active
                          ? 'border-slate-700/80 bg-slate-800/40 text-slate-400 hover:text-rose-400 hover:border-rose-900/50 hover:bg-rose-950/20'
                          : 'border-slate-700/80 bg-slate-800/40 text-slate-400 hover:text-emerald-400 hover:border-emerald-900/50 hover:bg-emerald-950/20'
                      }`}
                      title={pm.is_active ? 'Nonaktifkan Metode Pembayaran' : 'Aktifkan Metode Pembayaran'}
                      aria-label={pm.is_active ? `Nonaktifkan ${pm.name}` : `Aktifkan ${pm.name}`}
                    >
                      {isToggling ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                      ) : (
                        <Power className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      <PaymentMethodModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingMethod(null);
        }}
        paymentMethod={editingMethod}
        financialAccounts={financialAccounts}
        onSuccess={() => {
          loadData(true);
        }}
        onNotification={onNotification}
      />
    </div>
  );
}
