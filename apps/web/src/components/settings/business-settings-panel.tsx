'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { BusinessSettingsFormData } from '../../types/settings';
import {
  Building2,
  Save,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface BusinessSettingsPanelProps {
  onDirtyChange?: (isDirty: boolean) => void;
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

const defaultFormData: BusinessSettingsFormData = {
  business_name: 'Barbershop OS',
  legal_name: '',
  logo_url: '',
  address: '',
  phone: '',
  email: '',
  currency: 'IDR',
  timezone: 'Asia/Jakarta',
  tax_enabled: false,
  tax_rate: 0,
  tax_inclusive: true,
  receipt_header: 'Terima kasih atas kunjungan Anda!',
  receipt_footer: 'Barang/layanan yang sudah dibayar tidak dapat dikembalikan tanpa nota.',
  booking_enabled: true,
  inventory_enabled: true,
  commission_enabled: true,
  finance_enabled: true,
};

export function BusinessSettingsPanel({
  onDirtyChange,
  onNotification,
}: BusinessSettingsPanelProps): React.JSX.Element {
  const { supabase, refreshData } = usePos();

  const [initialData, setInitialData] = useState<BusinessSettingsFormData>(defaultFormData);
  const [formData, setFormData] = useState<BusinessSettingsFormData>(defaultFormData);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // 1. Load Business Settings via SELECT
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setLocalError(null);
    try {
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        const loaded: BusinessSettingsFormData = {
          id: data.id,
          business_name: data.business_name || 'Barbershop OS',
          legal_name: data.legal_name || '',
          logo_url: data.logo_url || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          currency: data.currency || 'IDR',
          timezone: data.timezone || 'Asia/Jakarta',
          tax_enabled: Boolean(data.tax_enabled),
          tax_rate: Number(data.tax_rate) || 0,
          tax_inclusive: data.tax_inclusive !== false,
          receipt_header: data.receipt_header || '',
          receipt_footer: data.receipt_footer || '',
          booking_enabled: data.booking_enabled !== false,
          inventory_enabled: data.inventory_enabled !== false,
          commission_enabled: data.commission_enabled !== false,
          finance_enabled: data.finance_enabled !== false,
        };
        setInitialData(loaded);
        setFormData(loaded);
      } else {
        setInitialData(defaultFormData);
        setFormData(defaultFormData);
      }
    } catch (err: unknown) {
      console.error('Error loading business settings:', err);
      const msg = err instanceof Error ? err.message : 'Gagal memuat informasi bisnis';
      setLocalError(msg);
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, onNotification]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Check dirty state
  const isDirty = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(initialData);
  }, [formData, initialData]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleChange = <K extends keyof BusinessSettingsFormData>(
    field: K,
    value: BusinessSettingsFormData[K]
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // 2. Save Business Settings via RPC (save_business_settings)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.business_name.trim()) {
      setLocalError('Nama bisnis wajib diisi.');
      return;
    }

    setLocalError(null);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.rpc('save_business_settings', {
        p_business_name: formData.business_name.trim(),
        p_legal_name: formData.legal_name.trim() || null,
        p_logo_url: formData.logo_url.trim() || null,
        p_address: formData.address.trim() || null,
        p_phone: formData.phone.trim() || null,
        p_email: formData.email.trim() || null,
        p_currency: formData.currency.trim() || 'IDR',
        p_timezone: formData.timezone || 'Asia/Jakarta',
        p_tax_enabled: formData.tax_enabled,
        p_tax_rate: Number(formData.tax_rate) || 0,
        p_tax_inclusive: formData.tax_inclusive,
        p_receipt_header: formData.receipt_header.trim() || null,
        p_receipt_footer: formData.receipt_footer.trim() || null,
        p_booking_enabled: formData.booking_enabled,
        p_inventory_enabled: formData.inventory_enabled,
        p_commission_enabled: formData.commission_enabled,
        p_finance_enabled: formData.finance_enabled,
      });

      if (error) {
        throw error;
      }

      onNotification?.({
        type: 'SUCCESS',
        message: 'Informasi bisnis & konfigurasi sistem berhasil disimpan!',
      });

      await loadSettings();
      await refreshData();
    } catch (err: unknown) {
      console.error('Error saving business settings:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan informasi bisnis';
      setLocalError(msg);
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        <p className="text-xs text-slate-400">Memuat konfigurasi bisnis...</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-7 space-y-7 shadow-xs">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">
              Informasi Bisnis & Operasional
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Kelola identitas bisnis, aturan transaksi, dan konfigurasi operasional.
            </p>
          </div>
        </div>
      </div>

      {/* Form Container */}
      <form onSubmit={handleSave} className="space-y-7">
        {localError && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{localError}</span>
          </div>
        )}

        {/* SECTION 1: IDENTITAS BISNIS */}
        <section className="space-y-4">
          <div>
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Identitas Bisnis
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Profil resmi usaha untuk identitas nota dan operasional sistem.
            </p>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Nama Bisnis / Brand <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.business_name}
                onChange={(e) => handleChange('business_name', e.target.value)}
                placeholder="Contoh: Barberking Premium"
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nama Badan Usaha / Legal (Opsional)
                </label>
                <input
                  type="text"
                  value={formData.legal_name}
                  onChange={(e) => handleChange('legal_name', e.target.value)}
                  placeholder="Contoh: PT Pangkas Mahkota Indonesia"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  URL Logo Bisnis (Opsional)
                </label>
                <input
                  type="url"
                  value={formData.logo_url}
                  onChange={(e) => handleChange('logo_url', e.target.value)}
                  placeholder="https://domain.com/logo.png"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="border-t border-slate-800/80" />

        {/* SECTION 2: KONTAK & ALAMAT */}
        <section className="space-y-4">
          <div>
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Kontak & Alamat
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Informasi komunikasi dan domisili kantor pusat usaha.
            </p>
          </div>

          <div className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  No. Telepon / WhatsApp
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="08123456789"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email Resmi
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="kontak@barberking.id"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Alamat Kantor Pusat
              </label>
              <textarea
                rows={2}
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Jl. Thamrin No. 45, Jakarta Pusat"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition resize-none"
              />
            </div>
          </div>
        </section>

        <div className="border-t border-slate-800/80" />

        {/* SECTION 3: REGIONAL */}
        <section className="space-y-4">
          <div>
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Regional
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Standar mata uang dan zona waktu operasional sistem.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Mata Uang (Currency)
              </label>
              <input
                type="text"
                value={formData.currency}
                onChange={(e) => handleChange('currency', e.target.value)}
                placeholder="IDR"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Zona Waktu Sistem
              </label>
              <select
                value={formData.timezone}
                onChange={(e) => handleChange('timezone', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none transition cursor-pointer"
              >
                <option value="Asia/Jakarta">WIB (Asia/Jakarta)</option>
                <option value="Asia/Makassar">WITA (Asia/Makassar)</option>
                <option value="Asia/Jayapura">WIT (Asia/Jayapura)</option>
              </select>
            </div>
          </div>
        </section>

        <div className="border-t border-slate-800/80" />

        {/* SECTION 4: PAJAK */}
        <section className="space-y-4">
          <div>
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Pajak
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Konfigurasi pemungutan pajak penjualan (PPN / PB1) pada nota kasir.
            </p>
          </div>

          <div className="space-y-3.5">
            <label className="flex items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-slate-200">
                  Aktifkan Perhitungan Pajak
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Hitung tarif pajak pada transaksi layanan dan produk di kasir.
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.tax_enabled}
                onChange={(e) => handleChange('tax_enabled', e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer mt-0.5 sm:mt-0 shrink-0"
              />
            </label>

            {formData.tax_enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pl-1 pt-1 animate-in fade-in duration-150">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Tarif Pajak (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.tax_rate}
                    onChange={(e) => handleChange('tax_rate', Number(e.target.value) || 0)}
                    placeholder="11.00"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Tipe Harga Pajak
                  </label>
                  <select
                    value={formData.tax_inclusive ? 'inclusive' : 'exclusive'}
                    onChange={(e) => handleChange('tax_inclusive', e.target.value === 'inclusive')}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none transition cursor-pointer"
                  >
                    <option value="inclusive">Termasuk Pajak (Inclusive)</option>
                    <option value="exclusive">Belum Termasuk (Exclusive)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="border-t border-slate-800/80" />

        {/* SECTION 5: STRUK / NOTA */}
        <section className="space-y-4">
          <div>
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Struk / Nota
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Pesan pembuka dan penutup yang tercetak pada nota kasir pelanggan.
            </p>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Header Pesan Struk
              </label>
              <textarea
                rows={2}
                value={formData.receipt_header}
                onChange={(e) => handleChange('receipt_header', e.target.value)}
                placeholder="Pesan sambutan di bagian atas nota"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Footer Pesan Struk
              </label>
              <textarea
                rows={2}
                value={formData.receipt_footer}
                onChange={(e) => handleChange('receipt_footer', e.target.value)}
                placeholder="Pesan penutup, syarat & ketentuan di bagian bawah nota"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition resize-none"
              />
            </div>
          </div>
        </section>

        <div className="border-t border-slate-800/80" />

        {/* SECTION 6: MODUL OPERASIONAL */}
        <section className="space-y-4">
          <div>
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Modul Operasional
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Aktivasi modul sistem terintegrasi sesuai kebutuhan operasional usaha.
            </p>
          </div>

          <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
            {/* Public Booking */}
            <label className="flex items-start sm:items-center justify-between gap-3 p-3.5 hover:bg-slate-900/50 transition cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-slate-200">Public Booking</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Izinkan pelanggan membuat reservasi mandiri melalui portal reservasi online.
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.booking_enabled}
                onChange={(e) => handleChange('booking_enabled', e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer mt-0.5 sm:mt-0 shrink-0"
              />
            </label>

            {/* Inventori */}
            <label className="flex items-start sm:items-center justify-between gap-3 p-3.5 hover:bg-slate-900/50 transition cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-slate-200">Inventori</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Aktifkan pelacakan stok produk retail dan konsumsi bahan layanan.
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.inventory_enabled}
                onChange={(e) => handleChange('inventory_enabled', e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer mt-0.5 sm:mt-0 shrink-0"
              />
            </label>

            {/* Komisi */}
            <label className="flex items-start sm:items-center justify-between gap-3 p-3.5 hover:bg-slate-900/50 transition cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-slate-200">Komisi</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Aktifkan perhitungan dan pencairan komisi staf kapster per transaksi.
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.commission_enabled}
                onChange={(e) => handleChange('commission_enabled', e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer mt-0.5 sm:mt-0 shrink-0"
              />
            </label>

            {/* Keuangan */}
            <label className="flex items-start sm:items-center justify-between gap-3 p-3.5 hover:bg-slate-900/50 transition cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-slate-200">Keuangan</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Aktifkan fitur akuntansi, neraca, dan pencatatan buku besar keuangan.
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.finance_enabled}
                onChange={(e) => handleChange('finance_enabled', e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer mt-0.5 sm:mt-0 shrink-0"
              />
            </label>
          </div>
        </section>

        {/* SAVE ACTION (BOTTOM) */}
        <div className="border-t border-slate-800 pt-5 flex items-center justify-between gap-3">
          <div>
            {isDirty ? (
              <span className="inline-flex items-center text-xs font-medium text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block mr-2" />
                Perubahan belum disimpan
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                Seluruh pengaturan tersimpan
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={!isDirty || isSubmitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-xs shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Perubahan</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
