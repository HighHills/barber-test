'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { BusinessSettingsFormData } from '../../types/settings';
import {
  Building2,
  Receipt,
  Layers,
  Save,
  Loader2,
  AlertCircle,
  Coins,
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
        // Record belum ada di production, gunakan default
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

      // Reload settings & context
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
        <p className="text-sm text-slate-400">Memuat konfigurasi bisnis...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Top action bar with dirty indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-400" />
            <span>Informasi Bisnis & Operasional</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Kelola profil resmi usaha, aturan pajak, template nota, dan aktivasi modul SaaS.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Perubahan Belum Disimpan
            </span>
          )}

          <button
            type="submit"
            disabled={!isDirty || isSubmitting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Pengaturan</span>
              </>
            )}
          </button>
        </div>
      </div>

      {localError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{localError}</span>
        </div>
      )}

      {/* Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Identitas Bisnis */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-white border-b border-slate-800 pb-2">
            <Building2 className="w-4 h-4 text-amber-400" />
            <span>Identitas Bisnis</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Nama Bisnis / Brand <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.business_name}
                onChange={(e) => handleChange('business_name', e.target.value)}
                placeholder="Contoh: Barberking Premium"
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Nama Perusahaan / Legal Entity</label>
              <input
                type="text"
                value={formData.legal_name}
                onChange={(e) => handleChange('legal_name', e.target.value)}
                placeholder="Contoh: PT Pangkas Mahkota Indonesia"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">URL Logo Toko (Opsional)</label>
              <input
                type="url"
                value={formData.logo_url}
                onChange={(e) => handleChange('logo_url', e.target.value)}
                placeholder="https://domain.com/logo.png"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">No. Telepon Resmi</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="08123456789"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Email Resmi</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="kontak@barberking.id"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Alamat Kantor Pusat</label>
              <textarea
                rows={2}
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Jl. Thamrin No. 45, Jakarta Pusat"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* Card 2: Pajak & Finansial */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-white border-b border-slate-800 pb-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            <span>Mata Uang & Pajak Usaha</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Mata Uang (Currency)</label>
                <input
                  type="text"
                  value={formData.currency}
                  onChange={(e) => handleChange('currency', e.target.value)}
                  placeholder="IDR"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Zona Waktu Sistem</label>
                <select
                  value={formData.timezone}
                  onChange={(e) => handleChange('timezone', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white focus:outline-none"
                >
                  <option value="Asia/Jakarta">WIB (Asia/Jakarta)</option>
                  <option value="Asia/Makassar">WITA (Asia/Makassar)</option>
                  <option value="Asia/Jayapura">WIT (Asia/Jayapura)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 space-y-3">
              <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition">
                <div>
                  <div className="text-slate-200 font-semibold">Aktifkan Perhitungan Pajak</div>
                  <div className="text-[11px] text-slate-400">Tambahkan tarif PPN / PB1 pada penjualan</div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.tax_enabled}
                  onChange={(e) => handleChange('tax_enabled', e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </label>

              {formData.tax_enabled && (
                <div className="grid grid-cols-2 gap-3 pl-1 pt-1 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Tarif Pajak (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.tax_rate}
                      onChange={(e) => handleChange('tax_rate', Number(e.target.value) || 0)}
                      placeholder="11.00"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Tipe Harga Pajak</label>
                    <select
                      value={formData.tax_inclusive ? 'inclusive' : 'exclusive'}
                      onChange={(e) => handleChange('tax_inclusive', e.target.value === 'inclusive')}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white focus:outline-none"
                    >
                      <option value="inclusive">Termasuk Pajak (Inclusive)</option>
                      <option value="exclusive">Belum Termasuk (Exclusive)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Template Nota / Struk Kasir */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-white border-b border-slate-800 pb-2">
            <Receipt className="w-4 h-4 text-purple-400" />
            <span>Kustomisasi Struk / Nota Kasir</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Header Pesan Struk</label>
              <textarea
                rows={2}
                value={formData.receipt_header}
                onChange={(e) => handleChange('receipt_header', e.target.value)}
                placeholder="Pesan sambutan di bagian atas nota"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Footer Pesan Struk</label>
              <textarea
                rows={2}
                value={formData.receipt_footer}
                onChange={(e) => handleChange('receipt_footer', e.target.value)}
                placeholder="Pesan penutup, syarat & ketentuan di bagian bawah nota"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* Card 4: Modul & Fitur Aktif */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-white border-b border-slate-800 pb-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>Aktivasi Modul Sistem</span>
          </div>

          <div className="space-y-2 text-xs">
            {[
              {
                id: 'booking_enabled',
                label: 'Modul Public Online Booking',
                desc: 'Izinkan pelanggan reservasi mandiri via portal web',
                checked: formData.booking_enabled,
              },
              {
                id: 'inventory_enabled',
                label: 'Modul Kontrol Stok & Inventori',
                desc: 'Pelacakan stok produk & konsumsi bahan layanan',
                checked: formData.inventory_enabled,
              },
              {
                id: 'commission_enabled',
                label: 'Modul Komisi Kapster / Barber',
                desc: 'Perhitungan & pencairan komisi otomatis per transaksi',
                checked: formData.commission_enabled,
              },
              {
                id: 'finance_enabled',
                label: 'Modul Akuntansi & Jurnal Double-Entry',
                desc: 'Pencatatan pembukuan otomatis level 2 (COA & Neraca)',
                checked: formData.finance_enabled,
              },
            ].map((mod) => (
              <label
                key={mod.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition cursor-pointer"
              >
                <div>
                  <div className="text-slate-200 font-semibold">{mod.label}</div>
                  <div className="text-[11px] text-slate-400">{mod.desc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={mod.checked}
                  onChange={(e) =>
                    handleChange(mod.id as keyof BusinessSettingsFormData, e.target.checked)
                  }
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </form>
  );
}
