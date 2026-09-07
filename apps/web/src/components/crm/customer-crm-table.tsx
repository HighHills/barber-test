'use client';

import React, { useState, useMemo } from 'react';
import type { CustomerDetailCRM, CustomerTierView } from '../../types/pos';
import { formatCurrency, formatDateTime } from '../../lib/formatters';
import {
  Users,
  Search,
  Plus,
  Eye,
  Crown,
  Sparkles,
  Phone,
  Scissors,
  Coins,
} from 'lucide-react';

interface CustomerCrmTableProps {
  customers: CustomerDetailCRM[];
  tiers: CustomerTierView[];
  onViewCustomer: (customer: CustomerDetailCRM) => void;
  onEditCustomer: (customer: CustomerDetailCRM) => void;
  onAddNewCustomer: () => void;
  isLoading: boolean;
}

export function CustomerCrmTable({
  customers,
  tiers,
  onViewCustomer,
  onEditCustomer: _onEditCustomer,
  onAddNewCustomer,
  isLoading,
}: CustomerCrmTableProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');

  // KPI Metrics
  const stats = useMemo(() => {
    const total = customers.length;
    const vipCount = customers.filter(
      (c) => c.tier_code === 'GOLD' || c.tier_code === 'PLATINUM'
    ).length;
    const totalPoints = customers.reduce((sum, c) => sum + (c.current_loyalty_points || 0), 0);
    const totalLtv = customers.reduce((sum, c) => sum + (c.total_spending || 0), 0);
    const avgVisits = total > 0 ? (customers.reduce((sum, c) => sum + (c.total_visits || 0), 0) / total).toFixed(1) : '0';

    return { total, vipCount, totalPoints, totalLtv, avgVisits };
  }, [customers]);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchSearch =
        c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.customer_code.toLowerCase().includes(searchQuery.toLowerCase());

      const matchTier =
        selectedTier === 'ALL' ||
        (c.tier_code || 'BRONZE') === selectedTier;

      return matchSearch && matchTier;
    });
  }, [customers, searchQuery, selectedTier]);

  return (
    <div className="space-y-6">
      {/* 1. KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Pelanggan
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {stats.total.toLocaleString('id-ID')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Rata-rata {stats.avgVisits} kunjungan / orang
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">
              Member VIP (Gold & Plat)
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Crown className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-700 mt-2">
            {stats.vipCount.toLocaleString('id-ID')}
          </div>
          <div className="text-[11px] text-amber-600 mt-1">
            Pelanggan loyal prioritas tinggi
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
              Total Poin Beredar
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Coins className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-2">
            {stats.totalPoints.toLocaleString('id-ID')} Pts
          </div>
          <div className="text-[11px] text-emerald-600 mt-1">
            Setara {formatCurrency(stats.totalPoints * 100)} potongan
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">
              Akumulasi Belanja (LTV)
            </span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-800 mt-2">
            {formatCurrency(stats.totalLtv)}
          </div>
          <div className="text-[11px] text-purple-600 mt-1">
            Nilai pendapatan kotor seluruh pelanggan
          </div>
        </div>
      </div>

      {/* 2. Search, Filter & Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, nomor HP, atau kode pelanggan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-hidden"
            />
          </div>

          {/* Tier Filter Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1 text-xs">
            <button
              onClick={() => setSelectedTier('ALL')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                selectedTier === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Tier ({customers.length})
            </button>
            {tiers.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTier(t.code)}
                className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer ${
                  selectedTier === t.code
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: t.color_hex }}
                />
                <span>{t.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Add Customer Button */}
        <button
          onClick={onAddNewCustomer}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Pelanggan</span>
        </button>
      </div>

      {/* 3. Customer Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Pelanggan</th>
                <th className="px-5 py-3.5">Kontak</th>
                <th className="px-5 py-3.5">Membership</th>
                <th className="px-5 py-3.5 text-center">Kunjungan</th>
                <th className="px-5 py-3.5 text-right">Total Belanja (LTV)</th>
                <th className="px-5 py-3.5 text-right">Poin Loyalitas</th>
                <th className="px-5 py-3.5">Barber Langganan</th>
                <th className="px-5 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    Memuat data direktori pelanggan...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    {searchQuery
                      ? 'Tidak ada pelanggan yang sesuai dengan pencarian.'
                      : 'Belum ada data pelanggan tercatat.'}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => {
                  const tierColor = c.tier_color || '#94a3b8';
                  const initials = c.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Customer Info */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-2xs shrink-0"
                            style={{ backgroundColor: tierColor }}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                              <span>{c.full_name}</span>
                              {c.tier_code === 'PLATINUM' && (
                                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                              )}
                              {c.tier_code === 'GOLD' && (
                                <Crown className="w-3.5 h-3.5 text-amber-500" />
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              {c.customer_code}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-slate-700 font-mono">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{c.phone}</span>
                        </div>
                        {c.email && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {c.email}
                          </div>
                        )}
                      </td>

                      {/* Tier Badge */}
                      <td className="px-5 py-3.5">
                        <span
                          className="text-[10px] font-black px-2.5 py-1 rounded-full inline-flex items-center gap-1 text-white shadow-2xs"
                          style={{ backgroundColor: tierColor }}
                        >
                          <Crown className="w-3 h-3" />
                          <span>{c.tier_name || 'Bronze Member'}</span>
                        </span>
                        {(c.tier_discount_service || 0) > 0 && (
                          <div className="text-[10px] text-emerald-600 font-bold mt-0.5">
                            Diskon Jasa {c.tier_discount_service}%
                          </div>
                        )}
                      </td>

                      {/* Visits Count */}
                      <td className="px-5 py-3.5 text-center">
                        <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg text-xs">
                          {c.total_visits}x
                        </span>
                        {c.last_visit_at && (
                          <div className="text-[10px] text-slate-400 mt-1">
                            {formatDateTime(c.last_visit_at).split(' ')[0]}
                          </div>
                        )}
                      </td>

                      {/* Total Spending */}
                      <td className="px-5 py-3.5 text-right font-black text-slate-900 font-mono">
                        {formatCurrency(c.total_spending || 0)}
                      </td>

                      {/* Loyalty Points */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="font-black text-emerald-600 font-mono flex items-center justify-end gap-1">
                          <Coins className="w-3.5 h-3.5" />
                          <span>{(c.current_loyalty_points || 0).toLocaleString('id-ID')} Pts</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          = {formatCurrency((c.current_loyalty_points || 0) * 100)}
                        </div>
                      </td>

                      {/* Preferred Barber */}
                      <td className="px-5 py-3.5">
                        {c.preferred_barber_name ? (
                          <div className="flex items-center gap-1.5 text-slate-800 font-semibold">
                            <Scissors className="w-3.5 h-3.5 text-amber-500" />
                            <span>{c.preferred_barber_name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => onViewCustomer(c)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600" />
                          <span>Profil 360°</span>
                        </button>
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
