'use client';

import React, { useState } from 'react';
import { usePos } from '../../context/pos-context';
import type { BarberEmployee, CatalogItem } from '../../types/pos';
import {
  X,
  Sliders,
  Percent,
  Coins,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface CommissionRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  services: CatalogItem[];
  products: CatalogItem[];
}

export function CommissionRuleModal({
  isOpen,
  onClose,
  onSuccess,
  services,
  products,
}: CommissionRuleModalProps): React.JSX.Element | null {
  const { supabase, currentOutlet, barbers } = usePos();

  // Scope selectors
  const [targetType, setTargetType] = useState<'SERVICE' | 'PRODUCT' | 'ALL'>('SERVICE');
  const [selectedBarberId, setSelectedBarberId] = useState<string>(''); // empty = all
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [isOutletSpecific, setIsOutletSpecific] = useState<boolean>(true);

  // Commission calculation fields
  const [commissionType, setCommissionType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [commissionRate, setCommissionRate] = useState<string>('30'); // 30%
  const [fixedAmount, setFixedAmount] = useState<string>('20000'); // Rp 20.000
  const [effectiveFrom, setEffectiveFrom] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [effectiveUntil, setEffectiveUntil] = useState<string>('');

  // Status
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Calculate Tier preview
  const hasEmp = Boolean(selectedBarberId);
  const hasItem = targetType === 'SERVICE' ? Boolean(selectedServiceId) : targetType === 'PRODUCT' ? Boolean(selectedProductId) : false;
  const hasOutlet = isOutletSpecific && Boolean(currentOutlet);

  let calculatedTier = 8;
  if (hasEmp && hasItem && hasOutlet) calculatedTier = 1;
  else if (hasEmp && hasItem && !hasOutlet) calculatedTier = 2;
  else if (hasEmp && !hasItem && hasOutlet) calculatedTier = 3;
  else if (hasEmp && !hasItem && !hasOutlet) calculatedTier = 4;
  else if (!hasEmp && hasItem && hasOutlet) calculatedTier = 5;
  else if (!hasEmp && hasItem && !hasOutlet) calculatedTier = 6;
  else if (!hasEmp && !hasItem && hasOutlet) calculatedTier = 7;
  else calculatedTier = 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const rateVal = commissionType === 'PERCENTAGE' ? Number(commissionRate) : null;
      const fixedVal = commissionType === 'FIXED' ? Number(fixedAmount) : null;

      if (commissionType === 'PERCENTAGE' && (rateVal === null || rateVal < 0 || rateVal > 100)) {
        throw new Error('Persentase komisi harus di antara 0% dan 100%.');
      }
      if (commissionType === 'FIXED' && (fixedVal === null || fixedVal < 0)) {
        throw new Error('Nominal komisi tetap tidak boleh negatif.');
      }

      const payload = {
        employee_id: selectedBarberId || null,
        service_id: targetType === 'SERVICE' ? (selectedServiceId || null) : null,
        product_id: targetType === 'PRODUCT' ? (selectedProductId || null) : null,
        outlet_id: isOutletSpecific && currentOutlet ? currentOutlet.id : null,
        commission_type: commissionType,
        commission_rate: rateVal,
        fixed_amount: fixedVal,
        effective_from: effectiveFrom,
        effective_until: effectiveUntil || null,
        priority: calculatedTier,
        is_active: true,
      };

      const { error: insertErr } = await supabase.from('commission_rules').insert(payload);
      if (insertErr) {
        throw new Error(`Gagal menyimpan aturan komisi: ${insertErr.message}`);
      }

      onSuccess(`Aturan komisi (Tier ${calculatedTier}) berhasil ditambahkan dan langsung aktif.`);
      onClose();
    } catch (err: unknown) {
      console.error('Save rule error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Terjadi kegagalan menyimpan aturan komisi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-slate-950 rounded-xl font-bold">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Buat Aturan Komisi Baru</h2>
              <p className="text-xs text-slate-300 font-medium">
                Mesin Aturan Komisi Multi-Tier (Tier 1 s/d 8)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Tier Preview Badge */}
          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold text-amber-950">
                Hierarki: Tier #{calculatedTier}
              </span>
            </div>
            <span className="text-[11px] text-amber-800 font-medium">
              {calculatedTier === 1 && 'Paling Spesifik (Barber + Item + Outlet)'}
              {calculatedTier === 2 && 'Barber + Item Global'}
              {calculatedTier === 3 && 'Barber + Outlet'}
              {calculatedTier === 4 && 'Standar Perorangan Barber'}
              {calculatedTier === 5 && 'Item + Outlet'}
              {calculatedTier === 6 && 'Standar Item Layanan/Produk'}
              {calculatedTier === 7 && 'Standar Cabang Outlet'}
              {calculatedTier === 8 && 'Standar Umum Bisnis (Global Fallback)'}
            </span>
          </div>

          {/* Target Barber */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Kapster / Barber Penerima Komisi
            </label>
            <select
              value={selectedBarberId}
              onChange={(e) => setSelectedBarberId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            >
              <option value="">Semua Kapster (Berlaku Global)</option>
              {barbers.map((b: BarberEmployee) => (
                <option key={b.id} value={b.id}>
                  {b.full_name} ({b.position || 'Kapster'})
                </option>
              ))}
            </select>
          </div>

          {/* Item Category Selection */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setTargetType('SERVICE')}
              className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                targetType === 'SERVICE'
                  ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-2xs font-bold'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Layanan Pangkas
            </button>
            <button
              type="button"
              onClick={() => setTargetType('PRODUCT')}
              className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                targetType === 'PRODUCT'
                  ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-2xs font-bold'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Produk Ritel
            </button>
            <button
              type="button"
              onClick={() => setTargetType('ALL')}
              className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                targetType === 'ALL'
                  ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-2xs font-bold'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Semua Item
            </button>
          </div>

          {/* Service or Product Dropdown */}
          {targetType === 'SERVICE' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Pilih Layanan Pangkas
              </label>
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              >
                <option value="">Semua Layanan Pangkas</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {targetType === 'PRODUCT' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Pilih Produk Ritel
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              >
                <option value="">Semua Produk Ritel</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Outlet Scope Checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="outletScope"
              checked={isOutletSpecific}
              onChange={(e) => setIsOutletSpecific(e.target.checked)}
              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
            />
            <label htmlFor="outletScope" className="text-xs font-medium text-slate-700 cursor-pointer">
              Batasi hanya untuk cabang aktif ({currentOutlet?.name || 'Cabang Ini'})
            </label>
          </div>

          {/* Commission Type & Value */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Bentuk & Besaran Komisi
            </label>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <button
                type="button"
                onClick={() => setCommissionType('PERCENTAGE')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  commissionType === 'PERCENTAGE'
                    ? 'border-amber-500 bg-amber-50/60 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-1 text-amber-700 font-bold text-xs mb-0.5">
                  <Percent className="w-3.5 h-3.5" />
                  <span>Persentase (%)</span>
                </div>
                <p className="text-[11px] text-slate-500">% dari harga neto layanan</p>
              </button>

              <button
                type="button"
                onClick={() => setCommissionType('FIXED')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  commissionType === 'FIXED'
                    ? 'border-amber-500 bg-amber-50/60 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-1 text-amber-700 font-bold text-xs mb-0.5">
                  <Coins className="w-3.5 h-3.5" />
                  <span>Nominal Tetap (Rp)</span>
                </div>
                <p className="text-[11px] text-slate-500">Rupiah tetap per pangkas</p>
              </button>
            </div>

            {commissionType === 'PERCENTAGE' ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Persentase Komisi (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    required
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold bg-white"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">%</span>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nominal Tetap (Rp per Transaksi)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-bold">Rp</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    required
                    value={fixedAmount}
                    onChange={(e) => setFixedAmount(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Effective Dates */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Berlaku Mulai
              </label>
              <input
                type="date"
                required
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Berlaku Sampai (Opsional)
              </label>
              <input
                type="date"
                value={effectiveUntil}
                min={effectiveFrom}
                onChange={(e) => setEffectiveUntil(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Simpan Aturan Komisi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
