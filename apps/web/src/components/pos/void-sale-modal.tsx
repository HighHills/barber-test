'use client';

import React, { useState } from 'react';
import { usePos } from '../../context/pos-context';
import { formatCurrency, formatDateTime } from '../../lib/formatters';
import type { VoidSaleResult } from '../../types/pos';
import { mapPosOperationError } from '../../lib/pos-operation-errors';
import { AlertTriangle, X, Loader2, Ban } from 'lucide-react';

interface VoidSaleModalProps {
  isOpen: boolean;
  sale: {
    id: string;
    invoice_number: string;
    sold_at: string;
    total_amount: number;
    cashier_name?: string;
  } | null;
  onClose: () => void;
  onSuccess: (result: VoidSaleResult) => void;
}

const QUICK_REASONS = [
  'Salah input kasir',
  'Pelanggan membatalkan pesanan',
  'Duplikasi transaksi',
  'Kesalahan metode pembayaran',
];

export function VoidSaleModal({
  isOpen,
  sale,
  onClose,
  onSuccess,
}: VoidSaleModalProps): React.JSX.Element | null {
  const { supabase, profile } = usePos();

  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !sale) return null;

  const handleQuickReason = (text: string) => {
    setReason(text);
    setErrorMsg(null);
  };

  const handleConfirmVoid = async () => {
    if (!reason.trim()) {
      setErrorMsg('Alasan pembatalan (void) wajib diisi.');
      return;
    }

    if (!profile?.id) {
      setErrorMsg('Profil pengguna aktif tidak ditemukan.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.rpc('void_sale', {
        p_sale_id: sale.id,
        p_voided_by: profile.id,
        p_reason: reason.trim(),
      });

      if (error) {
        throw error;
      }

      const result = data as VoidSaleResult;
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      console.error('Void sale error:', err);
      setErrorMsg(mapPosOperationError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Void / Batalkan Transaksi
              </h2>
              <p className="text-xs text-red-700 font-medium">
                Pembatalan Permanen Nota Penjualan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-white/60 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Warning Banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex gap-3 text-xs text-amber-900 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block mb-0.5">
                Konsekuensi Pembatalan Nota:
              </strong>
              Pembalikan stok barang produk & bahan jasa, pembatalan komisi kapster,
              dan penerbitan <strong>Jurnal Pembalik (Reversal Journal)</strong> akuntansi secara otomatis di Supabase.
            </div>
          </div>

          {/* Sale Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">No. Invoice:</span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {sale.invoice_number}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Waktu Transaksi:</span>
              <span className="text-slate-700 font-medium">
                {formatDateTime(sale.sold_at)}
              </span>
            </div>
            {sale.cashier_name && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Kasir Pembuat:</span>
                <span className="text-slate-700 font-medium">
                  {sale.cashier_name}
                </span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-2 flex justify-between items-center font-bold">
              <span className="text-slate-700">Total Nilai Transaksi:</span>
              <span className="text-base text-red-600 font-mono">
                {formatCurrency(sale.total_amount)}
              </span>
            </div>
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Alasan Pembatalan / Void <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="Jelaskan alasan pembatalan nota ini (wajib untuk audit trail)..."
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 placeholder:text-slate-400 disabled:opacity-50"
            />

            {/* Quick Reason Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK_REASONS.map((qr) => (
                <button
                  key={qr}
                  type="button"
                  onClick={() => handleQuickReason(qr)}
                  disabled={isSubmitting}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                    reason === qr
                      ? 'bg-red-100 border-red-300 text-red-800'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  }`}
                >
                  {qr}
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirmVoid}
            disabled={isSubmitting || !reason.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-xl shadow-xs transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memproses Void...</span>
              </>
            ) : (
              <>
                <Ban className="w-4 h-4" />
                <span>Konfirmasi Void Nota</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
