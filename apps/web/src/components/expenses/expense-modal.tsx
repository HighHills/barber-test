'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePos } from '../../context/pos-context';
import type { ExpenseCategory } from '../../types/expenses';
import { formatCurrency } from '../../lib/formatters';
import {
  X,
  Receipt,
  Building2,
  Wallet,
  Building,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileText,
  Zap,
  Scissors,
  Wrench,
  Coffee,
  Megaphone,
  MoreHorizontal,
} from 'lucide-react';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ExpenseModal({
  isOpen,
  onClose,
  onSuccess,
}: ExpenseModalProps): React.JSX.Element | null {
  const { supabase, availableOutlets, currentOutlet, profile } = usePos();

  // Master States
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<Array<{ id: string; account_code: string; account_name: string }>>([]);

  // Form States
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [paymentSource, setPaymentSource] = useState<'1000' | '1100'>('1000'); // 1000 Kas on hand, 1100 Bank
  const [amount, setAmount] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>('');
  const [recipient, setRecipient] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // UI Status
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load Categories and Financial Accounts
  const loadMasterData = useCallback(async () => {
    try {
      // 1. Categories
      const { data: catData } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (catData && catData.length > 0) {
        setCategories(catData as ExpenseCategory[]);
        if (!selectedCategoryId) {
          setSelectedCategoryId(catData[0].id);
        }
      }

      // 2. Payment Accounts (1000 Cash and 1100 Bank)
      const { data: accData } = await supabase
        .from('financial_accounts')
        .select('id, account_code, account_name')
        .in('account_code', ['1000', '1100'])
        .eq('is_active', true);
      if (accData) {
        setPaymentAccounts(accData);
      }
    } catch (err) {
      console.warn('Load expense master data error:', err);
    }
  }, [supabase, selectedCategoryId]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setSelectedOutletId(currentOutlet?.id || (availableOutlets[0]?.id || ''));
    setAmount('');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setRecipient('');
    setReferenceNumber(`KWT-${Date.now().toString().slice(-6)}`);
    setNotes('');
    setPaymentSource('1000');
    loadMasterData();
  }, [isOpen, currentOutlet, availableOutlets, loadMasterData]);

  // Selected Category Info
  const selectedCategory = useMemo(() => {
    return categories.find((c) => c.id === selectedCategoryId);
  }, [categories, selectedCategoryId]);

  // Selected Payment Account ID
  const selectedPaymentAccountId = useMemo(() => {
    const acc = paymentAccounts.find((a) => a.account_code === paymentSource);
    return acc ? acc.id : paymentAccounts[0]?.id || '';
  }, [paymentAccounts, paymentSource]);

  // Quick Amount Selector
  const handleQuickAmount = (val: number) => {
    setAmount(String(val));
  };

  // Get icon component for category
  const renderCategoryIcon = (iconName?: string | null) => {
    switch (iconName) {
      case 'Zap':
        return <Zap className="w-4 h-4 text-amber-500" />;
      case 'Building2':
        return <Building2 className="w-4 h-4 text-blue-500" />;
      case 'Scissors':
        return <Scissors className="w-4 h-4 text-emerald-500" />;
      case 'Wrench':
        return <Wrench className="w-4 h-4 text-orange-500" />;
      case 'Coffee':
        return <Coffee className="w-4 h-4 text-yellow-600" />;
      case 'Megaphone':
        return <Megaphone className="w-4 h-4 text-purple-500" />;
      default:
        return <MoreHorizontal className="w-4 h-4 text-slate-500" />;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedOutletId) {
      setErrorMsg('Harap pilih cabang outlet.');
      return;
    }

    if (!selectedCategoryId) {
      setErrorMsg('Harap pilih kategori pengeluaran.');
      return;
    }

    const numAmount = parseFloat(amount) || 0;
    if (numAmount <= 0) {
      setErrorMsg('Nominal pengeluaran harus lebih besar dari Rp 0.');
      return;
    }

    if (!selectedPaymentAccountId) {
      setErrorMsg('Akun pembayaran kas/bank belum terkonfigurasi.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('record_expense', {
        p_outlet_id: selectedOutletId,
        p_category_id: selectedCategoryId,
        p_payment_account_id: selectedPaymentAccountId,
        p_amount: numAmount,
        p_expense_date: expenseDate || new Date().toISOString().split('T')[0],
        p_recipient: recipient.trim() || null,
        p_notes: notes.trim() || null,
        p_reference_number: referenceNumber.trim() || null,
        p_created_by: profile?.id || null,
      });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = data as any;
      if (res && res.success === false) {
        throw new Error(res.message || 'Gagal mencatat pengeluaran');
      }

      setSuccessMsg(
        `Biaya ${selectedCategory?.name || 'Operasional'} sebesar ${formatCurrency(numAmount)} berhasil dicatat & jurnal akuntansi telah diposting!`
      );

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 900);
    } catch (err: any) {
      console.error('Error recording expense:', err);
      const msg = err?.message || err?.details || (err instanceof Error ? err.message : 'Gagal mencatat pengeluaran');
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative flex max-h-[94vh] w-full max-w-xl flex-col rounded-3xl border border-slate-200 bg-white text-slate-800 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">Catat Biaya Operasional Baru</h2>
              <p className="text-xs text-slate-400">Pengeluaran kas harian & jurnal akuntansi otomatis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto p-6 space-y-4">
          {/* Alerts */}
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-600" />
              <div className="flex-1">
                <p className="font-bold text-red-900">Gagal Memproses</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-600" />
              <p className="font-bold">{successMsg}</p>
            </div>
          )}

          {/* Row 1: Outlet Cabang & Tanggal */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Cabang Outlet <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedOutletId}
                onChange={(e) => setSelectedOutletId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:bg-white focus:outline-none"
                required
              >
                {availableOutlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tanggal Pengeluaran <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:bg-white focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Row 2: Kategori Biaya */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Kategori Biaya Operasional <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((cat) => {
                const isSelected = cat.id === selectedCategoryId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs transition ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/80 text-amber-950 font-bold shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-slate-100 flex-shrink-0">
                      {renderCategoryIcon(cat.icon)}
                    </div>
                    <span className="truncate">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Nominal Pengeluaran & Quick Buttons */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nominal Pengeluaran (Rp) <span className="text-red-500">*</span>
            </label>
            <div className="relative mb-2">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400 font-mono">
                Rp
              </span>
              <input
                type="number"
                min="1"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-11 pr-4 py-2.5 text-base font-black font-mono text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                required
              />
            </div>
            {/* Quick buttons */}
            <div className="flex flex-wrap gap-1.5">
              {[25000, 50000, 100000, 250000, 500000, 1000000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAmount(val)}
                  className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-mono font-semibold text-slate-600 transition"
                >
                  +{formatCurrency(val).replace('Rp ', '')}
                </button>
              ))}
            </div>
          </div>

          {/* Row 4: Sumber Pembayaran (Kas Toko 1000 vs Bank 1100) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Sumber Dana Pembayaran <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentSource('1000')}
                className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition ${
                  paymentSource === '1000'
                    ? 'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-slate-50 hover:bg-white text-slate-700'
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold">Kas Toko (Petty Cash)</p>
                  <p className="text-[10px] text-slate-500 font-mono">Akun 1000 (Kas Fisik Laci)</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentSource('1100')}
                className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition ${
                  paymentSource === '1100'
                    ? 'border-blue-500 bg-blue-50/80 text-blue-950 font-bold ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-slate-50 hover:bg-white text-slate-700'
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Building className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold">Transfer Bank</p>
                  <p className="text-[10px] text-slate-500 font-mono">Akun 1100 (BCA / Mandiri)</p>
                </div>
              </button>
            </div>
          </div>

          {/* Row 5: Penerima & No. Bukti */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Dibayarkan Kepada / Penerima
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Contoh: PLN, PDAM, Toko Barokah, Tukang AC"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                No. Bukti / Struk / Kuitansi
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="No. Nota Fisik"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono font-semibold text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Row 6: Catatan / Keterangan */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Catatan Pengeluaran
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Keterangan rincian barang/jasa yang dibeli..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Live Double-Entry Preview Banner */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs">
            <p className="font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-amber-600" />
              <span>Jurnal Akuntansi Otomatis (Level 2 Double-Entry):</span>
            </p>
            <div className="space-y-1 font-mono text-[11px] text-slate-600">
              <div className="flex justify-between">
                <span>• [DEBIT] {selectedCategory?.name || 'Beban Operasional'}:</span>
                <span className="font-bold text-slate-900">
                  {formatCurrency(parseFloat(amount) || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>
                  • [KREDIT] {paymentSource === '1000' ? 'Cash on Hand (Kas Toko)' : 'Bank Account (Rekening Bank)'}:
                </span>
                <span className="font-bold text-slate-900">
                  {formatCurrency(parseFloat(amount) || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4" />
                  <span>Simpan Biaya & Terbitkan Jurnal</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
