'use client';

import React, { useState, useMemo } from 'react';
import type {
  CommissionItemView,
  BarberCommissionSummary,
  BarberEmployee,
} from '../../types/pos';
import { formatCurrency, formatDateTime } from '../../lib/formatters';
import {
  Coins,
  Wallet,
  CheckCircle2,
  Receipt,
  Scissors,
  Package,
  CreditCard,
} from 'lucide-react';

interface CommissionLedgerTableProps {
  commissions: CommissionItemView[];
  barberSummaries: BarberCommissionSummary[];
  barbers: BarberEmployee[];
  canManageCommissions: boolean;
  onOpenPayoutModal: (summary: BarberCommissionSummary) => void;
}

export function CommissionLedgerTable({
  commissions,
  barberSummaries,
  barbers,
  canManageCommissions,
  onOpenPayoutModal,
}: CommissionLedgerTableProps): React.JSX.Element {
  const [selectedBarberFilter, setSelectedBarberFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [selectedDateFilter, setSelectedDateFilter] = useState<'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'>('THIS_MONTH');

  // Filter Logic
  const filteredCommissions = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);

    return commissions.filter((c) => {
      const matchBarber =
        selectedBarberFilter === 'ALL' || c.employee_id === selectedBarberFilter;
      const matchStatus =
        selectedStatusFilter === 'ALL' || c.status === selectedStatusFilter;

      let matchDate = true;
      const earnedDate = new Date(c.earned_at);
      if (selectedDateFilter === 'TODAY') {
        matchDate = c.earned_at.startsWith(todayStr);
      } else if (selectedDateFilter === 'THIS_WEEK') {
        matchDate = earnedDate >= weekAgo;
      } else if (selectedDateFilter === 'THIS_MONTH') {
        matchDate = earnedDate >= monthAgo;
      }

      return matchBarber && matchStatus && matchDate;
    });
  }, [commissions, selectedBarberFilter, selectedStatusFilter, selectedDateFilter]);

  // Overall KPIs
  const totalEarned = commissions
    .filter((c) => c.status !== 'VOIDED')
    .reduce((acc, c) => acc + Number(c.commission_amount || 0), 0);

  const totalUnpaid = commissions
    .filter((c) => c.status === 'EARNED')
    .reduce((acc, c) => acc + Number(c.commission_amount || 0), 0);

  const totalPaid = commissions
    .filter((c) => c.status === 'PAID')
    .reduce((acc, c) => acc + Number(c.commission_amount || 0), 0);

  const totalCount = commissions.filter((c) => c.status !== 'VOIDED').length;

  return (
    <div className="space-y-6">
      {/* 1. Top Financial KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-amber-100 text-amber-800">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900 leading-tight">
              {formatCurrency(totalEarned)}
            </div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Komisi Dihasilkan
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-red-100 text-red-800">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-red-700 leading-tight">
              {formatCurrency(totalUnpaid)}
            </div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Hutang Komisi (Payable)
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-emerald-700 leading-tight">
              {formatCurrency(totalPaid)}
            </div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Telah Dicairkan (Paid)
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-blue-100 text-blue-800">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900 leading-tight">
              {totalCount} Transaksi
            </div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Layanan & Produk
            </div>
          </div>
        </div>
      </div>

      {/* 2. Barber Summary & Payout Action Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <span>Ringkasan Saldo Komisi Kapster ({barberSummaries.length})</span>
          </h2>
          <span className="text-xs text-slate-500">
            Pelunasan langsung terposting ke Jurnal Akuntansi Level 2
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {barberSummaries.map((summary) => (
            <div
              key={summary.employee_id}
              className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs">
                      {summary.employee_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-tight">
                        {summary.employee_name}
                      </h3>
                      <p className="text-[11px] text-slate-500">{summary.position || 'Kapster'}</p>
                    </div>
                  </div>

                  {summary.unpaid_amount > 0 ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                      Ada Saldo
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Lunas
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 my-3 p-3 bg-slate-50 rounded-xl text-xs border border-slate-100">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">
                      Belum Dibayar
                    </div>
                    <div className="text-sm font-black text-red-600 font-mono">
                      {formatCurrency(summary.unpaid_amount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">
                      Sudah Dicairkan
                    </div>
                    <div className="text-sm font-bold text-slate-700 font-mono">
                      {formatCurrency(summary.total_paid_amount)}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 flex items-center justify-between px-0.5 mb-2">
                  <span>Total Layanan: {summary.total_services_count} cut</span>
                  <span>Omset: {formatCurrency(summary.total_sales_volume)}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <button
                  disabled={summary.unpaid_amount <= 0 || !canManageCommissions}
                  onClick={() => onOpenPayoutModal(summary)}
                  className={`w-full py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                    summary.unpaid_amount > 0 && canManageCommissions
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>
                    {summary.unpaid_amount <= 0 ? 'Saldo Lunas' : canManageCommissions ? 'Bayar Komisi (Payout)' : 'Tidak Memiliki Akses Payout'}
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Detailed Ledger Table with Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">
              Rincian Buku Besar Komisi ({filteredCommissions.length} Baris)
            </h3>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Barber Filter */}
            <select
              value={selectedBarberFilter}
              onChange={(e) => setSelectedBarberFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
            >
              <option value="ALL">Semua Kapster</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.full_name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
            >
              <option value="ALL">Semua Status</option>
              <option value="EARNED">Belum Dibayar (EARNED)</option>
              <option value="PAID">Telah Dibayar (PAID)</option>
              <option value="VOIDED">Dibatalkan (VOIDED)</option>
            </select>

            {/* Date Filter Tabs */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setSelectedDateFilter('TODAY')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  selectedDateFilter === 'TODAY'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => setSelectedDateFilter('THIS_WEEK')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  selectedDateFilter === 'THIS_WEEK'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                7 Hari
              </button>
              <button
                type="button"
                onClick={() => setSelectedDateFilter('THIS_MONTH')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  selectedDateFilter === 'THIS_MONTH'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                30 Hari
              </button>
              <button
                type="button"
                onClick={() => setSelectedDateFilter('ALL')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  selectedDateFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua
              </button>
            </div>
          </div>
        </div>

        {filteredCommissions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
            <Coins className="w-12 h-12 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-semibold text-slate-700">Belum Ada Catatan Komisi</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Komisi otomatis tercatat saat transaksi kasir POS yang menugaskan kapster berhasil diselesaikan.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">No. Nota</th>
                  <th className="py-2.5 px-3">Waktu Transaksi</th>
                  <th className="py-2.5 px-3">Kapster</th>
                  <th className="py-2.5 px-3">Item Layanan / Produk</th>
                  <th className="py-2.5 px-3">Nilai Transaksi</th>
                  <th className="py-2.5 px-3">Skema Komisi</th>
                  <th className="py-2.5 px-3">Nominal Komisi</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCommissions.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                      {item.invoice_number}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {formatDateTime(item.earned_at)}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">
                      {item.employee_name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      <div className="flex items-center gap-1.5">
                        {item.item_type === 'SERVICE' ? (
                          <Scissors className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        ) : (
                          <Package className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )}
                        <span>{item.item_name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {formatCurrency(item.line_total)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {item.commission_type === 'PERCENTAGE'
                        ? `${item.commission_rate}%`
                        : 'Fixed (Tetap)'}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                      {formatCurrency(item.commission_amount)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          item.status === 'PAID'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.status === 'EARNED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {item.status === 'PAID'
                          ? 'Dicairkan'
                          : item.status === 'EARNED'
                          ? 'Belum Bayar'
                          : 'Dibatalkan'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
