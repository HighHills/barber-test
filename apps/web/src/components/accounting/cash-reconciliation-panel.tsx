'use client';

import React from 'react';
import type { CashSessionDetailedReconciliation } from '../../types/pos';
import { formatCurrency, formatDateTime } from '../../lib/formatters';
import {
  Lock,
  Unlock,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Layers,
} from 'lucide-react';

interface CashReconciliationPanelProps {
  activeReconciliation: CashSessionDetailedReconciliation | null;
  historySessions: CashSessionDetailedReconciliation[];
  onOpenCloseModal: () => void;
  onOpenStartModal: () => void;
  canManageCashSession: boolean;
}

export function CashReconciliationPanel({
  activeReconciliation,
  historySessions,
  onOpenCloseModal,
  onOpenStartModal,
  canManageCashSession,
}: CashReconciliationPanelProps): React.JSX.Element {
  return (
    <div className="space-y-6">
      {/* 1. Active Cash Session Live Reconciliation Card */}
      {activeReconciliation ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Active Header */}
          <div className="p-5 bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 text-white flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white backdrop-blur-xs">
                <Unlock className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold leading-tight">
                    Sesi Kasir Aktif (Sedang Berjalan)
                  </h3>
                  <span className="text-[10px] font-black bg-emerald-400/20 border border-emerald-300/30 text-emerald-100 px-2 py-0.5 rounded-full">
                    OPEN
                  </span>
                </div>
                <p className="text-xs text-emerald-100 mt-0.5">
                  Register: <span className="font-semibold">{activeReconciliation.register_name}</span> • Kasir: <span className="font-semibold">{activeReconciliation.cashier_name}</span> • Dibuka:{' '}
                  {formatDateTime(activeReconciliation.opened_at)}
                </p>
              </div>
            </div>

            {canManageCashSession && (
              <button
                onClick={onOpenCloseModal}
                className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Tutup Shift & Rekonsiliasi Kasir</span>
              </button>
            )}
          </div>

          {/* Cash Flow Breakdown Grid */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-6 border-b border-slate-100">
              {/* Modal Awal */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  1. Modal Awal Laci
                </div>
                <div className="text-lg font-black font-mono text-slate-900 mt-1">
                  {formatCurrency(activeReconciliation.opening_balance)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Uang kas awal shift</div>
              </div>

              {/* Penerimaan Kas Tunai */}
              <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
                <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                  <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. Penjualan Tunai (+)</span>
                </div>
                <div className="text-lg font-black font-mono text-emerald-700 mt-1">
                  +{formatCurrency(activeReconciliation.cash_sales)}
                </div>
                <div className="text-[10px] text-emerald-600 mt-0.5">Penerimaan kas pelanggan</div>
              </div>

              {/* Pengeluaran Kas */}
              <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-100">
                <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                  <span>3. Pengeluaran Kas (-)</span>
                </div>
                <div className="text-lg font-black font-mono text-rose-700 mt-1">
                  -{formatCurrency(activeReconciliation.cash_refunds + activeReconciliation.cash_payouts)}
                </div>
                <div className="text-[10px] text-rose-600 mt-0.5">
                  Refund: {formatCurrency(activeReconciliation.cash_refunds)} • Komisi: {formatCurrency(activeReconciliation.cash_payouts)}
                </div>
              </div>

              {/* Saldo Kas Sistem yang Seharusnya Ada */}
              <div className="p-4 bg-blue-50/70 rounded-xl border-2 border-blue-200">
                <div className="text-[11px] font-black text-blue-900 uppercase tracking-wider">
                  4. Kas Seharusnya di Laci
                </div>
                <div className="text-xl font-black font-mono text-blue-950 mt-1">
                  {formatCurrency(activeReconciliation.expected_cash_balance)}
                </div>
                <div className="text-[10px] text-blue-700 font-bold mt-0.5">
                  Modal Awal + Tunai - Pengeluaran
                </div>
              </div>
            </div>

            {/* Non-Cash Transactions Breakdown for EDC/QRIS Settlement */}
            <div className="mt-6">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-500" />
                <span>Rekonsiliasi Pembayaran Non-Tunai (EDC / QRIS / Transfer Bank)</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {activeReconciliation.non_cash_payments.length === 0 ? (
                  <div className="col-span-full py-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                    Belum ada transaksi pembayaran non-tunai pada shift ini.
                  </div>
                ) : (
                  activeReconciliation.non_cash_payments.map((nc) => (
                    <div
                      key={nc.method_code}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-800">{nc.method_name}</div>
                        <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                          {nc.transaction_count} transaksi
                        </div>
                      </div>
                      <div className="text-right font-mono font-bold text-slate-900">
                        {formatCurrency(nc.total_amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* No active session banner */
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-950">
                Tidak Ada Sesi Kasir Aktif (Laci Kasir Ditutup)
              </h3>
              <p className="text-xs text-amber-800 mt-0.5">
                Buka sesi kasir baru untuk memulai pencatatan kas modal awal dan melayani transaksi POS.
              </p>
            </div>
          </div>

          {canManageCashSession && (
            <button
              onClick={onOpenStartModal}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Unlock className="w-4 h-4 text-amber-400" />
              <span>Buka Sesi Kasir Baru</span>
            </button>
          )}
        </div>
      )}

      {/* 2. Past Cash Sessions History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">
              Riwayat Sesi Kasir & Hasil Rekonsiliasi EOD ({historySessions.length} Sesi)
            </h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Register / Kasir</th>
                <th className="px-5 py-3">Waktu Buka / Tutup</th>
                <th className="px-4 py-3 text-right">Modal Awal</th>
                <th className="px-4 py-3 text-right">Kas Sistem (Expected)</th>
                <th className="px-4 py-3 text-right">Kas Fisik (Actual)</th>
                <th className="px-4 py-3 text-center">Selisih Kas</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {historySessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    Belum ada riwayat sesi kasir sebelumnya di outlet ini.
                  </td>
                </tr>
              ) : (
                historySessions.map((sess) => {
                  const hasDiscrepancy = sess.discrepancy !== null && Math.abs(sess.discrepancy) > 0;
                  const isOverage = sess.discrepancy !== null && sess.discrepancy > 0;

                  return (
                    <tr key={sess.session_id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900">{sess.register_name}</div>
                        <div className="text-[11px] text-slate-500">{sess.cashier_name}</div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        <div>Buka: {formatDateTime(sess.opened_at)}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Tutup: {sess.closed_at ? formatDateTime(sess.closed_at) : 'Masih Berjalan'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-slate-800">
                        {formatCurrency(sess.opening_balance)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(sess.expected_cash_balance)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-950">
                        {sess.actual_closing_balance !== null
                          ? formatCurrency(sess.actual_closing_balance)
                          : '-'}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {sess.status === 'CLOSED' && sess.discrepancy !== null ? (
                          !hasDiscrepancy ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              Cocok (Rp 0)
                            </span>
                          ) : isOverage ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                              Lebih (+{formatCurrency(sess.discrepancy)})
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                              Kurang ({formatCurrency(sess.discrepancy)})
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-slate-400 font-semibold">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                            sess.status === 'OPEN'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {sess.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
