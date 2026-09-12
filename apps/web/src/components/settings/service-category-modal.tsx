'use client';

import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import type { ServiceCategoryItem } from '../../types/settings';
import {
  X,
  Tags,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface ServiceCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: ServiceCategoryItem | null;
  onSuccess: () => void;
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function ServiceCategoryModal({
  isOpen,
  onClose,
  category,
  onSuccess,
  onNotification,
}: ServiceCategoryModalProps): React.JSX.Element | null {
  const { supabase, refreshData } = usePos();
  const isEditing = Boolean(category);

  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (category) {
      setName(category.name || '');
      setDescription(category.description || '');
      setSortOrder(category.sort_order ?? 0);
      setIsActive(category.is_active !== false);
    } else {
      setName('');
      setDescription('');
      setSortOrder(0);
      setIsActive(true);
    }
    setFormError(null);
  }, [category, isOpen]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Nama kategori layanan wajib diisi.');
      return;
    }

    if (sortOrder < 0) {
      setFormError('Urutan tampilan (sort order) tidak boleh bernilai negatif.');
      return;
    }

    setIsSubmitting(true);
    try {
      const p_category_id = category ? category.id : null;

      const { error: rpcErr } = await supabase.rpc('save_service_category', {
        p_category_id,
        p_name: trimmedName,
        p_description: description.trim() || null,
        p_sort_order: sortOrder,
        p_is_active: isActive,
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      onNotification?.({
        type: 'SUCCESS',
        message: isEditing
          ? `Kategori layanan "${trimmedName}" berhasil diperbarui!`
          : `Kategori layanan "${trimmedName}" berhasil ditambahkan!`,
      });

      await refreshData();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('save_service_category error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan kategori layanan.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Tags className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {isEditing ? 'Ubah Kategori Layanan' : 'Tambah Kategori Layanan'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEditing
                  ? `Perbarui informasi kategori ${category?.name}`
                  : 'Daftarkan pengelompokan menu pangkas rambut, cukur, & treatment'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Tutup modal kategori layanan"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 text-xs">
          {formError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Section 1: Identitas Kategori */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-2">
              Identitas Kategori
            </span>
            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Nama Kategori <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Haircut & Styling, Shaving & Beard"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Deskripsi <span className="text-slate-500 font-normal">(Opsional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Keterangan singkat kelompok layanan..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition resize-none"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800/80" />

          {/* Section 2: Konfigurasi & Status */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-2">
              Konfigurasi & Status
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Urutan Tampilan
                </label>
                <input
                  type="number"
                  min={0}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none transition"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Angka lebih kecil tampil lebih awal di menu POS.
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Status Operasional
                </label>
                <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                  <span className={isActive ? 'text-emerald-400 font-semibold text-xs' : 'text-slate-400 text-xs'}>
                    {isActive ? 'Kategori Aktif' : 'Nonaktif'}
                  </span>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[10px] text-slate-500 mt-1">
                  Kategori aktif dapat dipilih saat membuat layanan.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700 text-xs"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl transition shadow-xs shadow-amber-500/20 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Perbarui Kategori' : 'Simpan Kategori'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

