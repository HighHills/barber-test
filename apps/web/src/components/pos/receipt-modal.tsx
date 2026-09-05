'use client';

import React from 'react';
import type { CompletedSale } from '../../types/pos';
import { usePos } from '../../context/pos-context';
import { formatCurrency, formatDateTime } from '../../lib/formatters';
import { Printer, Check, X, Scissors } from 'lucide-react';

interface ReceiptModalProps {
  sale: CompletedSale;
  onNewTransaction: () => void;
  onClose: () => void;
}

export function ReceiptModal({
  sale,
  onNewTransaction,
  onClose,
}: ReceiptModalProps): React.JSX.Element {
  const { businessSettings, currentOutlet } = usePos();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto">
        {/* Top Notification */}
        <div className="bg-emerald-600 px-4 py-3 text-white flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-full bg-emerald-500/50">
              <Check className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold">Transaksi Berhasil Disimpan</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 80mm Thermal Receipt Layout */}
        <div
          id="printable-receipt"
          className="p-6 bg-white font-mono text-[11px] leading-tight text-slate-800 space-y-3 print:p-0 print:m-0"
        >
          {/* Header */}
          <div className="text-center space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-950 font-sans">
              {businessSettings.business_name || 'BARBERSHOP'}
            </h2>
            <p className="text-[10px] text-slate-500 font-sans">{currentOutlet?.name}</p>
            {currentOutlet?.address && (
              <p className="text-[9px] text-slate-400 font-sans max-w-[200px] mx-auto leading-none">
                {currentOutlet.address}
              </p>
            )}
            {currentOutlet?.phone && (
              <p className="text-[9px] text-slate-400 font-sans">Telp: {currentOutlet.phone}</p>
            )}
          </div>

          <div className="border-t border-dashed border-slate-300 my-2" />

          {/* Meta Information */}
          <div className="space-y-0.5 text-[10px] text-slate-600">
            <div className="flex justify-between">
              <span>No. Invoice:</span>
              <span className="font-bold text-slate-900">{sale.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span>Waktu:</span>
              <span>{formatDateTime(sale.sold_at)}</span>
            </div>
            <div className="flex justify-between">
              <span>Kasir:</span>
              <span>{sale.cashier_name}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-slate-300 my-2" />

          {/* Items Table */}
          <div className="space-y-2">
            {sale.items.map((item, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="flex justify-between font-medium text-slate-900">
                  <span className="truncate pr-2">{item.description}</span>
                  <span>{formatCurrency(item.total_amount)}</span>
                </div>
                <div className="flex justify-between text-[9px] text-slate-500">
                  <span>
                    {item.quantity} x {formatCurrency(item.unit_price)}
                  </span>
                  {item.barber_name && <span>(Barber: {item.barber_name})</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-slate-300 my-2" />

          {/* Totals Breakdown */}
          <div className="space-y-1 text-slate-700">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(sale.subtotal)}</span>
            </div>

            {sale.discount_amount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Diskon:</span>
                <span>-{formatCurrency(sale.discount_amount)}</span>
              </div>
            )}

            {sale.tax_amount > 0 && (
              <div className="flex justify-between">
                <span>PPN:</span>
                <span>{formatCurrency(sale.tax_amount)}</span>
              </div>
            )}

            <div className="flex justify-between text-xs font-bold text-slate-950 pt-1 border-t border-slate-200">
              <span>TOTAL:</span>
              <span>{formatCurrency(sale.total_amount)}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-slate-300 my-2" />

          {/* Payments & Change */}
          <div className="space-y-1 text-slate-700">
            {sale.payments.map((p, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{p.method_name}:</span>
                <span>{formatCurrency(p.amount)}</span>
              </div>
            ))}

            {(sale.tendered_amount ?? 0) > sale.total_amount && (
              <>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Diterima Tunai:</span>
                  <span>{formatCurrency(sale.tendered_amount || 0)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Kembalian:</span>
                  <span>{formatCurrency(sale.change_amount || 0)}</span>
                </div>
              </>
            )}
          </div>

          <div className="border-t border-dashed border-slate-300 my-2" />

          {/* Footer Note */}
          <div className="text-center pt-1 space-y-1 text-slate-500 text-[10px]">
            <p className="font-semibold text-slate-700">Terima kasih atas kunjungan Anda!</p>
            <p className="text-[9px]">Gaya Terbaik untuk Pria Berkelas</p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 no-print">
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Struk (80mm)</span>
          </button>

          <button
            onClick={onNewTransaction}
            className="flex-1 py-2.5 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Scissors className="w-4 h-4" />
            <span>Transaksi Baru</span>
          </button>
        </div>
      </div>
    </div>
  );
}
