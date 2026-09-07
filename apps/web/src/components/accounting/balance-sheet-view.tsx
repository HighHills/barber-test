'use client';

import React from 'react';
import type { BalanceSheetData } from '../../types/pos';
import { formatCurrency } from '../../lib/formatters';
import {
  Scale,
  Wallet,
  ShieldCheck,
  AlertTriangle,
  Printer,
} from 'lucide-react';

interface BalanceSheetViewProps {
  data: BalanceSheetData;
  asOfDate: string;
  outletName: string;
}

export function BalanceSheetView({
  data,
  asOfDate,
  outletName,
}: BalanceSheetViewProps): React.JSX.Element {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* 1. Accounting Equation Invariant Banner */}
      <div
        className={`p-5 rounded-2xl border-2 flex flex-wrap items-center justify-between gap-4 shadow-sm ${
          data.is_balanced
            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-950'
            : 'bg-amber-500/10 border-amber-500 text-amber-950'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl shadow-xs ${
              data.is_balanced
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-500 text-slate-950'
            }`}
          >
            {data.is_balanced ? <ShieldCheck className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <span>Status Audit Persamaan Akuntansi (Balance Sheet Invariant)</span>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  data.is_balanced
                    ? 'bg-emerald-200 text-emerald-900'
                    : 'bg-amber-200 text-amber-900'
                }`}
              >
                {data.is_balanced ? 'PASS: SEIMBANG 100%' : 'PERIKSA SELISIH'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Rumus Fundamental Akuntansi:{' '}
              <span className="font-bold text-slate-800">
                Aset ({formatCurrency(data.total_assets)}) = Liabilitas ({formatCurrency(data.total_liabilities)}) + Ekuitas ({formatCurrency(data.total_equity)})
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Cetak Neraca</span>
          </button>
        </div>
      </div>

      {/* 2. Balance Sheet Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: ASSETS */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 bg-blue-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 leading-tight">ASET (ASSETS)</h3>
                <p className="text-[11px] text-slate-500">Kas, Bank, Piutang & Persediaan Barang</p>
              </div>
            </div>
            <div className="text-xs font-mono font-bold text-blue-900 bg-blue-100 px-2.5 py-1 rounded-lg">
              {formatCurrency(data.total_assets)}
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
            <div className="divide-y divide-slate-100 text-xs">
              {data.current_assets.map((asset) => (
                <div
                  key={asset.code}
                  className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-slate-400">
                      [{asset.code}]
                    </span>
                    <span className="text-slate-800 font-medium">{asset.name}</span>
                  </div>
                  <div className="font-mono font-bold text-slate-900">
                    {formatCurrency(asset.amount)}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t-2 border-slate-200">
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between">
                <span className="text-xs font-black text-blue-950 uppercase tracking-wider">
                  TOTAL ASET
                </span>
                <span className="text-base font-black font-mono text-blue-950">
                  {formatCurrency(data.total_assets)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: LIABILITIES & EQUITY */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 bg-emerald-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <Scale className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                  KEWAJIBAN & EKUITAS
                </h3>
                <p className="text-[11px] text-slate-500">Hutang Operasional & Modal Usaha</p>
              </div>
            </div>
            <div className="text-xs font-mono font-bold text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-lg">
              {formatCurrency(data.total_liabilities_and_equity)}
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              {/* Liabilities Group */}
              <div>
                <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider pb-1 mb-1 border-b border-slate-100">
                  A. Kewajiban Lancar (Current Liabilities)
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {data.current_liabilities.map((liab) => (
                    <div
                      key={liab.code}
                      className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-slate-400">
                          [{liab.code}]
                        </span>
                        <span className="text-slate-800 font-medium">{liab.name}</span>
                      </div>
                      <div className="font-mono font-bold text-slate-900">
                        {formatCurrency(liab.amount)}
                      </div>
                    </div>
                  ))}
                  <div className="py-2 flex items-center justify-between font-bold text-slate-700 bg-slate-50 px-2 rounded-lg">
                    <span>Subtotal Kewajiban</span>
                    <span className="font-mono">{formatCurrency(data.total_liabilities)}</span>
                  </div>
                </div>
              </div>

              {/* Equity Group */}
              <div>
                <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider pb-1 mb-1 border-b border-slate-100">
                  B. Ekuitas & Modal Pemilik (Owner Equity)
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {data.equity.map((eq) => (
                    <div
                      key={eq.code}
                      className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-slate-400">
                          [{eq.code}]
                        </span>
                        <span className="text-slate-800 font-medium">{eq.name}</span>
                      </div>
                      <div className="font-mono font-bold text-slate-900">
                        {formatCurrency(eq.amount)}
                      </div>
                    </div>
                  ))}

                  {/* Current Period Net Income Flow */}
                  <div className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg bg-emerald-50/40">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-emerald-600">
                        [P&L]
                      </span>
                      <span className="text-emerald-950 font-bold">
                        Laba Bersih Periode Berjalan (Current Earnings)
                      </span>
                    </div>
                    <div className="font-mono font-black text-emerald-700">
                      {formatCurrency(data.current_period_earnings)}
                    </div>
                  </div>

                  <div className="py-2 flex items-center justify-between font-bold text-slate-700 bg-slate-50 px-2 rounded-lg">
                    <span>Subtotal Ekuitas</span>
                    <span className="font-mono">{formatCurrency(data.total_equity)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Total Liabilities + Equity */}
            <div className="pt-4 border-t-2 border-slate-200">
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between">
                <span className="text-xs font-black text-emerald-950 uppercase tracking-wider">
                  TOTAL LIABILITAS & EKUITAS
                </span>
                <span className="text-base font-black font-mono text-emerald-950">
                  {formatCurrency(data.total_liabilities_and_equity)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="text-[11px] text-slate-500 text-center">
        Data neraca dihitung per tanggal <span className="font-bold text-slate-700">{asOfDate}</span> untuk entitas cabang <span className="font-bold text-slate-700">{outletName}</span> berdasarkan seluruh jurnal akuntansi yang telah diposting.
      </div>
    </div>
  );
}
