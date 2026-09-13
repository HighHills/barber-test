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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

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

      await refreshData();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('Failed to save payment method:', err);
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan metode pembayaran.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {isEditing ? 'Ubah Metode Pembayaran' : 'Tambah Metode Pembayaran'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEditing
                  ? `Perbarui konfigurasi ${paymentMethod?.name}`
                  : 'Konfigurasi kanal pembayaran dan pemetaan akun buku kas/bank'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Tutup modal metode pembayaran"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 text-xs">
          {formError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Section 1: Identitas Kanal Pembayaran */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
              Identitas Kanal Pembayaran
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Code */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Kode Pembayaran <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="misal: CASH, QRIS_BCA"
                  disabled={isSubmitting}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2 text-xs text-amber-300 font-mono placeholder-slate-600 focus:outline-none transition min-h-[40px] disabled:opacity-50"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Tipe Pembayaran <span className="text-rose-400">*</span>
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none transition min-h-[40px] disabled:opacity-50"
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
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Nama Tampilan <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="misal: Tunai, BCA QRIS, Mandiri EDC"
                disabled={isSubmitting}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none transition min-h-[40px] disabled:opacity-50"
              />
            </div>
          </div>

          {/* Section 2: Integrasi Pembukuan & Status */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
              Integrasi Pembukuan & Status Operasional
            </span>

            {/* Financial Account (COA Mapping) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Akun Keuangan (COA Journal Mapping)
              </label>
              <select
                value={financialAccountId}
                onChange={(e) => setFinancialAccountId(e.target.value)}
                disabled={isSubmitting}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none transition min-h-[40px] disabled:opacity-50"
              >
                <option value="">-- Tanpa Pemetaan Akun Keuangan --</option>
                {financialAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    [{acc.account_code}] {acc.account_name} ({acc.account_type})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Digunakan sistem untuk posting otomatis jurnal kas/bank saat transaksi kasir POS selesai.
              </p>
            </div>

            {/* Active Status */}
            <div className="pt-1">
              <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700 transition select-none">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={isSubmitting}
                  className="w-4 h-4 mt-0.5 rounded text-amber-500 border-slate-700 focus:ring-amber-500/30 bg-slate-900"
                />
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">
                    Metode Pembayaran Aktif
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Tampilkan kanal pembayaran ini di kasir POS saat memilih metode pembayaran transaksi.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition min-h-[40px]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-xs shadow-amber-500/20 disabled:opacity-50 min-h-[40px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <span>{isEditing ? 'Perbarui Metode' : 'Simpan Metode'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
