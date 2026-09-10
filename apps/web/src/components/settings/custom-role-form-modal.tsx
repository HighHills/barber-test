'use client';

import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import type { RoleItem } from '../../types/settings';
import {
  X,
  ShieldPlus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface CustomRoleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingRole: RoleItem | null;
  onSuccess: () => void;
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function CustomRoleFormModal({
  isOpen,
  onClose,
  editingRole,
  onSuccess,
  onNotification,
}: CustomRoleFormModalProps): React.JSX.Element | null {
  const { supabase } = usePos();

  const isEditMode = Boolean(editingRole);

  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize form state
  useEffect(() => {
    if (editingRole) {
      setCode(editingRole.code || '');
      setName(editingRole.name || '');
      setDescription(editingRole.description || '');
      setIsActive(editingRole.is_active !== false);
    } else {
      setCode('');
      setName('');
      setDescription('');
      setIsActive(true);
    }
    setFormError(null);
  }, [editingRole, isOpen]);

  if (!isOpen) return null;

  // System roles cannot be edited
  if (editingRole?.is_system) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">Peran Sistem Tidak Dapat Diedit</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Peran <strong className="text-white">{editingRole.name}</strong> adalah System Role
            bawaan database yang dilindungi untuk stabilitas operasional.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"
          >
            Tutup
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const formattedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();

    // Frontend validations
    if (!formattedCode) {
      setFormError('Kode Role wajib diisi.');
      return;
    }

    if (!/^[A-Z0-9_]+$/.test(formattedCode)) {
      setFormError(
        'Kode Role hanya boleh menggunakan huruf kapital (A-Z), angka (0-9), dan garis bawah (_).'
      );
      return;
    }

    if (trimmedName.length < 2) {
      setFormError('Nama Role minimal harus terdiri dari 2 karakter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const p_role_id = editingRole ? editingRole.id : null;

      const { error: rpcErr } = await supabase.rpc('save_custom_role', {
        p_role_id,
        p_code: formattedCode,
        p_name: trimmedName,
        p_description: description.trim() || null,
        p_is_active: isActive,
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      onNotification?.({
        type: 'SUCCESS',
        message: isEditMode
          ? `Role kustom "${trimmedName}" berhasil diperbarui!`
          : `Role kustom "${trimmedName}" berhasil dibuat! Anda kini dapat mengatur matriks izinnya.`,
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('save_custom_role error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan role kustom';
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
              <ShieldPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {isEditMode ? 'Ubah Role Kustom' : 'Tambah Role Custom'}
              </h2>
              <p className="text-xs text-slate-400">
                {isEditMode
                  ? 'Perbarui informasi dan status role kustom'
                  : 'Definisikan peran baru untuk staf barbershop'}
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

          {/* Role Code */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-semibold">
              Kode Role (Identifier) <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="CONTOH: SENIOR_STYLIST"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 transition text-xs"
            />
            <p className="text-[10px] text-slate-500">
              Gunakan huruf kapital dan garis bawah (misal: TRAINEE_KASIR, HEAD_BARBER).
            </p>
          </div>

          {/* Role Name */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-semibold">
              Nama Role <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Senior Stylist / Supervisor"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition text-xs"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-semibold">Deskripsi Tugas & Cakupan</label>
            <textarea
              rows={3}
              placeholder="Jelaskan ruang lingkup tanggung jawab peran ini..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition text-xs resize-none"
            />
          </div>

          {/* Is Active Toggle */}
          <div className="pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
              />
              <span className="text-slate-300 font-medium">
                Peran Aktif (Dapat Ditugaskan ke Pengguna)
              </span>
            </label>
          </div>

          {/* Actions */}
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
                  <span>{isEditMode ? 'Perbarui Role' : 'Simpan Role'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
