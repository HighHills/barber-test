'use client';

import React, { useState } from 'react';
import type { CustomerDetailCRM, CustomerTierView, HaircutPreferenceData } from '../../types/pos';
import { X, UserPlus, Edit, Loader2, Scissors } from 'lucide-react';

interface CustomerFormModalProps {
  customer?: CustomerDetailCRM | null;
  tiers: CustomerTierView[];
  barbers: Array<{ id: string; full_name: string }>;
  onClose: () => void;
  onSubmit: (formData: {
    id?: string;
    full_name: string;
    phone: string;
    email?: string;
    gender?: string;
    date_of_birth?: string;
    tier_id?: string;
    preferred_barber_id?: string;
    haircut_preferences?: HaircutPreferenceData;
    notes?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
}

export function CustomerFormModal({
  customer,
  tiers,
  barbers,
  onClose,
  onSubmit,
  isSubmitting,
}: CustomerFormModalProps): React.JSX.Element {
  const isEditing = !!customer;

  const [fullName, setFullName] = useState(customer?.full_name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [gender, setGender] = useState(customer?.gender || 'Laki-laki');
  const [dateOfBirth, setDateOfBirth] = useState(customer?.date_of_birth || '');
  const [tierId, setTierId] = useState(customer?.tier_id || tiers[0]?.id || '');
  const [preferredBarberId, setPreferredBarberId] = useState(customer?.preferred_barber_id || '');

  // Haircut preferences
  const [fadeStyle, setFadeStyle] = useState(customer?.haircut_preferences?.fade_style || '');
  const [guardSides, setGuardSides] = useState(customer?.haircut_preferences?.clipper_guard_sides || '');
  const [guardTop, setGuardTop] = useState(customer?.haircut_preferences?.clipper_guard_top || '');
  const [stylingProduct, setStylingProduct] = useState(customer?.haircut_preferences?.styling_product || '');
  const [scalpNotes, setScalpNotes] = useState(customer?.haircut_preferences?.scalp_notes || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) return;

    await onSubmit({
      id: customer?.id,
      full_name: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      gender: gender || undefined,
      date_of_birth: dateOfBirth || undefined,
      tier_id: tierId || undefined,
      preferred_barber_id: preferredBarberId || undefined,
      haircut_preferences: {
        fade_style: fadeStyle.trim() || undefined,
        clipper_guard_sides: guardSides.trim() || undefined,
        clipper_guard_top: guardTop.trim() || undefined,
        styling_product: stylingProduct.trim() || undefined,
        scalp_notes: scalpNotes.trim() || undefined,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2 font-black text-slate-900 text-sm">
            {isEditing ? (
              <>
                <Edit className="w-4 h-4 text-amber-500" />
                <span>Ubah Data Pelanggan: {customer?.full_name}</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 text-amber-500" />
                <span>Pendaftaran Pelanggan Baru</span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Section 1: Informasi Kontak Utama */}
          <div className="space-y-3">
            <h4 className="font-black text-slate-800 uppercase tracking-wider text-[11px]">
              1. Informasi Kontak & Biodata
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Nama Lengkap *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pratama Arhan"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Nomor Handphone / WhatsApp *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Contoh: 08123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-amber-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Alamat Email (Opsional)
                </label>
                <input
                  type="email"
                  placeholder="contoh@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Jenis Kelamin
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                  >
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Tanggal Lahir
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Tingkatan Membership & Barber Favorit */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="font-black text-slate-800 uppercase tracking-wider text-[11px]">
              2. Membership & Staf Langganan
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Tingkatan Membership
                </label>
                <select
                  value={tierId}
                  onChange={(e) => setTierId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                >
                  {tiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Diskon {t.discount_percent_service}%, Poin {t.points_multiplier}x)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Kapster Langganan (Preferred Barber)
                </label>
                <select
                  value={preferredBarberId}
                  onChange={(e) => setPreferredBarberId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800"
                >
                  <option value="">- Tidak Ada Barber Khusus -</option>
                  {barbers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Preferensi Gaya Pangkas Rambut */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5 font-black text-slate-800 uppercase tracking-wider text-[11px]">
              <Scissors className="w-3.5 h-3.5 text-amber-500" />
              <span>3. Preferensi Gaya Pangkas Rambut</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Tipe Fade / Potongan Samping
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Low Skin Fade / Taper Fade"
                  value={fadeStyle}
                  onChange={(e) => setFadeStyle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Nomor Sepatu Clipper Samping
                </label>
                <input
                  type="text"
                  placeholder="Contoh: #1.5 gradasi ke #2"
                  value={guardSides}
                  onChange={(e) => setGuardSides(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Panjang & Model Bagian Atas
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Scissor textured crop ~3-4 cm"
                  value={guardTop}
                  onChange={(e) => setGuardTop(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Produk Styling Pilihan
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Matte Clay / Water-based Pomade"
                  value={stylingProduct}
                  onChange={(e) => setStylingProduct(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-medium mb-1">
                  Catatan Khusus Kulit Kepala / Sensitivitas
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Kulit sensitif di belakang telinga, jangan semprot aftershave beralkohol"
                  value={scalpNotes}
                  onChange={(e) => setScalpNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Footer Submit Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isEditing ? 'Simpan Perubahan' : 'Daftarkan Pelanggan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
