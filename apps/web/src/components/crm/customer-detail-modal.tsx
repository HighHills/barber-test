'use client';

import React, { useState } from 'react';
import type {
  CustomerDetailCRM,
  CustomerTierView,
  LoyaltyLedgerEntry,
  HaircutHistoryEntry,
} from '../../types/pos';
import { formatCurrency, formatDateTime } from '../../lib/formatters';
import {
  X,
  Crown,
  Sparkles,
  Phone,
  Mail,
  Calendar,
  Coins,
  Scissors,
  ShoppingBag,
  Plus,
  Loader2,
} from 'lucide-react';

interface CustomerDetailModalProps {
  customer: CustomerDetailCRM | null;
  tiers: CustomerTierView[];
  haircutHistory: HaircutHistoryEntry[];
  loyaltyLedger: LoyaltyLedgerEntry[];
  salesHistory: Array<{
    id: string;
    invoice_number: string;
    created_at: string;
    total_amount: number;
    status: string;
    items_count: number;
  }>;
  onClose: () => void;
  onSaveHaircutRecord: (record: {
    barber_id: string;
    style_name: string;
    clipper_guard_sides?: string;
    clipper_guard_top?: string;
    styling_product_used?: string;
    special_notes?: string;
  }) => Promise<void>;
  onAdjustPoints: (points: number, reason: string) => Promise<void>;
  onOpenMemberCard: (customerId: string) => Promise<void>;
  isSubmitting: boolean;
  barbers: Array<{ id: string; full_name: string }>;
}

export function CustomerDetailModal({
  customer,
  tiers,
  haircutHistory,
  loyaltyLedger,
  salesHistory,
  onClose,
  onSaveHaircutRecord,
  onAdjustPoints,
  onOpenMemberCard,
  isSubmitting,
  barbers,
}: CustomerDetailModalProps): React.JSX.Element | null {
  const [activeTab, setActiveTab] = useState<'HAIRCUTS' | 'LOYALTY' | 'TRANSACTIONS'>('HAIRCUTS');

  // Form state for new haircut record
  const [showAddHaircut, setShowAddHaircut] = useState(false);
  const [hcBarberId, setHcBarberId] = useState(barbers[0]?.id || '');
  const [hcStyleName, setHcStyleName] = useState('');
  const [hcSides, setHcSides] = useState('');
  const [hcTop, setHcTop] = useState('');
  const [hcProduct, setHcProduct] = useState('');
  const [hcNotes, setHcNotes] = useState('');

  // Form state for point adjustment
  const [showAdjustPoints, setShowAdjustPoints] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState<number>(50);
  const [adjustReason, setAdjustReason] = useState('Bonus loyalitas apresiasi pelanggan');

  if (!customer) return null;

  // Find next tier for progression bar
  const currentTierIndex = customer.tier_code
    ? tiers.findIndex((t) => t.code === customer.tier_code)
    : -1;
  const nextTier =
    currentTierIndex !== -1 && currentTierIndex < tiers.length - 1
      ? tiers[currentTierIndex + 1]
      : currentTierIndex === -1 && tiers.length > 0
      ? tiers[0]
      : null;

  const spendingNeeded = nextTier
    ? Math.max(0, nextTier.min_spending - (customer.total_spending || 0))
    : 0;
  const visitsNeeded = nextTier
    ? Math.max(0, nextTier.min_visits - (customer.total_visits || 0))
    : 0;

  // Calculate percentage to next tier
  const progressPercent = nextTier
    ? Math.min(
        100,
        Math.max(
          nextTier.min_spending > 0
            ? ((customer.total_spending || 0) / nextTier.min_spending) * 100
            : 0,
          nextTier.min_visits > 0
            ? ((customer.total_visits || 0) / nextTier.min_visits) * 100
            : 0
        )
      )
    : 100;

  const handleCreateHaircut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hcStyleName.trim()) return;
    await onSaveHaircutRecord({
      barber_id: hcBarberId,
      style_name: hcStyleName.trim(),
      clipper_guard_sides: hcSides.trim() || undefined,
      clipper_guard_top: hcTop.trim() || undefined,
      styling_product_used: hcProduct.trim() || undefined,
      special_notes: hcNotes.trim() || undefined,
    });
    setShowAddHaircut(false);
    setHcStyleName('');
    setHcSides('');
    setHcTop('');
    setHcProduct('');
    setHcNotes('');
  };

  const handleExecuteAdjustPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustAmount || adjustAmount === 0) return;
    await onAdjustPoints(adjustAmount, adjustReason);
    setShowAdjustPoints(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-base shadow-xs shrink-0 ${
                customer.tier_name ? 'text-white' : 'bg-slate-200 text-slate-600'
              }`}
              style={customer.tier_name && customer.tier_color ? { backgroundColor: customer.tier_color } : undefined}
            >
              {(customer.full_name || '')
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase() || 'P'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h3 className="text-lg font-black text-slate-900 break-words [overflow-wrap:anywhere]">
                  {customer.full_name}
                </h3>
                {customer.tier_name ? (
                  <span
                    className="text-[10px] font-black px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 text-white shadow-2xs shrink-0"
                    style={{ backgroundColor: customer.tier_color || '#64748b' }}
                  >
                    <Crown className="w-3 h-3" />
                    <span>{customer.tier_name}</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 bg-slate-200 text-slate-600 border border-slate-300 shrink-0">
                    <span>Belum ditetapkan</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 font-medium mt-0.5 flex-wrap min-w-0">
                <span className="font-mono">{customer.customer_code}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3 shrink-0" />
                  <span>{customer.phone}</span>
                </span>
                {customer.email && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1 break-all">
                      <Mail className="w-3 h-3 shrink-0" />
                      <span>{customer.email}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scroll Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          <button type="button" onClick={() => void onOpenMemberCard(customer.id)} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950">Lihat / Bagikan Kartu Member</button>
          {/* 1. Membership Progression & Loyalty Points Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tier Progress Card */}
            <div className="md:col-span-2 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-4 text-white shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Status Loyalitas Member
                  </span>
                  {nextTier && (
                    <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-slate-300 font-mono">
                      Target: {nextTier.name}
                    </span>
                  )}
                </div>

                <div className="text-xl font-black mt-1">
                  {customer.tier_name || 'Belum ditetapkan'}
                </div>

                <div className="text-xs text-slate-300 mt-0.5">
                  Hak Istimewa:{' '}
                  {customer.tier_name ? (
                    <>
                      {(customer.tier_discount_service || 0) > 0
                        ? `Diskon Jasa ${customer.tier_discount_service}%`
                        : 'Poin Belanja Reguler'}
                      {(customer.tier_discount_product || 0) > 0 &&
                        `, Diskon Produk ${customer.tier_discount_product}%`}
                    </>
                  ) : (
                    'Belum ada hak istimewa (Kumpulkan transaksi untuk meraih tier)'
                  )}
                </div>
              </div>

              {/* Progress Bar to Next Tier */}
              <div className="mt-4 pt-3 border-t border-white/10">
                {nextTier ? (
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1.5">
                      <span>Progres Naik ke {nextTier.name}</span>
                      <span className="font-mono text-amber-400">
                        {Math.round(progressPercent)}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      Butuh belanja {formatCurrency(spendingNeeded)} lagi ATAU {visitsNeeded}x kunjungan lagi.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                    <Crown className="w-4 h-4" />
                    <span>Tingkatan Tertinggi Tercapai (Platinum VIP Royal)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Loyalty Points Card */}
            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex flex-col justify-between shadow-2xs">
              <div>
                <div className="flex items-center justify-between text-amber-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Saldo Poin Aktif
                  </span>
                  <Coins className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-2xl font-black text-amber-900 mt-2 font-mono">
                  {customer.current_loyalty_points.toLocaleString('id-ID')}{' '}
                  <span className="text-xs font-bold text-amber-700">Pts</span>
                </div>
                <div className="text-[11px] text-amber-800 font-semibold mt-1">
                  Nilai Potongan POS:{' '}
                  <span className="font-bold text-emerald-700">
                    {formatCurrency(customer.current_loyalty_points * 100)}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-amber-200/70 flex items-center justify-between">
                <span className="text-[10px] text-amber-700">
                  Akumulasi: {customer.lifetime_loyalty_points} Pts
                </span>
                <button
                  onClick={() => setShowAdjustPoints(true)}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] transition-colors cursor-pointer"
                >
                  Koreksi Poin
                </button>
              </div>
            </div>
          </div>

          {/* 2. Haircut Preference Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-black text-slate-900 text-xs">
                <Scissors className="w-4 h-4 text-amber-500" />
                <span>Kartu Preferensi Pangkas Rambut Pelanggan</span>
              </div>
              {customer.preferred_barber_name && (
                <span className="text-[11px] font-bold text-slate-700 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">
                  Barber Langganan: {customer.preferred_barber_name}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                <div className="text-slate-400 font-semibold">Tipe Fade / Samping</div>
                <div className="font-bold text-slate-800 mt-0.5">
                  {customer.haircut_preferences?.fade_style || 'Mid Taper Fade'}
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                <div className="text-slate-400 font-semibold">Sepatu Clipper Samping</div>
                <div className="font-bold text-slate-800 mt-0.5">
                  {customer.haircut_preferences?.clipper_guard_sides || '#1.5 / #2'}
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                <div className="text-slate-400 font-semibold">Gunting / Bagian Atas</div>
                <div className="font-bold text-slate-800 mt-0.5">
                  {customer.haircut_preferences?.clipper_guard_top || 'Textured Crop ~3cm'}
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                <div className="text-slate-400 font-semibold">Produk Styling Pilihan</div>
                <div className="font-bold text-slate-800 mt-0.5">
                  {customer.haircut_preferences?.styling_product || 'Matte Clay Pomade'}
                </div>
              </div>
            </div>

            {customer.haircut_preferences?.scalp_notes && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl px-3 py-2 text-[11px] text-amber-800 font-medium">
                <span className="font-bold">Catatan Khusus Kulit Kepala:</span>{' '}
                {customer.haircut_preferences.scalp_notes}
              </div>
            )}
          </div>

          {/* 3. Tab Navigation */}
          <div className="border-b border-slate-200 flex items-center gap-2">
            <button
              onClick={() => setActiveTab('HAIRCUTS')}
              className={`pb-2.5 px-2 font-black text-xs border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'HAIRCUTS'
                  ? 'border-amber-500 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Riwayat Pangkas ({haircutHistory.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('LOYALTY')}
              className={`pb-2.5 px-2 font-black text-xs border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'LOYALTY'
                  ? 'border-amber-500 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Mutasi Poin Loyalitas ({loyaltyLedger.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('TRANSACTIONS')}
              className={`pb-2.5 px-2 font-black text-xs border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'TRANSACTIONS'
                  ? 'border-amber-500 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Riwayat Belanja Nota ({salesHistory.length})</span>
            </button>
          </div>

          {/* TAB 1: HAIRCUTS HISTORY */}
          {activeTab === 'HAIRCUTS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-600 text-xs">
                  Catatan model pangkas setiap kunjungan kapster
                </span>
                <button
                  onClick={() => setShowAddHaircut(true)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Catat Gaya Baru</span>
                </button>
              </div>

              {/* Add Haircut Inline Form */}
              {showAddHaircut && (
                <form
                  onSubmit={handleCreateHaircut}
                  className="bg-slate-50 border border-slate-300 rounded-2xl p-4 space-y-3 animate-in fade-in duration-150"
                >
                  <div className="font-bold text-slate-900 text-xs flex items-center justify-between">
                    <span>Catat Gaya Rambut Kunjungan Ini</span>
                    <button
                      type="button"
                      onClick={() => setShowAddHaircut(false)}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Kapster yang Melayani
                      </label>
                      <select
                        value={hcBarberId}
                        onChange={(e) => setHcBarberId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                      >
                        {barbers.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.full_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Nama Model / Gaya Pangkas *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Contoh: Low Fade Pompadour"
                        value={hcStyleName}
                        onChange={(e) => setHcStyleName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Sepatu Clipper Samping / Belakang
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: #1 bawah ke #2 atas"
                        value={hcSides}
                        onChange={(e) => setHcSides(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Panjang / Teknik Atas
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Gunting rapikan 2cm texture"
                        value={hcTop}
                        onChange={(e) => setHcTop(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Produk Styling yang Dipakai
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Matte Paste & Sea Salt Spray"
                        value={hcProduct}
                        onChange={(e) => setHcProduct(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Catatan Khusus / Reaksi Kulit
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Jangan pakai alkohol di tengkuk"
                        value={hcNotes}
                        onChange={(e) => setHcNotes(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Simpan Catatan Gaya</span>
                    </button>
                  </div>
                </form>
              )}

              {/* History List */}
              {haircutHistory.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                  Belum ada catatan gaya pangkas untuk pelanggan ini.
                </div>
              ) : (
                <div className="space-y-3">
                  {haircutHistory.map((h) => (
                    <div
                      key={h.id}
                      className="bg-white border border-slate-200 p-4 rounded-2xl hover:border-slate-300 transition-colors shadow-2xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
                          <Scissors className="w-4 h-4 text-amber-500" />
                          <span>{h.style_name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{h.visit_date}</span>
                          <span>•</span>
                          <span className="font-bold text-slate-700">
                            Kapster: {h.barber_name}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-1">
                        {h.clipper_guard_sides && (
                          <div className="text-slate-600">
                            <span className="font-bold text-slate-700">Samping:</span>{' '}
                            {h.clipper_guard_sides}
                          </div>
                        )}
                        {h.clipper_guard_top && (
                          <div className="text-slate-600">
                            <span className="font-bold text-slate-700">Atas:</span>{' '}
                            {h.clipper_guard_top}
                          </div>
                        )}
                        {h.styling_product_used && (
                          <div className="text-slate-600">
                            <span className="font-bold text-slate-700">Produk:</span>{' '}
                            {h.styling_product_used}
                          </div>
                        )}
                      </div>

                      {h.special_notes && (
                        <div className="text-[10px] text-amber-800 bg-amber-50/70 px-2.5 py-1.5 rounded-lg">
                          {h.special_notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LOYALTY POINTS LEDGER */}
          {activeTab === 'LOYALTY' && (
            <div className="space-y-4">
              {/* Adjust Points Inline Form */}
              {showAdjustPoints && (
                <form
                  onSubmit={handleExecuteAdjustPoints}
                  className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-3 animate-in fade-in duration-150"
                >
                  <div className="font-bold text-amber-950 text-xs flex items-center justify-between">
                    <span>Penyesuaian Manual Poin Pelanggan</span>
                    <button
                      type="button"
                      onClick={() => setShowAdjustPoints(false)}
                      className="text-amber-600 hover:text-amber-800 cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-amber-900 font-semibold mb-1">
                        Perubahan Poin (+ Tambah, - Kurangi)
                      </label>
                      <input
                        type="number"
                        required
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-amber-900 font-semibold mb-1">
                        Alasan / Keterangan Audit
                      </label>
                      <input
                        type="text"
                        required
                        value={adjustReason}
                        onChange={(e) => setAdjustReason(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Simpan Penyesuaian Poin</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Loyalty Ledger Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3">Waktu</th>
                      <th className="px-4 py-3">Tipe</th>
                      <th className="px-4 py-3 text-right">Mutasi Poin</th>
                      <th className="px-4 py-3 text-right">Saldo Akhir</th>
                      <th className="px-4 py-3">Faktur / Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {loyaltyLedger.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                          Belum ada catatan mutasi poin untuk pelanggan ini.
                        </td>
                      </tr>
                    ) : (
                      loyaltyLedger.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                            {formatDateTime(l.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                l.transaction_type === 'EARN'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : l.transaction_type === 'REDEEM'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {l.transaction_type}
                            </span>
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-black font-mono ${
                              l.points_change > 0 ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {l.points_change > 0 ? `+${l.points_change}` : l.points_change} Pts
                          </td>
                          <td className="px-4 py-3 text-right font-black text-slate-900 font-mono">
                            {l.points_balance_after} Pts
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {l.invoice_number && (
                              <span className="font-mono font-bold text-slate-800 mr-2">
                                {l.invoice_number}
                              </span>
                            )}
                            <span className="text-[11px] text-slate-500">{l.notes || '-'}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: POS SALES HISTORY */}
          {activeTab === 'TRANSACTIONS' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Tanggal & Waktu</th>
                    <th className="px-4 py-3">No. Faktur</th>
                    <th className="px-4 py-3 text-center">Jumlah Item</th>
                    <th className="px-4 py-3 text-right">Total Belanja</th>
                    <th className="px-4 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {salesHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        Belum ada riwayat transaksi belanja.
                      </td>
                    </tr>
                  ) : (
                    salesHistory.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                          {formatDateTime(s.created_at)}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          {s.invoice_number}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-700">
                          {s.items_count} item
                        </td>
                        <td className="px-4 py-3 text-right font-black text-slate-900 font-mono">
                          {formatCurrency(s.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-100 text-emerald-800">
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
