'use client';

import React, { useState, useMemo } from 'react';
import type { CashSessionDetailedReconciliation } from '../../types/pos';
import { formatCurrency } from '../../lib/formatters';
import { mapAccountingOperationError } from '../../lib/accounting-operation-errors';
import {
  X,
  Lock,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface CloseSessionReconcileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  reconciliation: CashSessionDetailedReconciliation;
  onExecuteClose: (actualClosingBalance: number, notes?: string) => Promise<{ success: boolean; error?: string }>;
}

export function CloseSessionReconcileModal({
  isOpen,
  onClose,
  onSuccess,
  reconciliation,
  onExecuteClose,
}: CloseSessionReconcileModalProps): React.JSX.Element | null {
  // Counting method: 'QUICK' (direct total amount) or 'DENOMINATION' (lembaran uang)
  const [countMethod, setCountMethod] = useState<'QUICK' | 'DENOMINATION'>('QUICK');
  const [directAmount, setDirectAmount] = useState<number>(reconciliation.expected_cash_balance);

  // Denominations state
  const [denom100k, setDenom100k] = useState<number>(0);
  const [denom50k, setDenom50k] = useState<number>(0);
  const [denom20k, setDenom20k] = useState<number>(0);
  const [denom10k, setDenom10k] = useState<number>(0);
  const [denom5k, setDenom5k] = useState<number>(0);
  const [denom2k, setDenom2k] = useState<number>(0);
  const [denomCoins, setDenomCoins] = useState<number>(0);

  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Calculated physical cash
  const actualCountedCash = useMemo(() => {
    if (countMethod === 'QUICK') {
      return Number(directAmount) || 0;
    }
    return (
      denom100k * 100000 +
      denom50k * 50000 +
      denom20k * 20000 +
      denom10k * 10000 +
      denom5k * 5000 +
      denom2k * 2000 +
      Number(denomCoins || 0)
    );
  }, [countMethod, directAmount, denom100k, denom50k, denom20k, denom10k, denom5k, denom2k, denomCoins]);

  // Discrepancy
  const discrepancy = useMemo(() => {
    return actualCountedCash - reconciliation.expected_cash_balance;
  }, [actualCountedCash, reconciliation.expected_cash_balance]);

  const isExact = Math.abs(discrepancy) < 0.01;
  const isOverage = discrepancy > 0;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actualCountedCash < 0) {
      setErrorMessage('Uang kas fisik di laci tidak boleh negatif.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await onExecuteClose(actualCountedCash, notes);
      if (!res.success) {
        throw new Error(res.error || 'Gagal menutup sesi kasir.');
      }

      onSuccess(
        `Sesi kasir ${reconciliation.register_name} berhasil ditutup resmi dengan saldo akhir fisik ${formatCurrency(actualCountedCash)}.`
      );
      onClose();
    } catch (err: unknown) {
      setErrorMessage(mapAccountingOperationError(err, 'close-session'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col my-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 rounded-xl border border-amber-500/30 text-amber-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">
                Rekonsiliasi Tutup Shift Kasir (End of Day)
              </h2>
              <p className="text-xs text-slate-400">
                Register: {reconciliation.register_name} • Kasir: {reconciliation.cashier_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* System Expected Cash Summary Box */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Perhitungan Arus Kas Sistem (Expected Cash)
            </div>
            <div className="grid grid-cols-3 gap-3 pt-1 border-t border-slate-200/60 text-slate-700">
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold">Modal Awal:</span>
                <span className="font-mono font-bold text-slate-900 text-xs">
                  {formatCurrency(reconciliation.opening_balance)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-600 block font-semibold">Penjualan Tunai:</span>
                <span className="font-mono font-bold text-emerald-700 text-xs">
                  +{formatCurrency(reconciliation.cash_sales)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-rose-600 block font-semibold">Pengeluaran Kas:</span>
                <span className="font-mono font-bold text-rose-700 text-xs">
                  -{formatCurrency(reconciliation.cash_refunds + reconciliation.cash_payouts)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-900">Total Kas Seharusnya di Laci:</span>
              <span className="font-mono font-black text-sm text-blue-900">
                {formatCurrency(reconciliation.expected_cash_balance)}
              </span>
            </div>
          </div>

          {/* Counting Method Toggle */}
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <label className="font-bold text-slate-900">Metode Penghitungan Kas Fisik:</label>
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setCountMethod('QUICK')}
                className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                  countMethod === 'QUICK'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Input Total Langsung
              </button>
              <button
                type="button"
                onClick={() => setCountMethod('DENOMINATION')}
                className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                  countMethod === 'DENOMINATION'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Hitung Pecahan Lembaran
              </button>
            </div>
          </div>

          {/* Method A: Quick Total Input */}
          {countMethod === 'QUICK' ? (
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">Total Uang Fisik Hasil Hitungan Laci (Rp):</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono">
                  Rp
                </span>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={directAmount}
                  onChange={(e) => setDirectAmount(Number(e.target.value) || 0)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-base font-black font-mono text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          ) : (
            /* Method B: Denomination Grid */
            <div className="space-y-3">
              <div className="text-[11px] text-slate-500">
                Masukkan jumlah lembaran masing-masing pecahan uang fisik di laci kasir:
              </div>
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Rp 100.000 (lembar):</label>
                  <input
                    type="number"
                    min="0"
                    value={denom100k || ''}
                    onChange={(e) => setDenom100k(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Rp 50.000 (lembar):</label>
                  <input
                    type="number"
                    min="0"
                    value={denom50k || ''}
                    onChange={(e) => setDenom50k(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Rp 20.000 (lembar):</label>
                  <input
                    type="number"
                    min="0"
                    value={denom20k || ''}
                    onChange={(e) => setDenom20k(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Rp 10.000 (lembar):</label>
                  <input
                    type="number"
                    min="0"
                    value={denom10k || ''}
                    onChange={(e) => setDenom10k(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Rp 5.000 (lembar):</label>
                  <input
                    type="number"
                    min="0"
                    value={denom5k || ''}
                    onChange={(e) => setDenom5k(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Rp 2.000 (lembar):</label>
                  <input
                    type="number"
                    min="0"
                    value={denom2k || ''}
                    onChange={(e) => setDenom2k(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    placeholder="0"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600">Total Koin / Uang Pas (Rp):</label>
                  <input
                    type="number"
                    min="0"
                    value={denomCoins || ''}
                    onChange={(e) => setDenomCoins(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Discrepancy Evaluation Card */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              isExact
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : isOverage
                ? 'bg-blue-50 border-blue-300 text-blue-950'
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                {isExact ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <span>
                  {isExact
                    ? 'Hasil Rekonsiliasi: Kas Cocok & Seimbang'
                    : isOverage
                    ? 'Hasil Rekonsiliasi: Kelebihan Kas (Cash Overage)'
                    : 'Hasil Rekonsiliasi: Kekurangan Kas (Cash Shortage)'}
                </span>
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                Kas Fisik Dihitung: <span className="font-bold font-mono">{formatCurrency(actualCountedCash)}</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Selisih Kas</div>
              <div
                className={`text-base font-black font-mono ${
                  isExact ? 'text-emerald-700' : isOverage ? 'text-blue-700' : 'text-rose-700'
                }`}
              >
                {isExact ? 'Rp 0' : (isOverage ? '+' : '') + formatCurrency(discrepancy)}
              </div>
            </div>
          </div>

          {/* Notes for discrepancy */}
          <div className="space-y-1">
            <label className="font-bold text-slate-700">Catatan Tutup Shift / Alasan Selisih (Opsional):</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Kas fisik cocok sempurna. EDC settlement telah dicetak."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black transition-colors flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menutup Shift...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Konfirmasi Tutup Shift Kasir</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
