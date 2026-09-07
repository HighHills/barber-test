'use client';

import React, { useState } from 'react';
import { usePos } from '../../context/pos-context';
import type { BarberCommissionSummary, CommissionItemView } from '../../types/pos';
import { formatCurrency } from '../../lib/formatters';
import {
  X,
  Building2,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Receipt,
  ShieldCheck,
} from 'lucide-react';

interface CommissionPayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  barberSummary: BarberCommissionSummary | null;
  pendingCommissions: CommissionItemView[];
}

export function CommissionPayoutModal({
  isOpen,
  onClose,
  onSuccess,
  barberSummary,
  pendingCommissions,
}: CommissionPayoutModalProps): React.JSX.Element | null {
  const { supabase, currentOutlet, profile } = usePos();

  const [paymentSource, setPaymentSource] = useState<'CASH' | 'BANK'>('BANK');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !barberSummary) return null;

  const totalPayout = pendingCommissions.reduce(
    (acc, item) => acc + Number(item.commission_amount || 0),
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOutlet) {
      setErrorMessage('Pilih cabang outlet terlebih dahulu.');
      return;
    }
    if (!profile) {
      setErrorMessage('Akun kasir/manajer Anda belum memiliki profil aktif.');
      return;
    }
    if (pendingCommissions.length === 0 || totalPayout <= 0) {
      setErrorMessage('Tidak ada komisi yang perlu dibayarkan.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      // 1. Fetch COA Accounts: 2100 (Commission Payable) and 1000 (Cash) or 1100 (Bank)
      const { data: accounts, error: accErr } = await supabase
        .from('financial_accounts')
        .select('id, account_code, account_name')
        .in('account_code', ['2100', '1000', '1100']);

      if (accErr || !accounts || accounts.length === 0) {
        throw new Error('Gagal mengambil data akun keuangan COA untuk pembayaran komisi.');
      }

      const commPayableAcc = accounts.find((a) => a.account_code === '2100');
      const cashAcc = accounts.find((a) => a.account_code === '1000');
      const bankAcc = accounts.find((a) => a.account_code === '1100');

      if (!commPayableAcc) {
        throw new Error('Akun liabilitas komisi (2100 Commission Payable) tidak ditemukan di COA.');
      }

      const payoutAcc = paymentSource === 'CASH' ? cashAcc : bankAcc;
      if (!payoutAcc) {
        throw new Error(`Akun kas/bank (${paymentSource === 'CASH' ? '1000' : '1100'}) tidak ditemukan.`);
      }

      // 2. Generate Journal Entry in DRAFT status
      const todayStr = new Date().toISOString().split('T')[0];
      const journalNumber = `JRN-COMM-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

      const { data: journal, error: jrnErr } = await supabase
        .from('journal_entries')
        .insert({
          journal_number: journalNumber,
          journal_date: todayStr,
          reference_type: 'PAYROLL',
          reference_id: barberSummary.employee_id,
          description: `Pembayaran komisi kapster ${barberSummary.employee_name} (${pendingCommissions.length} layanan/produk). Ref: ${referenceNumber || 'TUNAI'}`,
          status: 'DRAFT',
          created_by: profile.id,
        })
        .select('id, journal_number')
        .single();

      if (jrnErr || !journal) {
        throw new Error(`Gagal membuat entri jurnal akuntansi: ${jrnErr?.message}`);
      }

      // 3. Insert Journal Lines (Level 2 Double-Entry: Debit 2100, Credit 1000/1100)
      const journalLines = [
        {
          journal_entry_id: journal.id,
          financial_account_id: commPayableAcc.id,
          outlet_id: currentOutlet.id,
          debit: totalPayout,
          credit: 0.0,
          description: `Pelunasan hutang komisi kapster: ${barberSummary.employee_name}`,
        },
        {
          journal_entry_id: journal.id,
          financial_account_id: payoutAcc.id,
          outlet_id: currentOutlet.id,
          debit: 0.0,
          credit: totalPayout,
          description: `Pengeluaran ${payoutAcc.account_name} untuk pembayaran komisi`,
        },
      ];

      const { error: linesErr } = await supabase.from('journal_lines').insert(journalLines);
      if (linesErr) {
        throw new Error(`Gagal menyimpan baris jurnal debit/kredit: ${linesErr.message}`);
      }

      // 4. Post Journal Entry via Central Gate RPC (post_journal_entry)
      const { error: postErr } = await supabase.rpc('post_journal_entry', {
        p_journal_entry_id: journal.id,
        p_posted_by: profile.id,
      });

      if (postErr) {
        throw new Error(`Gagal memposting jurnal ke buku besar: ${postErr.message}`);
      }

      // 5. Mark commissions as PAID
      const commissionIds = pendingCommissions.map((c) => c.id);
      const { error: commUpdateErr } = await supabase
        .from('commissions')
        .update({
          status: 'PAID',
          paid_at: new Date().toISOString(),
        })
        .in('id', commissionIds);

      if (commUpdateErr) {
        console.warn('Warning updating commission statuses:', commUpdateErr);
      }

      onSuccess(
        `Pembayaran komisi sebesar ${formatCurrency(totalPayout)} untuk ${barberSummary.employee_name} berhasil dicairkan. Jurnal Akuntansi ${journal.journal_number} telah terposting.`
      );
      onClose();
    } catch (err: unknown) {
      console.error('Commission payout error:', err);
      setErrorMessage(
        err instanceof Error ? err.message : 'Terjadi kegagalan memproses pembayaran komisi.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-xs">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Settlement Payout Komisi</h2>
              <p className="text-xs text-emerald-100 font-medium">
                Pencairan komisi & pembukuan jurnal akuntansi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Barber & Amount Card */}
          <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex items-center justify-between">
            <div>
              <div className="text-xs text-emerald-800 font-medium">Penerima Komisi</div>
              <div className="text-base font-bold text-slate-900 leading-tight">
                {barberSummary.employee_name}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {barberSummary.position || 'Kapster'} • {pendingCommissions.length} Transaksi Layanan
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-emerald-800 font-semibold uppercase">Total Dicairkan</div>
              <div className="text-xl font-black text-emerald-700 font-mono">
                {formatCurrency(totalPayout)}
              </div>
            </div>
          </div>

          {/* Payment Source Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Pilih Sumber Dana Pembayaran
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentSource('BANK')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  paymentSource === 'BANK'
                    ? 'border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs mb-1">
                  <Building2 className="w-4 h-4" />
                  <span>Transfer Bank (1100)</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Rekening Bank Operasional / QRIS
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPaymentSource('CASH')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  paymentSource === 'CASH'
                    ? 'border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs mb-1">
                  <Wallet className="w-4 h-4" />
                  <span>Kas Tunai Kasir (1000)</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Uang Fisik dari Laci Kasir Aktif
                </p>
              </button>
            </div>
          </div>

          {/* Reference & Notes */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                No. Bukti Transfer / Referensi (Opsional)
              </label>
              <input
                type="text"
                placeholder="Contoh: TRF-BCA-983142 atau TUNAI"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Catatan Tambahan
              </label>
              <input
                type="text"
                placeholder="Contoh: Pembayaran komisi shift pagi minggu 1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          </div>

          {/* Accounting Impact Notice */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Otomasi Jurnal Akuntansi Level 2:</span>
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] pl-5">
              <span>Debit: 2100 Commission Payable</span>
              <span>{formatCurrency(totalPayout)}</span>
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] pl-5">
              <span>Kredit: {paymentSource === 'CASH' ? '1000 Cash on Hand' : '1100 Bank Account'}</span>
              <span>{formatCurrency(totalPayout)}</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Memposting Jurnal...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Konfirmasi Payout Komisi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
