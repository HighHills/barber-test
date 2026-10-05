'use client';

import React from 'react';
import type { CommissionRuleView } from '../../types/pos';
import { formatCurrency } from '../../lib/formatters';
import {
  Sliders,
  Plus,
  Trash2,
  Store,
  Scissors,
  Package,
  User,
  Sparkles,
} from 'lucide-react';

interface CommissionRulesManagerProps {
  rules: CommissionRuleView[];
  canManageCommissions: boolean;
  onOpenCreateModal: () => void;
  onToggleActive: (ruleId: string, currentActive: boolean) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
}

export function CommissionRulesManager({
  rules,
  canManageCommissions,
  onOpenCreateModal,
  onToggleActive,
  onDeleteRule,
}: CommissionRulesManagerProps): React.JSX.Element {
  return (
    <div className="space-y-6">
      {/* 1. 8-Tier Architecture Info Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-md">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-slate-950 rounded-xl font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">
                Mesin Resolusi Aturan Komisi 8-Tier (*8-Tier Rules Engine*)
              </h3>
              <p className="text-xs text-slate-400">
                Prioritas kalkulasi bertingkat saat transaksi POS kasir diproses
              </p>
            </div>
          </div>
          {canManageCommissions && <button
            onClick={onOpenCreateModal}
            className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Aturan Baru</span>
          </button>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px]">
          <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-amber-400 font-bold block">Tier 1 (Prioritas Tertinggi)</span>
            <span className="text-slate-300 font-medium">Kapster + Layanan + Cabang</span>
          </div>
          <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-amber-400 font-bold block">Tier 2</span>
            <span className="text-slate-300 font-medium">Kapster + Layanan Global</span>
          </div>
          <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-amber-400 font-bold block">Tier 3</span>
            <span className="text-slate-300 font-medium">Kapster + Cabang Outlet</span>
          </div>
          <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-amber-400 font-bold block">Tier 4</span>
            <span className="text-slate-300 font-medium">Default Perorangan Kapster</span>
          </div>
          <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-amber-400 font-bold block">Tier 5</span>
            <span className="text-slate-300 font-medium">Layanan + Cabang Outlet</span>
          </div>
          <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-amber-400 font-bold block">Tier 6</span>
            <span className="text-slate-300 font-medium">Default Layanan Global</span>
          </div>
          <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-amber-400 font-bold block">Tier 7</span>
            <span className="text-slate-300 font-medium">Default Cabang Outlet</span>
          </div>
          <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-amber-400 font-bold block">Tier 8 (Fallback)</span>
            <span className="text-slate-300 font-medium">Standar Bisnis Global</span>
          </div>
        </div>
      </div>

      {/* 2. Active Rules Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">
              Daftar Konfigurasi Aturan Komisi ({rules.length})
            </h3>
          </div>
        </div>

        {rules.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
            <Sliders className="w-12 h-12 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-semibold text-slate-700">Belum Ada Aturan Komisi</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Klik tombol &ldquo;Tambah Aturan Baru&rdquo; untuk menetapkan persentase komisi bagi kapster atau layanan.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Tier</th>
                  <th className="py-2.5 px-3">Kapster</th>
                  <th className="py-2.5 px-3">Item Layanan / Produk</th>
                  <th className="py-2.5 px-3">Cabang Outlet</th>
                  <th className="py-2.5 px-3">Besaran Komisi</th>
                  <th className="py-2.5 px-3">Masa Berlaku</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full font-black text-[10px] bg-slate-900 text-amber-400">
                        Tier {r.tier}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900">
                      {r.employee_name ? (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{r.employee_name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Semua Kapster</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      {r.service_name ? (
                        <div className="flex items-center gap-1.5">
                          <Scissors className="w-3.5 h-3.5 text-blue-500" />
                          <span>{r.service_name}</span>
                        </div>
                      ) : r.product_name ? (
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-amber-500" />
                          <span>{r.product_name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Semua Item</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {r.outlet_name ? (
                        <div className="flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5 text-slate-400" />
                          <span>{r.outlet_name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Semua Cabang</span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">
                      {r.commission_type === 'PERCENTAGE' ? (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          {r.commission_rate}%
                        </span>
                      ) : (
                        <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          {formatCurrency(r.fixed_amount || 0)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-500 text-[11px]">
                      {r.effective_from}
                      {r.effective_until ? ` s/d ${r.effective_until}` : ' (Seterusnya)'}
                    </td>
                    <td className="py-3 px-3">
                      {canManageCommissions ? <button
                        onClick={() => onToggleActive(r.id, r.is_active)}
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] transition-colors cursor-pointer ${
                          r.is_active
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                        title="Klik untuk ubah status aktif"
                      >
                        {r.is_active ? '● Aktif' : '○ Non-aktif'}
                      </button> : <span className="text-[10px] text-slate-400">Lihat saja</span>}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {canManageCommissions && <button
                        onClick={() => onDeleteRule(r.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Hapus Aturan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
