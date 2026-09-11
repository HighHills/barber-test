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
  CheckCircle2,
  XCircle,
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
    } catch (err: any) {
      console.error('Failed to load payment methods data:', err);
      onNotification?.({
        type: 'ERROR',
        message: err.message || 'Gagal memuat metode pembayaran',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase, onNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      refreshData();
    } catch (err: any) {
      console.error('Failed to toggle payment method status:', err);
      onNotification?.({
        type: 'ERROR',
        message: err.message || 'Gagal mengubah status metode pembayaran',
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
        (pm.financial_account_name && pm.financial_account_name.toLowerCase().includes(query));

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

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <CreditCard className="w-6 h-6 text-amber-500" />
            Metode Pembayaran
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Kelola kanal transaksi pembayaran kasir POS dan integrasi pembukuan jurnal akun keuangan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isLoading || isRefreshing}
            className="p-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors disabled:opacity-50"
            title="Muat Ulang Data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingMethod(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm rounded-lg transition-colors shadow-sm shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            Tambah Metode
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama atau kode..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>

        <div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">Hanya Aktif</option>
            <option value="INACTIVE">Hanya Nonaktif</option>
          </select>
        </div>
      </div>

      {/* Main List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Memuat metode pembayaran...</p>
        </div>
      ) : filteredMethods.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-center px-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
            <CreditCard className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
            {searchQuery || typeFilter !== 'ALL' || statusFilter !== 'ALL'
              ? 'Tidak ada metode pembayaran yang cocok'
              : 'Belum ada metode pembayaran'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">
            {searchQuery || typeFilter !== 'ALL' || statusFilter !== 'ALL'
              ? 'Coba sesuaikan kata kunci pencarian atau filter status yang Anda pilih.'
              : 'Tambahkan metode pembayaran untuk menerima transaksi tunai, transfer, atau QRIS di kasir.'}
          </p>
          {(searchQuery || typeFilter !== 'ALL' || statusFilter !== 'ALL') ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setTypeFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
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
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Metode Sekarang
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMethods.map((pm) => (
            <div
              key={pm.id}
              className={`p-4 bg-white dark:bg-slate-900 rounded-xl border transition-all flex flex-col justify-between ${
                pm.is_active
                  ? 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  : 'border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40 opacity-75'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {pm.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {pm.code}
                        </span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          {getTypeLabel(pm.type)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {pm.is_active ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/50 dark:border-emerald-800/50 shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      Aktif
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 shrink-0">
                      <XCircle className="w-3 h-3" />
                      Nonaktif
                    </span>
                  )}
                </div>

                {/* Financial Account Mapping */}
                <div className="mt-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                  <span className="text-slate-400 dark:text-slate-500 block mb-1 font-medium flex items-center gap-1">
                    <Building className="w-3 h-3" />
                    Mapping Jurnal Akun Keuangan:
                  </span>
                  {pm.financial_account_code ? (
                    <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span className="font-mono text-amber-600 dark:text-amber-400">
                        [{pm.financial_account_code}]
                      </span>
                      <span>{pm.financial_account_name}</span>
                    </div>
                  ) : (
                    <div className="text-amber-600 dark:text-amber-400 flex items-center gap-1 text-[11px] font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Belum dimapping ke COA Keuangan</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setEditingMethod(pm);
                    setIsModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleActive(pm)}
                  disabled={togglingId === pm.id}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    pm.is_active
                      ? 'border-emerald-200 dark:border-emerald-800 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                      : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title={pm.is_active ? 'Nonaktifkan Metode' : 'Aktifkan Metode'}
                >
                  {togglingId === pm.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                  ) : (
                    <Power className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
