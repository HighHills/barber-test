'use client';

import React, { useState } from 'react';
import type { FinancialPeriodView } from '../../types/pos';
import { formatDateTime } from '../../lib/formatters';
import {
  Calendar,
  Lock,
  Unlock,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

interface FinancialPeriodsManagerProps {
  periods: FinancialPeriodView[];
  onClosePeriod: (periodId: string) => Promise<void>;
  isClosingPeriod: boolean;
}

export function FinancialPeriodsManager({
  periods,
  onClosePeriod,
  isClosingPeriod,
}: FinancialPeriodsManagerProps): React.JSX.Element {
  const [confirmPeriodId, setConfirmPeriodId] = useState<string | null>(null);

  const handleConfirmClose = async (periodId: string) => {
    await onClosePeriod(periodId);
    setConfirmPeriodId(null);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Info Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-amber-500 uppercase tracking-widest">
            Kontrol Integritas Finansial
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            Manajemen Periode Akuntansi (Period Lock)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Mengunci buku besar per periode tahunan/bulanan agar seluruh jurnal resmi tidak dapat diubah atau disisipkan secara retroaktif.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Proteksi Audit Level 2</span>
        </div>
      </div>

      {/* 2. Periods Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Rentang Periode Buku</th>
                <th className="px-5 py-3.5">Status Buku</th>
                <th className="px-5 py-3.5">Waktu Penutupan</th>
                <th className="px-5 py-3.5">Ditutup Oleh</th>
                <th className="px-5 py-3.5 text-right">Aksi Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {periods.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    Belum ada data periode buku akuntansi di database.
                  </td>
                </tr>
              ) : (
                periods.map((period) => {
                  const isOpen = period.status === 'OPEN';

                  return (
                    <tr key={period.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 font-bold text-slate-900 font-mono">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span>
                            {period.period_start} s/d {period.period_end}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Tahun Fiskal {period.period_start.split('-')[0]}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`text-[10px] font-black px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 ${
                            isOpen
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isOpen ? <Unlock className="w-3 h-3 text-emerald-600" /> : <Lock className="w-3 h-3 text-slate-500" />}
                          <span>{period.status}</span>
                        </span>
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {period.closed_at ? formatDateTime(period.closed_at) : 'Belum Ditutup (Berjalan)'}
                      </td>

                      <td className="px-5 py-4 text-slate-700 font-medium">
                        {period.closed_by_name || '-'}
                      </td>

                      <td className="px-5 py-4 text-right">
                        {isOpen ? (
                          confirmPeriodId === period.id ? (
                            <div className="inline-flex items-center gap-2 animate-in fade-in duration-150">
                              <span className="text-[11px] text-red-600 font-bold">Kunci Permanen?</span>
                              <button
                                disabled={isClosingPeriod}
                                onClick={() => handleConfirmClose(period.id)}
                                className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                {isClosingPeriod ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  'Ya, Tutup Buku'
                                )}
                              </button>
                              <button
                                disabled={isClosingPeriod}
                                onClick={() => setConfirmPeriodId(null)}
                                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs transition-colors cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmPeriodId(period.id)}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-2xs ml-auto cursor-pointer"
                            >
                              <Lock className="w-3.5 h-3.5 text-amber-500" />
                              <span>Tutup Buku Periode</span>
                            </button>
                          )
                        ) : (
                          <span className="text-[11px] text-slate-400 font-semibold italic">
                            Terkunci
                          </span>
                        )}
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
