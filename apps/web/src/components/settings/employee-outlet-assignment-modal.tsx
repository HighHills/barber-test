'use client';

import React, { useState } from 'react';
import type { EmployeeItem, OutletItem } from '../../types/settings';
import {
  X,
  Store,
  Loader2,
  AlertCircle,
  Star,
  Check,
} from 'lucide-react';

interface EmployeeOutletAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: EmployeeItem | null;
  outlets: OutletItem[];
  onAssignmentChange: (
    employeeId: string,
    outletId: string,
    isPrimary: boolean,
    isActive: boolean
  ) => Promise<void>;
}

export function EmployeeOutletAssignmentModal({
  isOpen,
  onClose,
  employee,
  outlets,
  onAssignmentChange,
}: EmployeeOutletAssignmentModalProps): React.JSX.Element | null {
  const [loadingOutletId, setLoadingOutletId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !employee) return null;

  const getAssignment = (outletId: string) => {
    return employee.assigned_outlets?.find((a) => a.outlet_id === outletId);
  };

  const handleToggleAssign = async (outletId: string) => {
    const current = getAssignment(outletId);
    setLoadingOutletId(outletId);
    setErrorMessage(null);
    try {
      if (current) {
        // Toggle active or deactivate
        await onAssignmentChange(
          employee.id,
          outletId,
          current.is_primary,
          !current.is_active
        );
      } else {
        // Assign new with active = true
        const isFirst = !employee.assigned_outlets || employee.assigned_outlets.length === 0;
        await onAssignmentChange(employee.id, outletId, isFirst, true);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal mengubah penugasan outlet'
      );
    } finally {
      setLoadingOutletId(null);
    }
  };

  const handleSetPrimary = async (outletId: string) => {
    setLoadingOutletId(outletId);
    setErrorMessage(null);
    try {
      await onAssignmentChange(employee.id, outletId, true, true);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal menetapkan cabang utama'
      );
    } finally {
      setLoadingOutletId(null);
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
                Penugasan Cabang Outlet
              </h3>
              <p className="text-xs text-slate-400">
                Staff: <span className="text-amber-400 font-semibold">{employee.full_name}</span> ({employee.employee_code})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <p className="text-slate-400">
            Tentukan cabang mana saja staf ini bertugas. Anda juga dapat menentukan satu cabang sebagai <strong>Cabang Utama (Primary)</strong>.
          </p>

          <div className="space-y-2">
            {outlets.map((outlet) => {
              const assignment = getAssignment(outlet.id);
              const isAssigned = Boolean(assignment && assignment.is_active);
              const isPrimary = Boolean(assignment && assignment.is_primary);
              const isBusy = loadingOutletId === outlet.id;

              return (
                <div
                  key={outlet.id}
                  className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                    isAssigned
                      ? 'bg-slate-950/80 border-slate-700/80 ring-1 ring-amber-500/20'
                      : 'bg-slate-950/40 border-slate-800/80 opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleAssign(outlet.id)}
                      disabled={isBusy}
                      className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                        isAssigned
                          ? 'bg-amber-500 border-amber-500 text-slate-950'
                          : 'border-slate-700 hover:border-slate-500 bg-slate-900'
                      }`}
                    >
                      {isBusy ? (
                        <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                      ) : isAssigned ? (
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      ) : null}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{outlet.name}</span>
                        <span className="font-mono text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          {outlet.code}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {outlet.address || 'Alamat cabang belum diatur'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isAssigned && (
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(outlet.id)}
                        disabled={isBusy || isPrimary}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                          isPrimary
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-default'
                            : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                        title={isPrimary ? 'Cabang Utama' : 'Jadikan Cabang Utama'}
                      >
                        <Star className={`w-3 h-3 ${isPrimary ? 'fill-amber-400 text-amber-400' : ''}`} />
                        <span>{isPrimary ? 'Utama' : 'Set Utama'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl transition shadow-md shadow-amber-500/20"
            >
              Selesai
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
