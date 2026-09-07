'use client';

import React from 'react';
import { formatCurrency } from '../../lib/formatters';
import type { OutletComparisonMetric } from '../../types/pos';
import { Store, ArrowUpRight, Trophy, TrendingUp } from 'lucide-react';

interface MultiOutletComparisonProps {
  outlets: OutletComparisonMetric[];
}

export function MultiOutletComparison({ outlets }: MultiOutletComparisonProps): React.JSX.Element {
  // Sort by revenue descending
  const sortedOutlets = [...outlets].sort((a, b) => b.totalRevenue - a.totalRevenue);
  const totalNetworkRevenue = outlets.reduce((sum, o) => sum + o.totalRevenue, 0);

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Store className="w-4 h-4 text-emerald-600" />
            <span>Benchmark Komparasi Multi-Cabang Outlet</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Perbandingan omset, volume nota, dan kontribusi antar cabang barbershop
          </p>
        </div>
        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60 flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>{outlets.length} Cabang Aktif</span>
        </span>
      </div>

      {/* Outlet Cards / Table */}
      <div className="space-y-3.5 my-2">
        {sortedOutlets.map((outlet, index) => {
          const share = totalNetworkRevenue > 0
            ? Math.round((outlet.totalRevenue / totalNetworkRevenue) * 100)
            : 0;

          return (
            <div
              key={outlet.outletId}
              className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/60 hover:border-slate-300 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold ${
                      index === 0
                        ? 'bg-amber-400 text-slate-950 shadow-xs'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {index === 0 ? <Trophy className="w-3.5 h-3.5" /> : index + 1}
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      {outlet.outletName}
                    </h3>
                    <span className="text-[10px] font-mono text-slate-500">
                      Kode: {outlet.outletCode}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-black text-slate-900 font-mono">
                    {formatCurrency(outlet.totalRevenue)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {outlet.totalTransactions} Nota • ATV: <b className="font-mono text-slate-700">{formatCurrency(outlet.averageTicketValue)}</b>
                  </div>
                </div>
              </div>

              {/* Share of Network Bar */}
              <div className="space-y-1 mt-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Pangsa Omset Jaringan</span>
                  <span className="font-bold text-slate-800 font-mono">{share}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${share}%` }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                  />
                </div>
              </div>

              {/* Retail Upsell Contribution Indicator */}
              <div className="mt-2.5 pt-2 border-t border-slate-200/50 flex items-center justify-between text-[11px] text-slate-500">
                <span>Porsi Penjualan Produk Retail:</span>
                <span className="font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono">
                  <ArrowUpRight className="w-3 h-3" />
                  {outlet.productUpsellSharePercent}% ({formatCurrency(outlet.productRevenue)})
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total Network Stats */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
        <span>Total Omset Jaringan Seluruh Cabang:</span>
        <span className="font-bold text-emerald-700 font-mono text-sm">
          {formatCurrency(totalNetworkRevenue)}
        </span>
      </div>
    </div>
  );
}
