'use client';

import React, { useState, useMemo } from 'react';
import type {
  FinancialAccountBalanceView,
  GeneralLedgerEntry,
} from '../../types/pos';
import { formatCurrency } from '../../lib/formatters';
import {
  BookOpen,
  Search,
  Printer,
} from 'lucide-react';

interface GeneralLedgerViewProps {
  accounts: FinancialAccountBalanceView[];
  entries: GeneralLedgerEntry[];
  selectedAccountId: string;
  onSelectAccount: (accountId: string) => void;
  periodLabel: string;
  outletName: string;
}

export function GeneralLedgerView({
  accounts,
  entries,
  selectedAccountId,
  onSelectAccount,
  periodLabel,
  outletName,
}: GeneralLedgerViewProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState<string>('');

  const currentAccount = useMemo(() => {
    return accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;
  }, [accounts, selectedAccountId]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      return (
        e.journal_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.reference_type && e.reference_type.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    });
  }, [entries, searchQuery]);

  const totalPeriodDebit = useMemo(() => {
    return entries.reduce((acc, e) => acc + e.debit, 0);
  }, [entries]);

  const totalPeriodCredit = useMemo(() => {
    return entries.reduce((acc, e) => acc + e.credit, 0);
  }, [entries]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* 1. Account Selector & Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-amber-500 uppercase tracking-widest">
              Buku Besar Rinci
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              General Ledger Mutasi Akun
            </h2>
          </div>
        </div>

        {/* Account Selector Dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-500">Pilih Akun COA:</label>
          <select
            value={currentAccount?.id || ''}
            onChange={(e) => onSelectAccount(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer min-w-[260px]"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                [{acc.account_code}] {acc.account_name} ({acc.account_type})
              </option>
            ))}
          </select>

          <button
            onClick={handlePrint}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer ml-1"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Cetak</span>
          </button>
        </div>
      </div>

      {/* 2. Active Account Summary Bar */}
      {currentAccount && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 shadow-md flex flex-wrap items-center justify-between gap-4 border border-slate-700">
          <div>
            <div className="flex items-center gap-2 text-xs text-amber-400 font-bold uppercase tracking-wider">
              <span>{currentAccount.account_type}</span>
              <span>•</span>
              <span>Saldo Normal: {currentAccount.normal_balance}</span>
            </div>
            <h3 className="text-xl font-black tracking-tight mt-0.5">
              [{currentAccount.account_code}] {currentAccount.account_name}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cabang: {outletName} • Periode: {periodLabel}
            </p>
          </div>

          <div className="flex items-center gap-6 bg-slate-800/80 border border-slate-700 px-5 py-3 rounded-xl">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">
                Total Mutasi Debit
              </div>
              <div className="text-base font-bold font-mono text-emerald-400">
                {formatCurrency(totalPeriodDebit)}
              </div>
            </div>
            <div className="h-8 w-px bg-slate-700" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">
                Total Mutasi Kredit
              </div>
              <div className="text-base font-bold font-mono text-emerald-400">
                {formatCurrency(totalPeriodCredit)}
              </div>
            </div>
            <div className="h-8 w-px bg-slate-700" />
            <div>
              <div className="text-[10px] text-amber-400 uppercase font-bold">
                Saldo Akhir Berjalan
              </div>
              <div className="text-xl font-black font-mono text-white">
                {formatCurrency(currentAccount.net_balance)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nomor jurnal, keterangan, referensi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs text-slate-900"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Ditemukan <span className="font-bold text-slate-900">{filteredEntries.length}</span> baris mutasi
        </div>
      </div>

      {/* 4. Chronological Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 w-28">Tanggal</th>
                <th className="px-5 py-3 w-36">No. Jurnal</th>
                <th className="px-4 py-3 w-28">Referensi</th>
                <th className="px-5 py-3">Keterangan Transaksi</th>
                <th className="px-5 py-3 text-right w-36">Debit (Rp)</th>
                <th className="px-5 py-3 text-right w-36">Kredit (Rp)</th>
                <th className="px-5 py-3 text-right w-40">Saldo Akhir (Rp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                    Belum ada riwayat mutasi jurnal akuntansi untuk akun ini pada periode yang dipilih.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3 text-slate-600 font-mono">
                      {entry.journal_date}
                    </td>
                    <td className="px-5 py-3 font-mono font-bold text-slate-900">
                      {entry.journal_number}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono">
                        {entry.reference_type || 'MANUAL'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {entry.description}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-slate-900">
                      {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-slate-900">
                      {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-slate-950 bg-slate-50/50">
                      {formatCurrency(entry.running_balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Total Footer */}
            <tfoot className="bg-slate-100 text-slate-900 font-bold text-xs border-t border-slate-200">
              <tr>
                <td colSpan={4} className="px-5 py-3 uppercase tracking-wider text-right">
                  TOTAL MUTASI PERIODE
                </td>
                <td className="px-5 py-3 text-right font-mono font-bold">
                  {formatCurrency(totalPeriodDebit)}
                </td>
                <td className="px-5 py-3 text-right font-mono font-bold">
                  {formatCurrency(totalPeriodCredit)}
                </td>
                <td className="px-5 py-3 text-right font-mono font-black text-slate-950">
                  {currentAccount ? formatCurrency(currentAccount.net_balance) : '-'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
