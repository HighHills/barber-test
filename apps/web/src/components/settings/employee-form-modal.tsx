'use client';

import React, { useState, useEffect } from 'react';
import type { EmployeeItem } from '../../types/settings';
import { X, User, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface EmployeeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    employee_code: string;
    full_name: string;
    phone?: string | null;
    email?: string | null;
    position: string;
    hire_date?: string | null;
    termination_date?: string | null;
    is_active: boolean;
  }) => Promise<void>;
  editingEmployee?: EmployeeItem | null;
}

const positions = ['BARBER', 'CASHIER', 'MANAGER', 'ADMIN'] as const;

export function EmployeeFormModal({
  isOpen,
  onClose,
  onSave,
  editingEmployee,
}: EmployeeFormModalProps): React.JSX.Element | null {
  const [employeeCode, setEmployeeCode] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [position, setPosition] = useState<string>('BARBER');
  const [hireDate, setHireDate] = useState<string>('');
  const [terminationDate, setTerminationDate] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (editingEmployee) {
      setEmployeeCode(editingEmployee.employee_code);
      setFullName(editingEmployee.full_name);
      setPhone(editingEmployee.phone || '');
      setEmail(editingEmployee.email || '');
      setPosition(editingEmployee.position || 'BARBER');
      setHireDate(
        editingEmployee.hire_date
          ? editingEmployee.hire_date.split('T')[0]
          : ''
      );
      setTerminationDate(
        editingEmployee.termination_date
          ? editingEmployee.termination_date.split('T')[0]
          : ''
      );
      setIsActive(editingEmployee.is_active);
    } else {
      const randomCode = `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
      setEmployeeCode(randomCode);
      setFullName('');
      setPhone('');
      setEmail('');
      setPosition('BARBER');
      setHireDate(new Date().toISOString().split('T')[0]);
      setTerminationDate('');
      setIsActive(true);
    }
    setErrorMessage(null);
  }, [editingEmployee, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = employeeCode.trim().toUpperCase();
    const name = fullName.trim();

    if (!code) {
      setErrorMessage('Kode staff/barber wajib diisi.');
      return;
    }
    if (!name) {
      setErrorMessage('Nama lengkap staff wajib diisi.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await onSave({
        id: editingEmployee?.id,
        employee_code: code,
        full_name: name,
        phone: phone.trim() || null,
        email: email.trim() || null,
        position,
        hire_date: hireDate || null,
        termination_date: terminationDate || null,
        is_active: isActive,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan data staff'
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
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {editingEmployee ? 'Edit Data Staff' : 'Tambah Staff Baru'}
              </h3>
              <p className="text-xs text-slate-400">
                {editingEmployee
                  ? `Perbarui profil & posisi ${editingEmployee.full_name}`
                  : 'Daftarkan karyawan, kapster, kasir, atau manajer baru'}
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
                Kode Karyawan <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                placeholder="Contoh: BAR-01"
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white uppercase placeholder-slate-600 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Posisi / Jabatan <span className="text-red-400">*</span>
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white focus:outline-none"
              >
                {positions.map((p) => (
                  <option key={p} value={p}>
                    {p === 'BARBER'
                      ? 'BARBER (Kapster)'
                      : p === 'CASHIER'
                      ? 'CASHIER (Kasir)'
                      : p === 'MANAGER'
                      ? 'MANAGER (Kepala Cabang)'
                      : 'ADMIN (Administrator)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Nama Lengkap Staff <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Contoh: Ahmad Fadillah"
              required
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">No. WhatsApp / HP</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08123456789"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Email Karyawan</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ahmad@barbershop.id"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Tanggal Mulai Kerja</label>
              <input
                type="date"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Tanggal Berhenti (Opsional)
              </label>
              <input
                type="date"
                value={terminationDate}
                onChange={(e) => setTerminationDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-1">
            <label className="block text-slate-300 font-semibold mb-1">Status Keaktifan</label>
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
              />
              <span className={isActive ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                {isActive ? 'Karyawan Aktif' : 'Nonaktif / Tidak Bekerja'}
              </span>
            </label>
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
                  <span>Simpan Staff</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
