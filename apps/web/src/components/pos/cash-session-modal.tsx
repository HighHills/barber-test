'use client';

import React, { useState } from 'react';
import { usePos } from '../../context/pos-context';
import { formatCurrency } from '../../lib/formatters';
import {
  Lock,
  Unlock,
  X,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface CashSessionModalProps {
  mode: 'OPEN' | 'CLOSE';
  onClose: () => void;
}

export function CashSessionModal({
  mode,
  onClose,
}: CashSessionModalProps): React.JSX.Element {
  const { currentOutlet, cashRegister, activeSession, openSession, closeSession } = usePos();

  const [amount, setAmount] = useState<number>(mode === 'OPEN' ? 100000 : 0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isOpenMode = mode === 'OPEN';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount < 0) {
      setErrorMessage('Nominal kas tidak boleh negatif');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (isOpenMode) {
        const res = await openSession(amount);
        if (!res.success) throw new Error(res.error || 'Gagal membuka sesi');
      } else {
        const res = await closeSession(amount);
        if (!res.success) throw new Error(res.error || 'Gagal menutup sesi');
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan pada sesi kasir';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl border ${
                isOpenMode
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }`}
            >
              {isOpenMode ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">
                {isOpenMode ? 'Buka Laci Kasir' : 'Tutup Laci Kasir (End of Shift)'}
              </h3>
              <p className="text-xs text-slate-400">
                {currentOutlet ? currentOutlet.name : 'Cabang belum dipilih'} • Register:{' '}
                {cashRegister ? cashRegister.name : 'Belum terdaftar'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isOpenMode ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Masukkan saldo modal awal kas fisik (opening float balance) yang tersedia di dalam laci
                uang untuk uang kembalian pelanggan.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Modal Awal Kas (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-lg font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex gap-2 pt-1">
                {[50000, 100000, 150000, 200000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(preset)}
                    className="flex-1 py-1.5 text-xs font-mono font-medium border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    {formatCurrency(preset)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="flex justify-between text-slate-500">
                  <span>Modal Awal Sesi:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {formatCurrency(activeSession?.opening_balance || 0)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Waktu Dibuka:</span>
                  <span>{new Date(activeSession?.opened_at || '').toLocaleTimeString('id-ID')}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Total Hitungan Uang Fisik di Laci (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  required
                  placeholder="0"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-lg font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2.5 text-xs font-bold rounded-xl shadow-md text-white transition-all flex items-center gap-2 ${
                isOpenMode
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isOpenMode ? 'Buka Sesi Sekarang' : 'Tutup Sesi Kasir'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
