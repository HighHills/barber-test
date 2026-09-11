'use client';

import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import type { PaymentMethodItem, FinancialAccountItem } from '../../types/settings';
import {
  X,
  CreditCard,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface PaymentMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentMethod: PaymentMethodItem | null;
  financialAccounts: FinancialAccountItem[];
  onSuccess: () => void;
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

const PAYMENT_TYPES = [
  { value: 'CASH', label: 'Tunai (Cash)' },
  { value: 'QRIS', label: 'QRIS' },
  { value: 'BANK_TRANSFER', label: 'Transfer Bank' },
  { value: 'EDC', label: 'Mesin EDC' },
  { value: 'E_WALLET', label: 'Dompet Digital (E-Wallet)' },
  { value: 'DEBIT', label: 'Kartu Debit' },
  { value: 'CREDIT_CARD', label: 'Kartu Kredit' },
  { value: 'OTHER', label: 'Lainnya' },
];

export function PaymentMethodModal({
  isOpen,
  onClose,
  paymentMethod,
  financialAccounts,
  onSuccess,
  onNotification,
}: PaymentMethodModalProps): React.JSX.Element | null {
  const { supabase, refreshData } = usePos();
  const isEditing = Boolean(paymentMethod);

  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<string>('CASH');
  const [financialAccountId, setFinancialAccountId] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (paymentMethod) {
      setCode(paymentMethod.code || '');
      setName(paymentMethod.name || '');
      setType(paymentMethod.type || 'CASH');
      setFinancialAccountId(paymentMethod.financial_account_id || '');
      setIsActive(paymentMethod.is_active);
    } else {
      setCode('');
      setName('');
      setType('CASH');
      setFinancialAccountId('');
      setIsActive(true);
    }
    setFormError(null);
  }, [paymentMethod, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();

    if (!trimmedCode) {
      setFormError('Kode metode pembayaran wajib diisi.');
      return;
    }

    if (!trimmedName) {
      setFormError('Nama metode pembayaran wajib diisi.');
      return;
    }

    if (!type) {
      setFormError('Tipe metode pembayaran wajib dipilih.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('save_payment_method', {
        p_payment_method_id: paymentMethod ? paymentMethod.id : null,
        p_code: trimmedCode,
        p_name: trimmedName,
        p_type: type,
        p_financial_account_id: financialAccountId ? financialAccountId : null,
        p_is_active: isActive,
      });

      if (error) throw error;
      if (data && typeof data === 'object' && 'success' in data && !(data as any).success) {
        throw new Error((data as any).message || 'Gagal menyimpan metode pembayaran');
      }

      onNotification?.({
        type: 'SUCCESS',
        message: `Metode pembayaran "${trimmedName}" berhasil ${isEditing ? 'diperbarui' : 'ditambahkan'}`,
      });

      refreshData();
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save payment method:', err);
      setFormError(err.message || 'Terjadi kesalahan saat menyimpan metode pembayaran.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {isEditing ? 'Edit Metode Pembayaran' : 'Tambah Metode Pembayaran'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Konfigurasi kanal pembayaran dan mapping akun buku kas/bank.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
                {formError}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Code */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Kode Pembayaran <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="misal: CASH, QRIS_BCA"
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 disabled:opacity-50"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Tipe Pembayaran <span className="text-rose-500">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 disabled:opacity-50"
              >
                {PAYMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nama Tampilan <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="misal: Tunai, BCA QRIS, Mandiri EDC"
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 disabled:opacity-50"
            />
          </div>

          {/* Financial Account (COA Mapping) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Akun Keuangan (COA Journal Mapping)
            </label>
            <div className="relative">
              <select
                value={financialAccountId}
                onChange={(e) => setFinancialAccountId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 disabled:opacity-50"
              >
                <option value="">-- Tanpa Mapping Akun Keuangan --</option>
                {financialAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    [{acc.account_code}] {acc.account_name} ({acc.account_type})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Digunakan sistem untuk posting jurnal kas/bank saat transaksi penjualan selesai.
            </p>
          </div>

          {/* Active Status */}
          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 rounded text-amber-500 border-slate-300 dark:border-slate-700 focus:ring-amber-500 focus:ring-offset-0 bg-slate-50 dark:bg-slate-800"
              />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Aktif (Tampilkan metode pembayaran ini di kasir POS)
              </span>
            </label>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                'Simpan Metode'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
