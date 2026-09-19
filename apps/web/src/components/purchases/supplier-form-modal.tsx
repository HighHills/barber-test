'use client';

import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import type { SupplierItem } from '../../types/purchases';
import {
  X,
  Truck,
  Building,
  Phone,
  Mail,
  MapPin,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trash2,
} from 'lucide-react';

interface SupplierFormModalProps {
  isOpen: boolean;
  supplier?: SupplierItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function SupplierFormModal({
  isOpen,
  supplier,
  onClose,
  onSuccess,
}: SupplierFormModalProps): React.JSX.Element | null {
  const { supabase } = usePos();
  const isEditing = Boolean(supplier && supplier.id);

  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setConfirmDelete(false);

    if (supplier) {
      setCode(supplier.code || '');
      setName(supplier.name || '');
      setPhone(supplier.phone || '');
      setEmail(supplier.email || '');
      setAddress(supplier.address || '');
      setIsActive(supplier.is_active !== undefined ? supplier.is_active : true);
    } else {
      const rand = Math.floor(100 + Math.random() * 900);
      setCode(`SUP-${rand}`);
      setName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setIsActive(true);
    }
  }, [isOpen, supplier]);

  const handleGenerateCode = () => {
    const rand = Math.floor(100 + Math.random() * 900);
    setCode(`SUP-${rand}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setErrorMsg('Nama supplier/vendor wajib diisi.');
      return;
    }

    setLoading(true);
    try {
      // Call RPC upsert_supplier
      const { error } = await supabase.rpc('upsert_supplier', {
        p_id: supplier?.id || null,
        p_code: code.trim() || null,
        p_name: name.trim(),
        p_phone: phone.trim() || null,
        p_email: email.trim() || null,
        p_address: address.trim() || null,
        p_is_active: isActive,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg('Data supplier berhasil disimpan!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan supplier';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!supplier?.id) return;
    setDeleting(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.rpc('delete_supplier', { p_id: supplier.id });

      if (error) {
        throw new Error(error.message);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus supplier';
      setErrorMsg(msg);
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-3xl border border-slate-200 bg-white text-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isEditing ? 'Edit Data Supplier' : 'Tambah Supplier / Vendor Baru'}
              </h2>
              <p className="text-xs text-slate-400">Pemasok persediaan pomade, shampoo & perlengkapan barbershop</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
          {/* Notifications */}
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-600" />
              <div className="flex-1">
                <p className="font-bold text-red-900">Gagal Memproses</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-600" />
              <p className="font-bold">{successMsg}</p>
            </div>
          )}

          {/* Code & Name Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">Kode Vendor</label>
                <button
                  type="button"
                  onClick={handleGenerateCode}
                  className="text-[10px] text-amber-600 hover:text-amber-700 flex items-center gap-0.5 font-bold"
                >
                  <Sparkles className="h-2.5 w-2.5" /> Auto
                </button>
              </div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="SUP-01"
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nama Perusahaan / Supplier <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="misal: PT Barbershop Supply Indonesia"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                  required
                />
              </div>
            </div>
          </div>

          {/* Contact: Phone & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                No. Telepon / WhatsApp
              </label>
              <div className="relative">
                <Phone className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0812-9988-7766"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Email Pemasok
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="order@barbersupply.id"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Alamat Gudang / Kantor Supplier
            </label>
            <div className="relative">
              <MapPin className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Jl. Pergudangan Logistik No. 88, Jakarta"
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none transition"
              />
            </div>
          </div>

          {/* Active Status Switch */}
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
            <div>
              <p className="text-xs font-bold text-slate-800">Status Vendor</p>
              <p className="text-[11px] text-slate-500">
                Supplier {isActive ? 'aktif untuk pesanan baru' : 'dinonaktifkan sementara'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                isActive ? 'bg-amber-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition shadow-xs ${
                  isActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Delete Option if Edit Mode */}
          {isEditing && (
            <div className="pt-2 border-t border-slate-100">
              {confirmDelete ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 space-y-2">
                  <p className="text-xs font-bold text-red-900">Konfirmasi Hapus Supplier?</p>
                  <p className="text-[11px] text-red-700">
                    Jika supplier memiliki riwayat transaksi faktur, statusnya akan dinonaktifkan secara aman agar laporan akuntansi tidak terganggu.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-1 transition shadow-xs"
                    >
                      {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Ya, Hapus Sekarang
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-bold py-1.5 px-2.5 rounded-lg hover:bg-red-50 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus / Nonaktifkan Supplier Ini
                </button>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition shadow-xs disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <span>{isEditing ? 'Simpan Perubahan' : 'Daftarkan Supplier'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
