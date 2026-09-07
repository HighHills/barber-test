'use client';

import React, { useState, useMemo } from 'react';
import type { TrialBalanceRow } from '../../types/pos';
import { formatCurrency } from '../../lib/formatters';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Download,
} from 'lucide-react';

interface TrialBalanceTableProps {
  rows: TrialBalanceRow[];
  asOfDate: string;
  outletName: string;
}

export function TrialBalanceTable({
  rows,
  asOfDate,
  outletName,
}: TrialBalanceTableProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchSearch =
        r.account_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.account_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchType = selectedType === 'ALL' || r.account_type === selectedType;
      return matchSearch && matchType;
    });
  }, [rows, searchQuery, selectedType]);

  // Total Debit and Credit
  const totalDebit = useMemo(() => {
    return rows.reduce((acc, r) => acc + r.debit_amount, 0);
  }, [rows]);

  const totalCredit = useMemo(() => {
    return rows.reduce((acc, r) => acc + r.credit_amount, 0);
  }, [rows]);

  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const headers = ['Kode Akun', 'Nama Akun', 'Tipe Akun', 'Saldo Normal', 'Debit (Rp)', 'Kredit (Rp)'];
    const csvContent = [
      headers.join(','),
      ...rows.map((r) =>
        [
          `"${r.account_code}"`,
          `"${r.account_name}"`,
          `"${r.account_type}"`,
          `"${r.normal_balance}"`,
          r.debit_amount.toFixed(2),
          r.credit_amount.toFixed(2),
        ].join(',')
      ),
      ['"TOTAL"', '""', '""', '""', totalDebit.toFixed(2), totalCredit.toFixed(2)].join(','),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Neraca_Saldo_${asOfDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Invariant Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-amber-500 uppercase tracking-widest">
            Buku Besar Terpadu
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            Neraca Saldo (Trial Balance)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Entitas: <span className="font-semibold text-slate-700">{outletName}</span> • Per Tanggal: <span className="font-semibold text-slate-700">{asOfDate}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`px-4 py-2 rounded-xl border flex items-center gap-2 text-xs font-bold ${
              isBalanced
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-red-50 text-red-800 border-red-300'
            }`}
          >
            {isBalanced ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600" />
            )}
            <span>{isBalanced ? 'PASS: SEIMBANG (DEBIT = KREDIT)' : 'FAIL: TIDAK SEIMBANG'}</span>
          </div>

          <button
            onClick={handleExportCSV}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Ekspor CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Cetak</span>
          </button>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari kode akun atau nama akun..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs text-slate-900"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                selectedType === type
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {type === 'ALL' ? 'Semua Akun' : type}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Trial Balance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 w-28">Kode Akun</th>
                <th className="px-5 py-3">Nama Akun (Chart of Account)</th>
                <th className="px-4 py-3 w-32">Golongan</th>
                <th className="px-4 py-3 w-28">Saldo Normal</th>
                <th className="px-5 py-3 text-right w-44">Saldo Debit (Rp)</th>
                <th className="px-5 py-3 text-right w-44">Saldo Kredit (Rp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    Tidak ada akun yang sesuai dengan pencarian.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.account_code} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3 font-mono font-bold text-slate-900">
                      {row.account_code}
                    </td>
                    <td className="px-5 py-3 text-slate-800 font-semibold">
                      {row.account_name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          row.account_type === 'ASSET'
                            ? 'bg-blue-100 text-blue-800'
                            : row.account_type === 'LIABILITY'
                            ? 'bg-amber-100 text-amber-800'
                            : row.account_type === 'EQUITY'
                            ? 'bg-purple-100 text-purple-800'
                            : row.account_type === 'REVENUE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {row.account_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-semibold text-[11px]">
                      {row.normal_balance}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-slate-900">
                      {row.debit_amount > 0 ? formatCurrency(row.debit_amount) : '-'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-slate-900">
                      {row.credit_amount > 0 ? formatCurrency(row.credit_amount) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Grand Total Footer */}
            <tfoot className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-950">
              <tr>
                <td colSpan={4} className="px-5 py-4 uppercase tracking-wider text-right">
                  TOTAL KESELURUHAN (NERACA SALDO)
                </td>
                <td className="px-5 py-4 text-right font-mono text-sm text-emerald-400">
                  {formatCurrency(totalDebit)}
                </td>
                <td className="px-5 py-4 text-right font-mono text-sm text-emerald-400">
                  {formatCurrency(totalCredit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
