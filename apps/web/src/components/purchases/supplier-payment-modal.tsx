'use client';

import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import type { PurchaseOrderItem } from '../../types/purchases';
import { formatCurrency } from '../../lib/formatters';
import { mapPurchaseOperationError } from '../../lib/purchase-operation-errors';
import {
  X,
  CreditCard,
  Building,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Wallet,
  Receipt,
} from 'lucide-react';

interface SupplierPaymentModalProps {
  isOpen: boolean;
  purchase: PurchaseOrderItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function SupplierPaymentModal({
  isOpen,
  purchase,
  onClose,
  onSuccess,
}: SupplierPaymentModalProps): React.JSX.Element | null {
  const { supabase } = usePos();

  const [amount, setAmount] = useState<string>('');
  const [accountCode, setAccountCode] = useState<string>('1100'); // '1100' Bank or '1000' Kas
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const remainingDebt = Math.max(0, (purchase?.total_amount || 0) - (purchase?.total_paid || 0));

  useEffect(() => {
    if (!isOpen || !purchase) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setAmount(String(remainingDebt));
    setReferenceNumber(`TRF-${Date.now().toString().slice(-6)}`);
    setNotes(`Pelunasan faktur ${purchase.purchase_number}`);
  }, [isOpen, purchase, remainingDebt]);

  const handlePayFull = () => {
    setAmount(String(remainingDebt));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchase) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const payNum = parseFloat(amount) || 0;
    if (payNum <= 0) {
      setErrorMsg('Nominal pembayaran harus lebih besar dari Rp 0.');
      return;
    }

    if (payNum > remainingDebt) {
      setErrorMsg(`Nominal pembayaran (Rp ${payNum.toLocaleString('id-ID')}) melebihi sisa hutang (Rp ${remainingDebt.toLocaleString('id-ID')}).`);
      return;
    }

    setLoading(true);
    try {
      // Find financial account id by account code (1000 or 1100)
      const { data: accData, error: accountError } = await supabase
        .from('financial_accounts')
        .select('id')
        .eq('account_code', accountCode)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!accData?.id) throw new Error('Akun pembayaran tidak ditemukan.');

      const { data, error } = await supabase.rpc('record_supplier_payment', {
        p_purchase_id: purchase.id,
        p_amount: payNum,
        p_payment_method_id: null,
        p_financial_account_id: accData.id,
        p_reference_number: referenceNumber.trim() || null,
        p_notes: notes.trim() || null,
        p_paid_by: null,
      });

      if (error) throw error;

      const res = data as {
        success?: boolean;
        payment_id?: unknown;
        purchase_id?: unknown;
        amount_paid?: unknown;
        remaining_debt?: unknown;
        payment_status?: unknown;
        journal_number?: unknown;
      } | null;
      if (
        res?.success !== true ||
        typeof res.payment_id !== 'string' ||
        !res.payment_id.trim() ||
        res.purchase_id !== purchase.id ||
        typeof res.amount_paid !== 'number' ||
        !Number.isFinite(res.amount_paid) ||
        res.amount_paid <= 0 ||
        typeof res.remaining_debt !== 'number' ||
        !Number.isFinite(res.remaining_debt) ||
        res.remaining_debt < 0 ||
        !['PARTIALLY_PAID', 'PAID'].includes(String(res.payment_status)) ||
        typeof res.journal_number !== 'string' ||
        !res.journal_number.trim()
      ) {
        throw new Error('Respons pembayaran supplier tidak valid.');
      }

      setSuccessMsg('Pembayaran hutang supplier berhasil dicatat dan jurnal akuntansi telah diterbitkan!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 900);
    } catch (err: any) {
      console.error('Error recording payment:', err);
      setErrorMsg(mapPurchaseOperationError(err, 'payment'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !purchase) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-3xl border border-slate-200 bg-white text-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Pelunasan Hutang Supplier</h2>
              <p className="text-xs text-slate-400">
                {purchase.purchase_number} • {purchase.supplier_name || 'Vendor'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
          {/* Notifications */}
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

          {/* Invoice Summary Card */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Total Nilai Faktur:</span>
              <span className="font-bold text-slate-900">{formatCurrency(purchase.total_amount)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Sudah Dibayar:</span>
              <span className="font-bold text-emerald-600">
                {formatCurrency(purchase.total_paid || 0)}
              </span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-sm">
              <span className="font-bold text-slate-800">Sisa Hutang Usaha (A/P):</span>
              <span className="font-black text-amber-600 font-mono text-base">
                {formatCurrency(remainingDebt)}
              </span>
            </div>
          </div>

          {/* Payment Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Nominal Pembayaran (Rp) <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={handlePayFull}
                className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200"
              >
                Bayar Lunas Penuh (100%)
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                Rp
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                max={remainingDebt}
                step="any"
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-4 py-2.5 text-base font-black font-mono text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                required
              />
            </div>
          </div>

          {/* Source Account (Kas Toko 1000 vs Bank Transfer 1100) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Sumber Rekening / Dana <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAccountCode('1100')}
                className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition ${
                  accountCode === '1100'
                    ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                  <Building className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Transfer Bank</p>
                  <p className="text-[10px] text-slate-500 font-mono">Akun 1100 (BCA/Mandiri)</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAccountCode('1000')}
                className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition ${
                  accountCode === '1000'
                    ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200 shrink-0">
                  <Wallet className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Kas Tunai Toko</p>
                  <p className="text-[10px] text-slate-500 font-mono">Akun 1000 (Cash on Hand)</p>
                </div>
              </button>
            </div>
          </div>

          {/* Reference Number & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                No. Bukti / Ref Transfer
              </label>
              <div className="relative">
                <Receipt className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="TRF-BCA-98765"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3.5 py-2 text-xs font-mono text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Catatan Pembayaran
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Pelunasan via transfer"
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Accounting Impact Info */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 mb-1">
              <FileText className="h-4 w-4 text-emerald-600" />
              <span>Jurnal Akuntansi Otomatis (Level 2 Double-Entry):</span>
            </div>
            <div className="space-y-0.5 text-[11px] font-mono text-slate-600 pl-5">
              <p>• [DEBIT]  Akun 2000 - Accounts Payable (Hutang Berkurang)</p>
              <p>• [KREDIT] Akun {accountCode} - {accountCode === '1100' ? 'Bank Account' : 'Cash on Hand'} (Aset Keluar)</p>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-xs disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mencatat Pembayaran...
                </>
              ) : (
                <span>Konfirmasi Pelunasan Hutang</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
