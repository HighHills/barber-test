'use client';

import React, { useMemo } from 'react';
import type { BarberCommissionSummary } from '../../types/pos';
import { formatCurrency } from '../../lib/formatters';
import {
  Trophy,
  TrendingUp,
  Scissors,
} from 'lucide-react';

interface BarberPerformanceRankProps {
  barberSummaries: BarberCommissionSummary[];
}

export function BarberPerformanceRank({
  barberSummaries,
}: BarberPerformanceRankProps): React.JSX.Element {
  // Sort by total sales volume descending
  const sortedBySales = useMemo(() => {
    return [...barberSummaries].sort((a, b) => b.total_sales_volume - a.total_sales_volume);
  }, [barberSummaries]);

  // Sort by cut count descending
  const sortedByVolume = useMemo(() => {
    return [...barberSummaries].sort((a, b) => b.total_services_count - a.total_services_count);
  }, [barberSummaries]);

  const totalOutletRevenue = useMemo(() => {
    return barberSummaries.reduce((acc, b) => acc + b.total_sales_volume, 0);
  }, [barberSummaries]);

  const totalCuts = useMemo(() => {
    return barberSummaries.reduce((acc, b) => acc + b.total_services_count, 0);
  }, [barberSummaries]);

  const topPerformer = sortedBySales[0];

  return (
    <div className="space-y-6">
      {/* 1. Champion Podium Card */}
      {topPerformer && topPerformer.total_sales_volume > 0 && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 rounded-3xl p-6 text-slate-950 shadow-lg flex flex-wrap items-center justify-between gap-4 border border-amber-300">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-950 text-amber-400 flex items-center justify-center font-black text-2xl shadow-md ring-4 ring-white/40">
              🥇
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-900/80">
                <Trophy className="w-4 h-4" />
                <span>Top Kapster Terproduktif Periode Ini</span>
              </div>
              <h3 className="text-2xl font-black tracking-tight leading-tight">
                {topPerformer.employee_name}
              </h3>
              <p className="text-xs font-semibold text-slate-900/90 mt-0.5">
                {topPerformer.position || 'Kapster Utama'} • {topPerformer.total_services_count} Tamu Dilayani
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 bg-slate-950/10 px-5 py-3 rounded-2xl backdrop-blur-xs">
            <div>
              <div className="text-[11px] font-bold text-slate-900/80 uppercase">Kontribusi Omset</div>
              <div className="text-xl font-black font-mono">
                {formatCurrency(topPerformer.total_sales_volume)}
              </div>
            </div>
            <div className="h-8 w-px bg-slate-950/20" />
            <div>
              <div className="text-[11px] font-bold text-slate-900/80 uppercase">Total Komisi</div>
              <div className="text-xl font-black font-mono">
                {formatCurrency(topPerformer.total_earned_amount)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Leaderboard Grid: By Revenue vs By Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Revenue Column */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-900">
                Peringkat Berdasarkan Omset Layanan
              </h3>
            </div>
            <span className="text-xs text-slate-500">
              Total Omset: {formatCurrency(totalOutletRevenue)}
            </span>
          </div>

          <div className="space-y-3 flex-1">
            {sortedBySales.map((barber, index) => {
              const sharePercent =
                totalOutletRevenue > 0
                  ? Math.round((barber.total_sales_volume / totalOutletRevenue) * 100)
                  : 0;

              return (
                <div
                  key={barber.employee_id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs ${
                          index === 0
                            ? 'bg-amber-400 text-slate-950 shadow-2xs'
                            : index === 1
                            ? 'bg-slate-300 text-slate-800'
                            : index === 2
                            ? 'bg-amber-700 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        #{index + 1}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {barber.employee_name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {barber.total_services_count} cut • Komisi: {formatCurrency(barber.total_earned_amount)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-black text-slate-900 font-mono">
                        {formatCurrency(barber.total_sales_volume)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-semibold">
                        {sharePercent}% Pangsa Omset
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        index === 0
                          ? 'bg-amber-500'
                          : index === 1
                          ? 'bg-blue-500'
                          : 'bg-slate-400'
                      }`}
                      style={{ width: `${Math.max(4, sharePercent)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Volume (Cut Count) Column */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <Scissors className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-bold text-slate-900">
                Peringkat Berdasarkan Volume Cukur
              </h3>
            </div>
            <span className="text-xs text-slate-500">
              Total Kepala: {totalCuts} Tamu
            </span>
          </div>

          <div className="space-y-3 flex-1">
            {sortedByVolume.map((barber, index) => {
              const volumeShare =
                totalCuts > 0
                  ? Math.round((barber.total_services_count / totalCuts) * 100)
                  : 0;

              return (
                <div
                  key={barber.employee_id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs ${
                          index === 0
                            ? 'bg-blue-500 text-white shadow-2xs'
                            : index === 1
                            ? 'bg-slate-300 text-slate-800'
                            : index === 2
                            ? 'bg-amber-700 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        #{index + 1}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {barber.employee_name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {barber.position || 'Kapster'}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-black text-slate-900 font-mono">
                        {barber.total_services_count} Tamu
                      </div>
                      <div className="text-[10px] text-slate-400 font-semibold">
                        {volumeShare}% Pangsa Volume
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        index === 0
                          ? 'bg-blue-600'
                          : index === 1
                          ? 'bg-amber-500'
                          : 'bg-slate-400'
                      }`}
                      style={{ width: `${Math.max(4, volumeShare)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
