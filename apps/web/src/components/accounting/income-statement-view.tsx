'use client';

import React from 'react';
import type { IncomeStatementData } from '../../types/pos';
import { formatCurrency } from '../../lib/formatters';
import {
  TrendingUp,
  DollarSign,
  Scissors,
  Package,
  Coins,
  Percent,
  Printer,
} from 'lucide-react';

interface IncomeStatementViewProps {
  data: IncomeStatementData;
  periodLabel: string;
  outletName: string;
}

export function IncomeStatementView({
  data,
  periodLabel,
  outletName,
}: IncomeStatementViewProps): React.JSX.Element {
  const isProfitable = data.net_operating_profit >= 0;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* 1. Top KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Pendapatan Bersih
            </div>
            <div className="text-lg font-black text-slate-900 font-mono">
              {formatCurrency(data.net_revenue)}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
              Jasa & Produk salon
            </div>
          </div>
        </div>

        {/* Gross Profit */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Laba Kotor (Gross)
            </div>
            <div className="text-lg font-black text-emerald-600 font-mono">
              {formatCurrency(data.gross_profit)}
            </div>
            <div className="text-[10px] text-emerald-600 font-bold mt-0.5">
              Margin: {data.gross_margin_percent.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Operating Expenses */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total Beban Usaha
            </div>
            <div className="text-lg font-black text-slate-900 font-mono">
              {formatCurrency(data.total_operating_expenses)}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
              Komisi, selisih stok & operasional
            </div>
          </div>
        </div>

        {/* Net Operating Profit */}
        <div
          className={`p-4 rounded-2xl border shadow-xs flex items-center gap-3.5 ${
            isProfitable
              ? 'bg-gradient-to-br from-emerald-50 to-teal-50/50 border-emerald-300'
              : 'bg-gradient-to-br from-red-50 to-rose-50/50 border-red-300'
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
              isProfitable
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {isProfitable ? '📈' : '📉'}
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Laba Bersih (Net)
            </div>
            <div
              className={`text-lg font-black font-mono ${
                isProfitable ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {formatCurrency(data.net_operating_profit)}
            </div>
            <div
              className={`text-[10px] font-bold mt-0.5 ${
                isProfitable ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              Net Margin: {data.net_profit_margin_percent.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* 2. Formal Income Statement Sheet */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Statement Header */}
        <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <div className="text-xs font-bold text-amber-500 uppercase tracking-widest">
              Laporan Keuangan Resmi
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight mt-0.5">
              Laporan Laba Rugi (Income Statement)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Entitas: <span className="font-semibold text-slate-700">{outletName}</span> • Periode: <span className="font-semibold text-slate-700">{periodLabel}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>Cetak Laporan</span>
            </button>
          </div>
        </div>

        {/* Statement Content */}
        <div className="p-6 space-y-6 text-sm">
          {/* I. PENDAPATAN OPERASIONAL */}
          <div>
            <div className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-500" />
                <span>I. Pendapatan Operasional (Operating Revenue)</span>
              </span>
              <span className="text-[11px] text-slate-400 font-normal">Akun COA</span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg">
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <Scissors className="w-3.5 h-3.5 text-slate-400" />
                  <span>Pendapatan Jasa Pangkas & Perawatan (Service Revenue)</span>
                  <span className="text-[10px] text-slate-400 font-mono">[4000]</span>
                </div>
                <div className="font-mono font-bold text-slate-900">
                  {formatCurrency(data.service_revenue)}
                </div>
              </div>

              <div className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg">
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <Package className="w-3.5 h-3.5 text-slate-400" />
                  <span>Pendapatan Penjualan Produk Retail (Product Revenue)</span>
                  <span className="text-[10px] text-slate-400 font-mono">[4100]</span>
                </div>
                <div className="font-mono font-bold text-slate-900">
                  {formatCurrency(data.product_revenue)}
                </div>
              </div>

              <div className="py-2.5 flex items-center justify-between bg-slate-50/70 px-2 rounded-lg font-semibold">
                <span className="text-slate-800">Total Pendapatan Kotor (Gross Revenue)</span>
                <span className="font-mono text-slate-900">{formatCurrency(data.gross_revenue)}</span>
              </div>

              {data.discounts_refunds > 0 && (
                <div className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg text-red-600">
                  <div className="flex items-center gap-2 font-medium">
                    <Percent className="w-3.5 h-3.5 text-red-400" />
                    <span>Dikurangi: Diskon Penjualan & Retur / Refund (Contra Revenue)</span>
                    <span className="text-[10px] text-red-400 font-mono">[5600]</span>
                  </div>
                  <div className="font-mono font-bold">
                    ({formatCurrency(data.discounts_refunds)})
                  </div>
                </div>
              )}

              <div className="py-3 flex items-center justify-between bg-blue-50/50 px-3 rounded-xl font-black text-blue-950 border border-blue-100">
                <span>TOTAL PENDAPATAN BERSIH (NET REVENUE)</span>
                <span className="font-mono text-sm">{formatCurrency(data.net_revenue)}</span>
              </div>
            </div>
          </div>

          {/* II. HARGA POKOK PENJUALAN */}
          <div>
            <div className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-500" />
                <span>II. Harga Pokok Penjualan (Cost of Goods Sold - COGS)</span>
              </span>
              <span className="text-[11px] text-slate-400 font-normal">Akun COA</span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg">
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <span>HPP Produk Terjual (Moving Average Cost)</span>
                  <span className="text-[10px] text-slate-400 font-mono">[5000]</span>
                </div>
                <div className="font-mono font-bold text-slate-900">
                  {formatCurrency(data.cogs)}
                </div>
              </div>

              <div className="py-3 flex items-center justify-between bg-emerald-50/60 px-3 rounded-xl font-black text-emerald-950 border border-emerald-200">
                <div className="flex items-center gap-2">
                  <span>LABA KOTOR (GROSS PROFIT)</span>
                  <span className="text-xs font-normal text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-sans">
                    Margin: {data.gross_margin_percent.toFixed(1)}%
                  </span>
                </div>
                <span className="font-mono text-sm">{formatCurrency(data.gross_profit)}</span>
              </div>
            </div>
          </div>

          {/* III. BEBAN OPERASIONAL */}
          <div>
            <div className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-600" />
                <span>III. Beban Operasional Usaha (Operating Expenses)</span>
              </span>
              <span className="text-[11px] text-slate-400 font-normal">Akun COA</span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg">
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  <span>Beban Komisi Staf & Kapster (Commission Expense)</span>
                  <span className="text-[10px] text-slate-400 font-mono">[5100]</span>
                </div>
                <div className="font-mono font-bold text-slate-900">
                  {formatCurrency(data.commission_expense)}
                </div>
              </div>

              {data.inventory_loss_expense > 0 && (
                <div className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <span>Beban Selisih / Kerusakan Stok Opname (Inventory Loss / Waste)</span>
                    <span className="text-[10px] text-slate-400 font-mono">[5700]</span>
                  </div>
                  <div className="font-mono font-bold text-slate-900">
                    {formatCurrency(data.inventory_loss_expense)}
                  </div>
                </div>
              )}

              {data.merchant_fee_expense > 0 && (
                <div className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <span>Biaya Merchant EDC & QRIS Fee (Payment Gateway Fee)</span>
                    <span className="text-[10px] text-slate-400 font-mono">[5500]</span>
                  </div>
                  <div className="font-mono font-bold text-slate-900">
                    {formatCurrency(data.merchant_fee_expense)}
                  </div>
                </div>
              )}

              {data.other_operating_expenses > 0 && (
                <div className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <span>Beban Operasional Lainnya (Sewa, Utilitas, Gaji)</span>
                    <span className="text-[10px] text-slate-400 font-mono">[5200-5400]</span>
                  </div>
                  <div className="font-mono font-bold text-slate-900">
                    {formatCurrency(data.other_operating_expenses)}
                  </div>
                </div>
              )}

              <div className="py-3 flex items-center justify-between bg-slate-100 px-3 rounded-xl font-bold text-slate-900">
                <span>TOTAL BEBAN OPERASIONAL</span>
                <span className="font-mono text-sm">{formatCurrency(data.total_operating_expenses)}</span>
              </div>
            </div>
          </div>

          {/* IV. LABA BERSIH (NET INCOME) */}
          <div
            className={`p-5 rounded-2xl border-2 flex flex-wrap items-center justify-between gap-4 shadow-sm ${
              isProfitable
                ? 'bg-emerald-50/70 border-emerald-500 text-emerald-950'
                : 'bg-red-50/70 border-red-500 text-red-950'
            }`}
          >
            <div>
              <div className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                <span>IV. LABA BERSIH OPERASIONAL (NET OPERATING PROFIT)</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isProfitable
                      ? 'bg-emerald-200 text-emerald-900'
                      : 'bg-red-200 text-red-900'
                  }`}
                >
                  {isProfitable ? 'PROFIT SURPLUS' : 'DEFISIT RUGI'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Laba Kotor dikurangi Seluruh Beban Komisi dan Biaya Operasional Salon
              </p>
            </div>

            <div className="text-right">
              <div className="text-2xl font-black font-mono">
                {formatCurrency(data.net_operating_profit)}
              </div>
              <div className="text-xs font-bold text-slate-600 mt-0.5">
                Margin Bersih: {data.net_profit_margin_percent.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
