'use client';

import React from 'react';
import { formatCurrency } from '../../lib/formatters';
import type { BarberProductivityMetric } from '../../types/pos';
import { Scissors, Trophy, Package, Sparkles } from 'lucide-react';

interface BarberProductivityRankProps {
  barbers: BarberProductivityMetric[];
}

export function BarberProductivityRank({ barbers }: BarberProductivityRankProps): React.JSX.Element {
  const sorted = [...barbers].sort((a, b) => b.totalRevenue - a.totalRevenue);

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>Peringkat Produktivitas & Kontribusi Kapster</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Evaluasi jumlah kepala dicukur, omset yang dihasilkan, dan rasio upselling produk
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
              <th className="pb-2.5 pl-1">Kapster</th>
              <th className="pb-2.5 text-center">Kepala (Tamu)</th>
              <th className="pb-2.5 text-right">Omset Jasa</th>
              <th className="pb-2.5 text-right">Omset Retail</th>
              <th className="pb-2.5 text-right font-bold text-slate-700">Total Omset</th>
              <th className="pb-2.5 text-right pr-1">Upsell Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400 italic">
                  Belum ada data pangkas kapster pada periode ini.
                </td>
              </tr>
            ) : (
              sorted.map((b, idx) => (
                <tr key={b.barberId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 pl-1">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
                          idx === 0
                            ? 'bg-amber-400 text-slate-950 shadow-xs'
                            : idx === 1
                            ? 'bg-slate-300 text-slate-800'
                            : idx === 2
                            ? 'bg-amber-700/20 text-amber-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{b.barberName}</span>
                          {idx === 0 && <Sparkles className="w-3 h-3 text-amber-500" />}
                        </div>
                        <span className="text-[10px] text-slate-500">{b.position || 'Kapster'}</span>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 text-center">
                    <span className="font-bold text-slate-800 font-mono bg-slate-100 px-2 py-0.5 rounded-md">
                      {b.guestsCount}
                    </span>
                  </td>

                  <td className="py-3 text-right font-mono text-slate-600">
                    {formatCurrency(b.serviceRevenue)}
                  </td>

                  <td className="py-3 text-right font-mono text-slate-600">
                    <span className="flex items-center justify-end gap-1 text-sky-700">
                      <Package className="w-3 h-3 text-sky-500" />
                      <span>{formatCurrency(b.productRevenue)}</span>
                    </span>
                  </td>

                  <td className="py-3 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(b.totalRevenue)}
                  </td>

                  <td className="py-3 text-right pr-1">
                    <span
                      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-bold font-mono text-[11px] ${
                        b.upsellRatePercent >= 20
                          ? 'bg-emerald-100 text-emerald-800'
                          : b.upsellRatePercent > 0
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {b.upsellRatePercent}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Note */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <Scissors className="w-3.5 h-3.5 text-amber-500" />
          <span>Indeks didasarkan pada nota transaksi selesai (COMPLETED)</span>
        </span>
        <span>
          Total Kapster: <b className="text-slate-800">{sorted.length} Orang</b>
        </span>
      </div>
    </div>
  );
}
