'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { EmployeeItem, LeaveItem, LeaveStatus, OutletItem } from '../../types/settings';
import { mapEmployeeLeaveOperationError } from '../../lib/employee-leave-operation-errors';
import { X, Calendar, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface LeaveFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    employee_id: string;
    outlet_id: string;
    start_at: string;
    end_at: string;
    reason: string | null;
    status: LeaveStatus;
  }) => Promise<void>;
  employees: EmployeeItem[];
  outlets?: OutletItem[];
  editingLeave?: LeaveItem | null;
}

const leaveStatuses: LeaveStatus[] = ['APPROVED', 'PENDING', 'REJECTED', 'CANCELLED'];

export function LeaveFormModal({
  isOpen,
  onClose,
  onSave,
  employees,
  editingLeave,
}: LeaveFormModalProps): React.JSX.Element | null {
  const [employeeId, setEmployeeId] = useState<string>('');
  const [outletId, setOutletId] = useState<string>('');
  const [startAt, setStartAt] = useState<string>('');
  const [endAt, setEndAt] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [status, setStatus] = useState<LeaveStatus>('APPROVED');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Derived selected employee
  const selectedEmployee = useMemo(() => {
    return employees.find((e) => e.id === employeeId) || null;
  }, [employees, employeeId]);

  // Derived active assigned outlets for selected employee
  const activeAssignedOutlets = useMemo(() => {
    return (selectedEmployee?.assigned_outlets || []).filter((ao) => ao.is_active);
  }, [selectedEmployee]);

  // Check if current outletId is valid active assignment for selectedEmployee
  const isOutletAssignmentActive = useMemo(() => {
    if (!outletId) return false;
    return activeAssignedOutlets.some((ao) => ao.outlet_id === outletId);
  }, [activeAssignedOutlets, outletId]);

  // In edit mode, check if the leave's existing outlet assignment is inactive
  const isHistoricalAssignmentInactive = useMemo(() => {
    if (!editingLeave) return false;
    if (editingLeave.employee_id !== employeeId) return false;
    return editingLeave.outlet_id === outletId && !isOutletAssignmentActive;
  }, [editingLeave, employeeId, outletId, isOutletAssignmentActive]);

  useEffect(() => {
    if (!isOpen) return;

    if (editingLeave) {
      setEmployeeId(editingLeave.employee_id);
      // In edit mode: keep existing outlet without silently switching
      setOutletId(editingLeave.outlet_id);
      setStartAt(editingLeave.start_at ? editingLeave.start_at.slice(0, 16) : '');
      setEndAt(editingLeave.end_at ? editingLeave.end_at.slice(0, 16) : '');
      setReason(editingLeave.reason || '');
      setStatus(editingLeave.status);
    } else {
      // In create mode: pick first employee who has active assignments if available, or employees[0]
      const initialEmp =
        employees.find((e) => (e.assigned_outlets || []).some((ao) => ao.is_active)) ||
        employees[0];

      const initialEmpId = initialEmp?.id || '';
      setEmployeeId(initialEmpId);

      const activeAssignments = (initialEmp?.assigned_outlets || []).filter(
        (ao) => ao.is_active
      );
      const primary = activeAssignments.find((ao) => ao.is_primary);

      if (primary) {
        setOutletId(primary.outlet_id);
      } else if (activeAssignments.length > 0) {
        setOutletId(activeAssignments[0].outlet_id);
      } else {
        setOutletId('');
      }

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);

      const dayAfter = new Date(tomorrow);
      dayAfter.setHours(21, 0, 0, 0);

      const formatDatetimeLocal = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };

      setStartAt(formatDatetimeLocal(tomorrow));
      setEndAt(formatDatetimeLocal(dayAfter));
      setReason('');
      setStatus('APPROVED');
    }
    setErrorMessage(null);
  }, [editingLeave, isOpen, employees]);

  if (!isOpen) return null;

  const handleEmployeeChange = (newEmpId: string) => {
    setEmployeeId(newEmpId);
    setErrorMessage(null);

    const emp = employees.find((e) => e.id === newEmpId);
    const activeAssignments = (emp?.assigned_outlets || []).filter((ao) => ao.is_active);
    const primary = activeAssignments.find((ao) => ao.is_primary);

    if (primary) {
      setOutletId(primary.outlet_id);
    } else if (activeAssignments.length > 0) {
      setOutletId(activeAssignments[0].outlet_id);
    } else {
      setOutletId('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) {
      setErrorMessage('Pilih karyawan yang mengajukan cuti.');
      return;
    }
    if (!outletId) {
      setErrorMessage('Pilih cabang outlet penugasan.');
      return;
    }
    if (!isOutletAssignmentActive) {
      setErrorMessage(
        isHistoricalAssignmentInactive
          ? 'Penugasan cabang karyawan untuk data cuti ini sudah tidak aktif.'
          : 'Karyawan belum memiliki penugasan cabang aktif pada outlet yang dipilih.'
      );
      return;
    }
    if (!startAt || !endAt) {
      setErrorMessage('Tanggal mulai dan selesai cuti wajib diisi.');
      return;
    }
    if (new Date(startAt) >= new Date(endAt)) {
      setErrorMessage('Waktu selesai cuti harus lebih besar dari waktu mulai cuti.');
      return;
    }
    if (!reason.trim()) {
      setErrorMessage('Alasan cuti wajib diisi.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await onSave({
        id: editingLeave?.id,
        employee_id: employeeId,
        outlet_id: outletId,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        reason: reason.trim(),
        status,
      });
      onClose();
    } catch (err: unknown) {
      console.error('Error saving leave:', err);
      setErrorMessage(mapEmployeeLeaveOperationError(err, 'save'));
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
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {editingLeave ? 'Edit Pengajuan Cuti' : 'Catat Cuti / Izin Karyawan'}
              </h3>
              <p className="text-xs text-slate-400">
                Pencatatan ketidakhadiran, cuti tahunan, sakit, atau izin khusus
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

          {isHistoricalAssignmentInactive && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-200">
                  Penugasan cabang karyawan untuk data cuti ini sudah tidak aktif.
                </p>
                <p className="text-amber-300/80 mt-0.5">
                  Data riwayat cuti ini tetap mempertahankan cabang asalnya ({editingLeave?.outlet_name || 'Cabang Terkait'}), namun tidak dapat diperbarui sebelum penugasan cabang diaktifkan kembali.
                </p>
              </div>
            </div>
          )}

          {selectedEmployee && activeAssignedOutlets.length === 0 && !isHistoricalAssignmentInactive && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>Karyawan ini belum memiliki penugasan cabang aktif.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Karyawan <span className="text-red-400">*</span>
              </label>
              <select
                value={employeeId}
                onChange={(e) => handleEmployeeChange(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white focus:outline-none"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.employee_code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Cabang Terkait <span className="text-red-400">*</span>
              </label>
              <select
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                disabled={activeAssignedOutlets.length === 0 || isHistoricalAssignmentInactive}
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {activeAssignedOutlets.length === 0 && !isHistoricalAssignmentInactive ? (
                  <option value="">Tidak ada cabang penugasan aktif</option>
                ) : (
                  <>
                    {/* Render historical option when assignment is inactive to preserve value visually without silent change */}
                    {isHistoricalAssignmentInactive && (
                      <option value={editingLeave?.outlet_id}>
                        {editingLeave?.outlet_name || 'Cabang'} (Penugasan Tidak Aktif)
                      </option>
                    )}
                    {activeAssignedOutlets.map((assignment) => (
                      <option key={assignment.outlet_id} value={assignment.outlet_id}>
                        {assignment.outlet_name} ({assignment.outlet_code})
                        {assignment.is_primary ? ' — Cabang Utama' : ''}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Mulai Cuti (Tanggal & Jam) <span className="text-red-400">*</span>
              </label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Selesai Cuti (Tanggal & Jam) <span className="text-red-400">*</span>
              </label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Alasan Cuti / Keterangan <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Cuti tahunan acara keluarga / Sakit dengan surat dokter"
              required
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Status Persetujuan Cuti
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as LeaveStatus)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white focus:outline-none"
            >
              {leaveStatuses.map((st) => (
                <option key={st} value={st}>
                  {st === 'APPROVED'
                    ? 'Disetujui Langsung (APPROVED)'
                    : st === 'PENDING'
                    ? 'Menunggu Persetujuan (PENDING)'
                    : st === 'REJECTED'
                    ? 'Ditolak (REJECTED)'
                    : 'Dibatalkan (CANCELLED)'}
                </option>
              ))}
            </select>
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
              disabled={
                isSubmitting ||
                !employeeId ||
                !outletId ||
                !isOutletAssignmentActive ||
                activeAssignedOutlets.length === 0
              }
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
                  <span>Simpan Data Cuti</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

