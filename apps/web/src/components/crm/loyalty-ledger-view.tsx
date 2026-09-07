'use client';

import React, { useState, useMemo } from 'react';
import type { LoyaltyLedgerEntry } from '../../types/pos';
import { formatDateTime } from '../../lib/formatters';
import {
  Coins,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  Download,
} from 'lucide-react';

interface LoyaltyLedgerViewProps {
  entries: LoyaltyLedgerEntry[];
  isLoading: boolean;
}

export function LoyaltyLedgerView({
  entries,
  isLoading,
}: LoyaltyLedgerViewProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const matchSearch =
        (e.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.invoice_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.notes || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchType = typeFilter === 'ALL' || e.transaction_type === typeFilter;

      return matchSearch && matchType;
    });
  }, [entries, searchQuery, typeFilter]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalEarned = entries
      .filter((e) => e.points_change > 0)
      .reduce((sum, e) => sum + e.points_change, 0);
    const totalRedeemed = entries
      .filter((e) => e.points_change < 0)
      .reduce((sum, e) => sum + Math.abs(e.points_change), 0);

    return { totalEarned, totalRedeemed };
  }, [entries]);

  // CSV Export
  const handleExportCsv = () => {
    const headers = [
      'Waktu',
      'Pelanggan',
      'Tipe Transaksi',
      'Mutasi Poin',
      'Saldo Akhir',
      'No Faktur',
      'Cabang',
      'Keterangan',
    ];
    const rows = filteredEntries.map((e) => [
      e.created_at,
      e.customer_name || '-',
      e.transaction_type,
      e.points_change,
      e.points_balance_after,
      e.invoice_number || '-',
      e.outlet_name || '-',
      `"${(e.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `loyalty_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Total Mutasi</span>
            <Coins className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-black text-slate-900 mt-2">
            {entries.length.toLocaleString('id-ID')} Baris
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Audit mutasi poin reward</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 uppercase">Poin Diberikan (Earned)</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-700 mt-2 font-mono">
            +{stats.totalEarned.toLocaleString('id-ID')} Pts
          </div>
          <div className="text-[11px] text-emerald-600 mt-1">Diberikan dari belanja kasir</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-600 uppercase">Poin Ditukarkan (Redeemed)</span>
            <ArrowDownLeft className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-xl font-black text-red-700 mt-2 font-mono">
            -{stats.totalRedeemed.toLocaleString('id-ID')} Pts
          </div>
          <div className="text-[11px] text-red-600 mt-1">Digunakan memotong nota POS</div>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari pelanggan, no faktur, keterangan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
            {['ALL', 'EARN', 'REDEEM', 'MANUAL_ADJUSTMENT'].map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  typeFilter === type
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {type === 'ALL' ? 'Semua' : type}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleExportCsv}
          className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Ekspor CSV</span>
        </button>
      </div>

      {/* 3. Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Waktu Transaksi</th>
                <th className="px-5 py-3.5">Pelanggan</th>
                <th className="px-5 py-3.5">Cabang</th>
                <th className="px-5 py-3.5">Tipe</th>
                <th className="px-5 py-3.5 text-right">Perubahan Poin</th>
                <th className="px-5 py-3.5 text-right">Saldo Akhir</th>
                <th className="px-5 py-3.5">Faktur POS / Referensi</th>
                <th className="px-5 py-3.5">Keterangan Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    Memuat buku besar poin loyalitas...
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    Belum ada riwayat mutasi poin tercatat.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px]">
                      {formatDateTime(e.created_at)}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-900">
                      {e.customer_name || 'Pelanggan'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {e.outlet_name || 'Pusat'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          e.transaction_type === 'EARN'
                            ? 'bg-emerald-100 text-emerald-800'
                            : e.transaction_type === 'REDEEM'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {e.transaction_type}
                      </span>
                    </td>
                    <td
                      className={`px-5 py-3.5 text-right font-black font-mono ${
                        e.points_change > 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {e.points_change > 0 ? `+${e.points_change}` : e.points_change} Pts
                    </td>
                    <td className="px-5 py-3.5 text-right font-black text-slate-900 font-mono">
                      {e.points_balance_after} Pts
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-700">
                      {e.invoice_number || '-'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-[11px]">
                      {e.notes || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
