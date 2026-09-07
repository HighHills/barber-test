'use client';

import React, { useState } from 'react';
import type { CustomerTierView } from '../../types/pos';
import { formatCurrency } from '../../lib/formatters';
import {
  Crown,
  Sparkles,
  Shield,
  Award,
  Coins,
  CheckCircle2,
  Edit2,
  Loader2,
  Save,
  X,
} from 'lucide-react';

interface TierConfigPanelProps {
  tiers: CustomerTierView[];
  customerCountByTier: Record<string, number>;
  onUpdateTier: (tierData: CustomerTierView) => Promise<void>;
  isUpdating: boolean;
}

export function TierConfigPanel({
  tiers,
  customerCountByTier,
  onUpdateTier,
  isUpdating,
}: TierConfigPanelProps): React.JSX.Element {
  const [editingTier, setEditingTier] = useState<CustomerTierView | null>(null);

  const getTierIcon = (iconName: string) => {
    switch (iconName) {
      case 'Sparkles':
        return <Sparkles className="w-5 h-5 text-purple-400" />;
      case 'Crown':
        return <Crown className="w-5 h-5 text-amber-400" />;
      case 'Shield':
        return <Shield className="w-5 h-5 text-sky-400" />;
      default:
        return <Award className="w-5 h-5 text-slate-400" />;
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTier) return;
    await onUpdateTier(editingTier);
    setEditingTier(null);
  };

  return (
    <div className="space-y-6">
      {/* 1. Rule Summary Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              Sistem Loyalitas Terpadu (4-Tier Progression Engine)
            </div>
            <h2 className="text-xl font-black text-white mt-1">
              Struktur Tingkatan Membership & Pengganda Poin
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Pelanggan secara otomatis naik pangkat saat akumulasi belanja atau jumlah kunjungan memenuhi ambang batas. Seluruh diskon dan poin diterapkan seketika pada layar kasir Web POS.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15 space-y-1 text-xs">
            <div className="font-bold text-amber-400 flex items-center gap-1.5">
              <Coins className="w-4 h-4" />
              Formula Poin Loyalitas:
            </div>
            <div className="text-slate-200">
              <span className="font-mono font-bold">1 Poin</span> per{' '}
              <span className="font-mono font-bold">Rp 10.000</span> belanja bersih ×{' '}
              <span className="text-amber-400 font-bold">Multiplier Tier</span>
            </div>
            <div className="text-slate-300 text-[11px]">
              Nilai Penukaran: <span className="font-bold text-emerald-400">1 Pts = Rp 100</span> potongan nota kasir
            </div>
          </div>
        </div>
      </div>

      {/* 2. 4-Tier Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiers.map((tier) => {
          const count = customerCountByTier[tier.code] || 0;
          const isHighest = tier.code === 'PLATINUM';

          return (
            <div
              key={tier.id}
              className={`bg-white rounded-3xl border ${
                isHighest ? 'border-purple-300 ring-2 ring-purple-100' : 'border-slate-200'
              } p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-all`}
            >
              {/* Card Header */}
              <div>
                <div className="flex items-center justify-between">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-2xs"
                    style={{ backgroundColor: tier.color_hex }}
                  >
                    {getTierIcon(tier.badge_icon)}
                  </div>

                  <button
                    onClick={() => setEditingTier({ ...tier })}
                    className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                    title="Edit Aturan Tier"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-3">
                  <h3 className="text-base font-black text-slate-900">{tier.name}</h3>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    Kode: {tier.code}
                  </div>
                </div>

                {/* Member Count Badge */}
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">
                  <span>{count} Pelanggan Aktif</span>
                </div>
              </div>

              {/* Thresholds & Benefits */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100 text-xs">
                {/* Requirements */}
                <div className="bg-slate-50 p-2.5 rounded-xl space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">
                    Syarat Kenaikan Tier:
                  </div>
                  <div className="font-black text-slate-800 font-mono">
                    {tier.min_spending > 0 ? formatCurrency(tier.min_spending) : 'Rp 0 (Dasar)'}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    atau minimal {tier.min_visits}x kunjungan
                  </div>
                </div>

                {/* Discounts */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Diskon Jasa Pangkas</span>
                    <span className="font-black text-emerald-600 font-mono">
                      {tier.discount_percent_service}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Diskon Produk Retail</span>
                    <span className="font-black text-emerald-600 font-mono">
                      {tier.discount_percent_product}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Multiplier Perolehan Poin</span>
                    <span className="font-black text-amber-600 font-mono">
                      {tier.points_multiplier}x
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Status Aktif
                </span>
                <span className="font-mono text-[10px]">{tier.color_hex}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Tier Modal */}
      {editingTier && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-sm">
                Konfigurasi Tingkatan: {editingTier.name}
              </h3>
              <button
                onClick={() => setEditingTier(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Nama Tingkatan</label>
                <input
                  type="text"
                  required
                  value={editingTier.name}
                  onChange={(e) => setEditingTier({ ...editingTier, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Min. Belanja (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    value={editingTier.min_spending}
                    onChange={(e) =>
                      setEditingTier({ ...editingTier, min_spending: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Min. Kunjungan
                  </label>
                  <input
                    type="number"
                    required
                    value={editingTier.min_visits}
                    onChange={(e) =>
                      setEditingTier({ ...editingTier, min_visits: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Diskon Jasa (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={editingTier.discount_percent_service}
                    onChange={(e) =>
                      setEditingTier({
                        ...editingTier,
                        discount_percent_service: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Diskon Produk (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={editingTier.discount_percent_product}
                    onChange={(e) =>
                      setEditingTier({
                        ...editingTier,
                        discount_percent_product: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Multiplier Poin (x)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={editingTier.points_multiplier}
                    onChange={(e) =>
                      setEditingTier({
                        ...editingTier,
                        points_multiplier: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Warna Hex
                  </label>
                  <input
                    type="text"
                    required
                    value={editingTier.color_hex}
                    onChange={(e) =>
                      setEditingTier({ ...editingTier, color_hex: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTier(null)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isUpdating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Simpan Aturan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
