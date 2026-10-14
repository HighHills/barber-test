'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { EmployeeItem, LeaveItem, LeaveStatus, OutletItem } from '../../types/settings';
import { LeaveFormModal } from './leave-form-modal';
import { LeaveBookingImpacts } from '../queue/leave-booking-impacts';
import { mapEmployeeLeaveOperationError } from '../../lib/employee-leave-operation-errors';
import {
  Calendar,
  Plus,
  Search,
  Loader2,
  Edit2,
} from 'lucide-react';

interface EmployeeLeaveOutletRelation {
  code: string | null;
  name: string | null;
}

interface LeaveEmployeeRelation {
  employee_code: string | null;
  full_name: string | null;
}

interface LeaveQueryResultRow {
  id: string;
  employee_id: string;
  outlet_id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
  status: string;
  created_at: string;
  employees: LeaveEmployeeRelation | LeaveEmployeeRelation[] | null;
  outlets: EmployeeLeaveOutletRelation | EmployeeLeaveOutletRelation[] | null;
}

interface EmployeeLeaveAssignmentRow {
  outlet_id: string;
  is_primary: boolean | null;
  is_active: boolean | null;
  outlets:
    | EmployeeLeaveOutletRelation
    | EmployeeLeaveOutletRelation[]
    | null;
}

interface EmployeeLeaveEmployeeRow {
  id: string;
  employee_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  position: string;
  hire_date: string;
  termination_date: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  employee_outlets: EmployeeLeaveAssignmentRow[] | null;
}

interface EmployeeLeavePanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function EmployeeLeavePanel({
  onNotification,
}: EmployeeLeavePanelProps): React.JSX.Element {
  const { supabase } = usePos();

  const [leaves, setLeaves] = useState<LeaveItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [outlets, setOutlets] = useState<OutletItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [outletFilter, setOutletFilter] = useState<string>('ALL');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingLeave, setEditingLeave] = useState<LeaveItem | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  // 1. Load Data via SELECT
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Query employees with assignments
      const { data: empData, error: empErr } = await supabase
        .from('employees')
        .select(`
          id,
          employee_code,
          full_name,
          phone,
          email,
          position,
          hire_date,
          termination_date,
          is_active,
          created_at,
          updated_at,
          employee_outlets (
            outlet_id,
            is_primary,
            is_active,
            outlets (
              code,
              name
            )
          )
        `)
        .order('full_name');

      if (empErr) throw empErr;

      const rawEmpRows = (empData || []) as EmployeeLeaveEmployeeRow[];
      const mappedEmployees: EmployeeItem[] = rawEmpRows.map((e: EmployeeLeaveEmployeeRow) => {
        const rawAssignments = e.employee_outlets || [];
        const assigned = rawAssignments.map((ao: EmployeeLeaveAssignmentRow) => {
          const outObj = Array.isArray(ao.outlets) ? ao.outlets[0] : ao.outlets;
          return {
            outlet_id: ao.outlet_id,
            outlet_code: outObj?.code || 'OUT',
            outlet_name: outObj?.name || 'Cabang',
            is_primary: Boolean(ao.is_primary),
            is_active: Boolean(ao.is_active),
          };
        });

        return {
          id: e.id,
          employee_code: e.employee_code,
          full_name: e.full_name,
          phone: e.phone,
          email: e.email,
          position: e.position,
          hire_date: e.hire_date,
          termination_date: e.termination_date,
          is_active: e.is_active,
          created_at: e.created_at || undefined,
          updated_at: e.updated_at || undefined,
          assigned_outlets: assigned,
        };
      });

      setEmployees(mappedEmployees);

      // Query outlets
      const { data: outData } = await supabase
        .from('outlets')
        .select('*')
        .order('name');
      setOutlets((outData || []) as OutletItem[]);

      // Query leaves with relations
      const { data: leavesData, error: lErr } = await supabase
        .from('employee_leaves')
        .select(`
          id,
          employee_id,
          outlet_id,
          start_at,
          end_at,
          reason,
          status,
          created_at,
          employees (
            employee_code,
            full_name
          ),
          outlets (
            code,
            name
          )
        `)
        .order('start_at', { ascending: false });

      if (lErr) throw lErr;

      const rawRows = (leavesData || []) as unknown as LeaveQueryResultRow[];
      const mapped: LeaveItem[] = rawRows.map((l) => {
        const emp = Array.isArray(l.employees) ? l.employees[0] : l.employees;
        const out = Array.isArray(l.outlets) ? l.outlets[0] : l.outlets;
        return {
          id: l.id,
          employee_id: l.employee_id,
          employee_name: emp?.full_name || 'Karyawan',
          employee_code: emp?.employee_code || 'EMP',
          outlet_id: l.outlet_id,
          outlet_name: out?.name || 'Cabang',
          start_at: l.start_at,
          end_at: l.end_at,
          reason: l.reason || null,
          status: l.status as LeaveStatus,
          created_at: l.created_at,
        };
      });

      setLeaves(mapped);
    } catch (err: unknown) {
      console.error('Error loading leaves:', err);
      onNotification?.({
        type: 'ERROR',
        message: mapEmployeeLeaveOperationError(err, 'load'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, onNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered leaves
  const filteredLeaves = useMemo(() => {
    return leaves.filter((l) => {
      const q = searchQuery.toLowerCase();
      const reason = l.reason || '';
      const matchSearch =
        (l.employee_name && l.employee_name.toLowerCase().includes(q)) ||
        (l.employee_code && l.employee_code.toLowerCase().includes(q)) ||
        reason.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'ALL' || l.status === statusFilter;
      const matchOutlet = outletFilter === 'ALL' || l.outlet_id === outletFilter;

      return matchSearch && matchStatus && matchOutlet;
    });
  }, [leaves, searchQuery, statusFilter, outletFilter]);

  // 2. Save Leave via RPC (save_employee_leave)
  const handleSaveLeave = async (data: {
    id?: string;
    employee_id: string;
    outlet_id: string;
    start_at: string;
    end_at: string;
    reason: string | null;
    status: LeaveStatus;
  }) => {
    const { error } = await supabase.rpc('save_employee_leave', {
      p_leave_id: data.id || null,
      p_employee_id: data.employee_id,
      p_outlet_id: data.outlet_id,
      p_start_at: data.start_at,
      p_end_at: data.end_at,
      p_reason: data.reason ? data.reason.trim() || null : null,
      p_status: data.status,
    });

    if (error) throw error;

    onNotification?.({
      type: 'SUCCESS',
      message: 'Catatan cuti karyawan berhasil disimpan!',
    });

    await loadData();
  };

  // 3. Quick Status Update via RPC (save_employee_leave)
  const handleQuickStatus = async (leave: LeaveItem, newStatus: LeaveStatus) => {
    setStatusUpdatingId(leave.id);
    try {
      const { error } = await supabase.rpc('save_employee_leave', {
        p_leave_id: leave.id,
        p_employee_id: leave.employee_id,
        p_outlet_id: leave.outlet_id,
        p_start_at: leave.start_at,
        p_end_at: leave.end_at,
        p_reason: leave.reason || null,
        p_status: newStatus,
      });

      if (error) throw error;

      onNotification?.({
        type: 'SUCCESS',
        message: `Status cuti berhasil diubah menjadi ${newStatus}!`,
      });

      await loadData();
    } catch (err: unknown) {
      console.error('Error updating leave status:', err);
      onNotification?.({
        type: 'ERROR',
        message: mapEmployeeLeaveOperationError(err, 'status'),
      });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const formatDisplayDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-400" />
            <span>Manajemen Cuti & Izin Karyawan</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Kelola permohonan cuti, libur khusus, sakit, dan riwayat persetujuan kehadiran.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingLeave(null);
            setIsModalOpen(true);
          }}
          disabled={employees.length === 0 || outlets.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md shadow-amber-500/20 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          <span>Ajukan / Catat Cuti</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama karyawan, kode staff, atau alasan cuti..."
            className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
          />
        </div>

        {/* Outlet Filter */}
        <select
          value={outletFilter}
          onChange={(e) => setOutletFilter(e.target.value)}
          className="w-full md:w-48 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
        >
          <option value="ALL">Semua Cabang</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full md:w-44 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
        >
          <option value="ALL">Semua Status</option>
          <option value="PENDING">PENDING (Menunggu)</option>
          <option value="APPROVED">APPROVED (Disetujui)</option>
          <option value="REJECTED">REJECTED (Ditolak)</option>
          <option value="CANCELLED">CANCELLED (Batal)</option>
        </select>
      </div>

      {/* Table */}
      <LeaveBookingImpacts outletId={outletFilter === 'ALL' ? undefined : outletFilter} refreshKey={leaves.map((leave) => `${leave.id}:${leave.status}:${leave.start_at}:${leave.end_at}`).join('|')} />
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm text-slate-400">Memuat riwayat cuti...</p>
          </div>
        ) : filteredLeaves.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            Tidak ada data cuti yang sesuai dengan pencarian atau filter Anda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="p-4">Karyawan</th>
                  <th className="p-4">Cabang</th>
                  <th className="p-4">Periode Cuti</th>
                  <th className="p-4">Alasan</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLeaves.map((leave) => {
                  const isUpdating = statusUpdatingId === leave.id;

                  return (
                    <tr
                      key={leave.id}
                      className="hover:bg-slate-800/40 transition group text-slate-300"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            {leave.employee_code}
                          </span>
                          <span className="font-bold text-white text-sm">
                            {leave.employee_name}
                          </span>
                        </div>
                      </td>

                      <td className="p-4 font-medium text-slate-300">
                        {leave.outlet_name}
                      </td>

                      <td className="p-4">
                        <div className="space-y-0.5 font-mono text-[11px] text-slate-300">
                          <div>Mulai: {formatDisplayDate(leave.start_at)}</div>
                          <div className="text-slate-500">Selesai: {formatDisplayDate(leave.end_at)}</div>
                        </div>
                      </td>

                      <td className="p-4 max-w-xs">
                        {leave.reason ? (
                          <p className="line-clamp-2 text-slate-300 italic text-[11px]">
                            &ldquo;{leave.reason}&rdquo;
                          </p>
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">- Tanpa keterangan -</span>
                        )}
                      </td>

                      <td className="p-4 text-center">
                        <span
                          className={`inline-block font-bold text-[10px] px-2.5 py-1 rounded-full border ${
                            leave.status === 'APPROVED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : leave.status === 'PENDING'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : leave.status === 'REJECTED'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-slate-800 text-slate-500 border-slate-700'
                          }`}
                        >
                          {leave.status}
                        </span>
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isUpdating ? (
                            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                          ) : (
                            <>
                              {leave.status !== 'APPROVED' && (
                                <button
                                  onClick={() => handleQuickStatus(leave, 'APPROVED')}
                                  className="p-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition text-[10px] font-semibold px-2"
                                  title="Setujui Cuti"
                                >
                                  Setujui
                                </button>
                              )}

                              {leave.status !== 'REJECTED' && (
                                <button
                                  onClick={() => handleQuickStatus(leave, 'REJECTED')}
                                  className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition text-[10px] font-semibold px-2"
                                  title="Tolak Cuti"
                                >
                                  Tolak
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setEditingLeave(leave);
                                  setIsModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 transition border border-slate-700"
                                title="Edit Cuti"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <LeaveFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveLeave}
        employees={employees}
        outlets={outlets}
        editingLeave={editingLeave}
      />
    </div>
  );
}
