'use client';

import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import type {
  ServiceItem,
  ServiceCategoryItem,
  OutletItem,
  CatalogOutletPayload,
} from '../../types/settings';
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
    const activeSystemOutlets = outlets.filter((o) => o.is_active !== false);

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
      activeSystemOutlets.forEach((o) => {
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
      activeSystemOutlets.forEach((o) => {
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

  // Escape key listener for keyboard accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

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
      setFormError('Estimasi biaya dasar (HPP) tidak boleh bernilai negatif.');
      return;
    }

    // Filter to active system outlets where the outlet is marked active in the modal
    const activeSystemOutlets = outlets.filter((o) => o.is_active !== false);
    const selectedOutlets = activeSystemOutlets.filter((o) => outletPrices[o.id]?.is_active);

    if (selectedOutlets.length === 0) {
      setFormError('Pilih dan aktifkan minimal satu cabang outlet untuk layanan ini.');
      return;
    }

    // Validate outlet prices
    for (const o of selectedOutlets) {
      const pState = outletPrices[o.id];
      const pNum = parseFloat(pState?.selling_price || '0');
      if (isNaN(pNum) || pNum < 0) {
        setFormError(`Harga jual pada cabang "${o.name}" tidak valid (minimal Rp 0).`);
        return;
      }
    }

    const outletsPayload: CatalogOutletPayload[] = selectedOutlets.map((o) => {
      const pState = outletPrices[o.id];
      return {
        outlet_id: o.id,
        selling_price: parseFloat(pState?.selling_price || '0') || 0,
        is_active: true,
      };
    });

    // Validate no duplicate outlet_id
    const outletIdSet = new Set<string>();
    for (const item of outletsPayload) {
      if (outletIdSet.has(item.outlet_id)) {
        setFormError('Konfigurasi outlet layanan tidak boleh duplikat.');
        return;
      }
      outletIdSet.add(item.outlet_id);
    }

    setIsSubmitting(true);
    try {
      const p_service_id = service ? service.id : null;

      // Single atomic RPC: save_service_catalog_with_outlets
      const { error: rpcErr } = await supabase.rpc(
        'save_service_catalog_with_outlets',
        {
          p_service_id,
          p_category_id: categoryId,
          p_code: trimmedCode,
          p_name: trimmedName,
          p_description: description.trim() || null,
          p_duration_minutes: durationMinutes,
          p_default_cost_price: costNum,
          p_is_active: isActive,
          p_outlets: outletsPayload,
        }
      );

      if (rpcErr) throw rpcErr;

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
      console.error('save_service_catalog_with_outlets error:', err);
      const pgErr = err as { code?: string; message?: string };
      if (pgErr?.code === '23505') {
        setFormError(`Kode layanan "${trimmedCode}" sudah terdaftar. Silakan gunakan kode unik lain.`);
      } else {
        const msg = err instanceof Error ? err.message : 'Gagal menyimpan layanan.';
        setFormError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {isEditing ? 'Ubah Layanan Jasa' : 'Tambah Layanan Jasa Baru'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEditing
                  ? `Perbarui detail paket & matriks tarif cabang untuk ${service?.name}`
                  : 'Daftarkan menu treatment, durasi pengerjaan, dan tarif per cabang'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Tutup modal layanan"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {formError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Section 1: Identitas Layanan */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-2">
              1. Identitas Layanan
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Code */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Kode Layanan <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: HC-REGULAR"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono uppercase placeholder-slate-600 focus:outline-none transition"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Nama Layanan <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Gentlemen Classic Haircut"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition"
                />
              </div>

              {/* Category */}
              <div className="sm:col-span-2">
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Kategori Layanan <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none transition"
                >
                  <option value="" disabled>
                    -- Pilih Kategori Layanan --
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800/80" />

          {/* Section 2: Operasional */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-2">
              2. Operasional
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">
              {/* Duration */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Durasi Pengerjaan (Menit) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Clock className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min={1}
                    required
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none transition"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Digunakan untuk perhitungan interval slot antrean & booking online.
                </p>
              </div>

              {/* Status Operasional Toggle */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Status Ketersediaan Master
                </label>
                <label className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                  <span className={isActive ? 'text-emerald-400 font-semibold text-xs' : 'text-slate-400 text-xs'}>
                    {isActive ? 'Layanan Aktif' : 'Nonaktif'}
                  </span>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[10px] text-slate-500 mt-1">
                  Layanan aktif dapat dipilih di kasir POS dan booking publik.
                </p>
              </div>

              {/* Description */}
              <div className="sm:col-span-2">
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Deskripsi Layanan <span className="text-slate-500 font-normal">(Opsional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Keterangan langkah treatment atau fasilitas yang didapatkan pelanggan..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition resize-none"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800/80" />

          {/* Section 3: Biaya Dasar (HPP) */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-2">
              3. Biaya Dasar (HPP)
            </span>
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">
                Estimasi Biaya Dasar (Default Cost Price / HPP)
              </label>
              <div className="relative">
                <Coins className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  min={0}
                  step="500"
                  value={defaultCostPrice}
                  onChange={(e) => setDefaultCostPrice(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none transition"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Nilai acuan HPP layanan untuk laporan estimasi margin kotor (opsional, bukan harga jual kasir).
              </p>
            </div>
          </div>

          <div className="border-t border-slate-800/80" />

          {/* Section 4: Harga & Ketersediaan Cabang */}
          <div className="space-y-3">
            <div>
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                <Store className="w-3.5 h-3.5 text-amber-400" />
                <span>4. Harga & Ketersediaan Tiap Cabang</span>
              </span>
              <p className="text-[11px] text-slate-400">
                Tentukan tarif harga jual riil dan status aktif menu pada masing-masing cabang barbershop.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden divide-y divide-slate-800/80">
              {outlets.filter((o) => o.is_active !== false).map((o) => {
                const pState = outletPrices[o.id] || {
                  outlet_id: o.id,
                  selling_price: '50000',
                  is_active: true,
                };

                return (
                  <div
                    key={o.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/40 transition"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          {o.code}
                        </span>
                        <span className="font-semibold text-white text-xs truncate">{o.name}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 text-xs font-medium">Rp</span>
                        <input
                          type="number"
                          min={0}
                          step="1000"
                          value={pState.selling_price}
                          onChange={(e) => handlePriceChange(o.id, e.target.value)}
                          className="w-28 bg-slate-900 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-lg px-2.5 py-1.5 text-right text-white font-mono text-xs focus:outline-none transition"
                        />
                      </div>

                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300 select-none">
                        <input
                          type="checkbox"
                          checked={pState.is_active}
                          onChange={() => handleOutletActiveToggle(o.id)}
                          className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                        />
                        <span className={pState.is_active ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                          {pState.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-semibold border border-slate-700/80"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold transition shadow-xs shadow-amber-500/20 disabled:opacity-40 text-xs"
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

