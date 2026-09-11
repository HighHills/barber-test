'use client';

import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import type { ServiceItem, ServiceCategoryItem, OutletItem } from '../../types/settings';
import {
  X,
  Scissors,
  Store,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Coins,
} from 'lucide-react';

interface ServiceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: ServiceItem | null;
  categories: ServiceCategoryItem[];
  outlets: OutletItem[];
  onSuccess: () => void;
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

interface OutletPriceState {
  outlet_id: string;
  selling_price: string;
  is_active: boolean;
}

export function ServiceFormModal({
  isOpen,
  onClose,
  service,
  categories,
  outlets,
  onSuccess,
  onNotification,
}: ServiceFormModalProps): React.JSX.Element | null {
  const { supabase, refreshData } = usePos();
  const isEditing = Boolean(service);

  // Form states
  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [defaultCostPrice, setDefaultCostPrice] = useState<string>('0');
  const [description, setDescription] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  // Outlet pricing matrix
  const [outletPrices, setOutletPrices] = useState<Record<string, OutletPriceState>>({});

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize form state
  useEffect(() => {
    if (service) {
      setCode(service.code || '');
      setName(service.name || '');
      setCategoryId(service.category_id || categories[0]?.id || '');
      setDurationMinutes(service.duration_minutes || 30);
      setDefaultCostPrice(service.default_cost_price?.toString() || '0');
      setDescription(service.description || '');
      setIsActive(service.is_active !== false);

      // Map existing outlet prices
      const priceMap: Record<string, OutletPriceState> = {};
      outlets.forEach((o) => {
        const assigned = service.service_outlets?.find((so) => so.outlet_id === o.id);
        priceMap[o.id] = {
          outlet_id: o.id,
          selling_price: assigned ? assigned.selling_price.toString() : '50000',
          is_active: assigned ? assigned.is_active : true,
        };
      });
      setOutletPrices(priceMap);
    } else {
      setCode('');
      setName('');
      setCategoryId(categories[0]?.id || '');
      setDurationMinutes(30);
      setDefaultCostPrice('0');
      setDescription('');
      setIsActive(true);

      // Default price for each outlet
      const priceMap: Record<string, OutletPriceState> = {};
      outlets.forEach((o) => {
        priceMap[o.id] = {
          outlet_id: o.id,
          selling_price: '50000',
          is_active: true,
        };
      });
      setOutletPrices(priceMap);
    }
    setFormError(null);
  }, [service, categories, outlets, isOpen]);

  if (!isOpen) return null;

  const handlePriceChange = (outletId: string, price: string) => {
    setOutletPrices((prev) => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        selling_price: price,
      },
    }));
  };

  const handleOutletActiveToggle = (outletId: string) => {
    setOutletPrices((prev) => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        is_active: !prev[outletId].is_active,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();

    // Frontend validations
    if (!trimmedCode) {
      setFormError('Kode Layanan wajib diisi.');
      return;
    }
    if (!trimmedName) {
      setFormError('Nama Layanan wajib diisi.');
      return;
    }
    if (!categoryId) {
      setFormError('Pilih kategori layanan.');
      return;
    }
    if (durationMinutes <= 0) {
      setFormError('Durasi layanan harus lebih besar dari 0 menit.');
      return;
    }

    const costNum = parseFloat(defaultCostPrice) || 0;
    if (costNum < 0) {
      setFormError('Default cost price tidak boleh bernilai negatif.');
      return;
    }

    // Validate outlet prices
    for (const o of outlets) {
      const pState = outletPrices[o.id];
      const pNum = parseFloat(pState?.selling_price || '0');
      if (isNaN(pNum) || pNum < 0) {
        setFormError(`Harga jual pada cabang "${o.name}" tidak valid.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const p_service_id = service ? service.id : null;

      // 1. Call save_service RPC
      const { data: savedServiceId, error: srvErr } = await supabase.rpc('save_service', {
        p_service_id,
        p_category_id: categoryId,
        p_code: trimmedCode,
        p_name: trimmedName,
        p_description: description.trim() || null,
        p_duration_minutes: durationMinutes,
        p_default_cost_price: costNum,
        p_is_active: isActive,
      });

      if (srvErr) throw srvErr;

      // Resolve target service id
      const targetServiceId = (savedServiceId as string) || service?.id;

      // 2. Save each outlet's price via save_service_outlet RPC
      if (targetServiceId) {
        for (const o of outlets) {
          const pState = outletPrices[o.id];
          const sPrice = parseFloat(pState?.selling_price || '0') || 0;
          const sActive = pState?.is_active ?? true;

          const { error: soErr } = await supabase.rpc('save_service_outlet', {
            p_service_id: targetServiceId,
            p_outlet_id: o.id,
            p_selling_price: sPrice,
            p_is_active: sActive,
          });

          if (soErr) throw soErr;
        }
      }

      onNotification?.({
        type: 'SUCCESS',
        message: isEditing
          ? `Layanan "${trimmedName}" berhasil diperbarui!`
          : `Layanan "${trimmedName}" berhasil ditambahkan ke katalog!`,
      });

      await refreshData();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('save_service error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan layanan.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {isEditing ? 'Ubah Layanan Jasa' : 'Tambah Layanan Jasa Baru'}
              </h2>
              <p className="text-xs text-slate-400">
                Konfigurasi durasi, kategori, dan matriks harga tiap cabang
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {formError && (
            <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-red-300 flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Core Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Code */}
            <div className="space-y-1.5">
              <label className="block text-slate-300 font-semibold">
                Kode Layanan <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="CONTOH: HC-REGULAR"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 transition text-xs"
              />
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <label className="block text-slate-300 font-semibold">
                Nama Layanan <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Gentlemen Classic Haircut"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition text-xs"
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="block text-slate-300 font-semibold">
                Kategori <span className="text-red-400">*</span>
              </label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
              >
                <option value="" disabled>
                  -- Pilih Kategori --
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <label className="block text-slate-300 font-semibold">
                Durasi Pengerjaan (Menit) <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Clock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  min={1}
                  required
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 1)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
                />
              </div>
            </div>

            {/* Default Cost Price */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-slate-300 font-semibold">
                Estimasi Biaya Dasar (Default Cost Price / HPP)
              </label>
              <div className="relative">
                <Coins className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  min={0}
                  step="500"
                  value={defaultCostPrice}
                  onChange={(e) => setDefaultCostPrice(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
                />
              </div>
              <p className="text-[10px] text-slate-500">
                Nilai acuan HPP layanan untuk laporan margin kotor (opsional, default 0).
              </p>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-semibold">Deskripsi Layanan</label>
            <textarea
              rows={2}
              placeholder="Deskripsi langkah atau fasilitas yang didapatkan pelanggan..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition text-xs resize-none"
            />
          </div>

          {/* Active Toggle */}
          <div className="pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
              />
              <span className="text-slate-300 font-medium">
                Layanan Aktif (Tampil di kasir POS dan pemesanan publik)
              </span>
            </label>
          </div>

          {/* Outlet Pricing Matrix */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-amber-400" />
                  <span>Matriks Harga Tiap Cabang Outlet</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Tentukan tarif harga jual dan status ketersediaan pada masing-masing cabang
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {outlets.map((o) => {
                const pState = outletPrices[o.id] || {
                  outlet_id: o.id,
                  selling_price: '50000',
                  is_active: true,
                };

                return (
                  <div
                    key={o.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">{o.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{o.code}</div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 text-xs font-medium">Rp</span>
                        <input
                          type="number"
                          min={0}
                          step="1000"
                          value={pState.selling_price}
                          onChange={(e) => handlePriceChange(o.id, e.target.value)}
                          className="w-28 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-right text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          checked={pState.is_active}
                          onChange={() => handleOutletActiveToggle(o.id)}
                          className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                        />
                        <span>Aktif</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold shadow-md shadow-amber-500/20 transition disabled:opacity-50 text-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Perbarui Layanan' : 'Simpan Layanan'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
