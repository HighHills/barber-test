'use client';

import React from 'react';
import { formatCurrency } from '../../lib/formatters';
import type { ExecutiveKPIStats } from '../../types/pos';
import {
  TrendingUp,
  Receipt,
  Users,
  PieChart,
  Scissors,
  Package,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';

interface ExecutiveKpiCardsProps {
  stats: ExecutiveKPIStats;
}

export function ExecutiveKpiCards({ stats }: ExecutiveKpiCardsProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Gross Revenue */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -z-0 transition-transform group-hover:scale-110" />
        <div className="relative z-10 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Total Omset Penjualan
          </span>
          <span className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
            <TrendingUp className="w-5 h-5" />
          </span>
        </div>
        <div className="relative z-10 mt-3">
          <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
            {formatCurrency(stats.totalRevenue)}
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Scissors className="w-3.5 h-3.5 text-amber-500" />
              <span>Jasa: <b className="text-slate-800 font-mono">{formatCurrency(stats.serviceRevenue)}</b></span>
            </span>
            <span className="flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-sky-500" />
              <span>Retail: <b className="text-slate-800 font-mono">{formatCurrency(stats.productRevenue)}</b></span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Average Ticket Size (ATV) & Transactions */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-bl-full -z-0 transition-transform group-hover:scale-110" />
        <div className="relative z-10 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Rata-rata Nota (ATV)
          </span>
          <span className="p-2 rounded-xl bg-amber-100 text-amber-700">
            <Receipt className="w-5 h-5" />
          </span>
        </div>
        <div className="relative z-10 mt-3">
          <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
            {formatCurrency(stats.averageTicketValue)}
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Total Transaksi Selesai</span>
            <span className="font-bold text-slate-800 font-mono bg-slate-100 px-2 py-0.5 rounded-md">
              {stats.totalTransactions} Nota
            </span>
          </div>
        </div>
      </div>

      {/* 3. Guest Count & Retention Rate */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-sky-50 rounded-bl-full -z-0 transition-transform group-hover:scale-110" />
        <div className="relative z-10 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Total Tamu & Retensi
          </span>
          <span className="p-2 rounded-xl bg-sky-100 text-sky-700">
            <Users className="w-5 h-5" />
          </span>
        </div>
        <div className="relative z-10 mt-3">
          <div className="text-2xl font-black text-slate-900 font-mono tracking-tight flex items-baseline gap-2">
            <span>{stats.totalGuests}</span>
            <span className="text-xs font-medium text-slate-500">Orang</span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Retensi Langganan</span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 flex items-center gap-0.5">
              <ArrowUpRight className="w-3 h-3" />
              <span>{stats.retentionRatePercent}%</span>
            </span>
          </div>
        </div>
      </div>

      {/* 4. Estimated Gross Profit Margin */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-bl-full -z-0 transition-transform group-hover:scale-110" />
        <div className="relative z-10 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Estimasi Laba Kotor
          </span>
          <span className="p-2 rounded-xl bg-purple-100 text-purple-700">
            <PieChart className="w-5 h-5" />
          </span>
        </div>
        <div className="relative z-10 mt-3">
          <div className="text-2xl font-black text-purple-700 font-mono tracking-tight">
            {formatCurrency(stats.estimatedGrossProfit)}
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Gross Profit Margin</span>
            <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200/60 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-500" />
              <span>{stats.grossProfitMarginPercent}%</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
