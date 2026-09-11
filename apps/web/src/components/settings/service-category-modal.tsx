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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Tags className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {isEditing ? 'Ubah Kategori Layanan' : 'Tambah Kategori Layanan'}
              </h2>
              <p className="text-xs text-slate-400">
                Pengelompokan menu pangkas rambut, cukur, & treatment
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {formError && (
            <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-red-300 flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-semibold">
              Nama Kategori <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Haircut & Styling, Shaving & Beard"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition text-xs"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-semibold">Deskripsi</label>
            <textarea
              rows={2}
              placeholder="Keterangan singkat kelompok layanan..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition text-xs resize-none"
            />
          </div>

          {/* Sort Order */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-semibold">Urutan Tampilan (Sort Order)</label>
            <input
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-xs"
            />
            <p className="text-[10px] text-slate-500">Angka lebih kecil tampil lebih awal di menu POS.</p>
          </div>

          {/* Active Status Toggle */}
          <div className="pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
              />
              <span className="text-slate-300 font-medium">
                Kategori Aktif (Dapat dipilih di katalog layanan)
              </span>
            </label>
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
