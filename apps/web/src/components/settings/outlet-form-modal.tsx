'use client';

import React, { useState, useEffect } from 'react';
import type { OutletItem } from '../../types/settings';
import { X, Store, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface OutletFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (outletData: {
    id?: string;
    code: string;
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    timezone: string;
    is_active: boolean;
  }) => Promise<void>;
  editingOutlet?: OutletItem | null;
}

export function OutletFormModal({
  isOpen,
  onClose,
  onSave,
  editingOutlet,
}: OutletFormModalProps): React.JSX.Element | null {
  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('Asia/Jakarta');
  const [isActive, setIsActive] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (editingOutlet) {
      setCode(editingOutlet.code);
      setName(editingOutlet.name);
      setAddress(editingOutlet.address || '');
      setPhone(editingOutlet.phone || '');
      setEmail(editingOutlet.email || '');
      setTimezone(editingOutlet.timezone || 'Asia/Jakarta');
      setIsActive(editingOutlet.is_active);
    } else {
      setCode('');
      setName('');
      setAddress('');
      setPhone('');
      setEmail('');
      setTimezone('Asia/Jakarta');
      setIsActive(true);
    }
    setErrorMessage(null);
  }, [editingOutlet, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();

    if (!normalizedCode) {
      setErrorMessage('Kode cabang outlet wajib diisi.');
      return;
    }
    if (!trimmedName) {
      setErrorMessage('Nama cabang outlet wajib diisi.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await onSave({
        id: editingOutlet?.id,
        code: normalizedCode,
        name: trimmedName,
        address: address.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        timezone,
        is_active: isActive,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan data outlet'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {editingOutlet ? 'Edit Cabang Outlet' : 'Tambah Cabang Baru'}
              </h3>
              <p className="text-xs text-slate-400">
                {editingOutlet
                  ? `Perbarui informasi cabang ${editingOutlet.code}`
                  : 'Daftarkan cabang outlet barbershop baru'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Kode Cabang <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Contoh: BND-01"
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white uppercase placeholder-slate-600 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Nama Cabang <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Cabang Bandung Dago"
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Telepon Cabang</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="022-8765432"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Email Cabang</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dago@barbershop.id"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Alamat Lengkap Cabang</label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Jl. Ir. H. Juanda No. 120, Bandung"
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 items-center pt-1">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Zona Waktu</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white focus:outline-none"
              >
                <option value="Asia/Jakarta">WIB (Asia/Jakarta)</option>
                <option value="Asia/Makassar">WITA (Asia/Makassar)</option>
                <option value="Asia/Jayapura">WIT (Asia/Jayapura)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Status Operasional</label>
              <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                />
                <span className={isActive ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                  {isActive ? 'Cabang Aktif' : 'Nonaktif'}
                </span>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-5 py-2 font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl transition shadow-md shadow-amber-500/20 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Simpan Cabang</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
