'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { EmployeeItem, OutletItem } from '../../types/settings';
import { EmployeeFormModal } from './employee-form-modal';
import { EmployeeOutletAssignmentModal } from './employee-outlet-assignment-modal';
import {
  Users,
  Plus,
  Search,
  Edit2,
  CheckCircle2,
  XCircle,
  Phone,
  Mail,
  Loader2,
  Store,
  Calendar,
  Star,
} from 'lucide-react';

interface StaffSettingsPanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

export function StaffSettingsPanel({
  onNotification,
}: StaffSettingsPanelProps): React.JSX.Element {
  const { supabase, refreshData } = usePos();

  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [outlets, setOutlets] = useState<OutletItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeItem | null>(null);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [assigningEmployee, setAssigningEmployee] = useState<EmployeeItem | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  // 1. Load Employees & Outlets via SELECT
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Query outlets
      const { data: outletsData, error: outErr } = await supabase
        .from('outlets')
        .select('*')
        .order('name');
      if (outErr) throw outErr;
      setOutlets((outletsData || []) as OutletItem[]);

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

      const mapped: EmployeeItem[] = (empData || []).map((e: any) => {
        const assigned = (e.employee_outlets || []).map((ao: any) => {
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
          created_at: e.created_at,
          updated_at: e.updated_at,
          assigned_outlets: assigned,
        };
      });

      setEmployees(mapped);

      // Keep assigningEmployee updated if modal is open
      if (assigningEmployee) {
        const refreshed = mapped.find((m) => m.id === assigningEmployee.id);
        if (refreshed) setAssigningEmployee(refreshed);
      }
    } catch (err: unknown) {
      console.error('Error loading employees:', err);
      onNotification?.({
        type: 'ERROR',
        message: err instanceof Error ? err.message : 'Gagal memuat data staf',
      });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, onNotification, assigningEmployee]);

  useEffect(() => {
    loadData();
  }, []);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      const q = searchQuery.toLowerCase();
      const matchQuery =
        e.employee_code.toLowerCase().includes(q) ||
        e.full_name.toLowerCase().includes(q) ||
        (e.phone && e.phone.includes(q)) ||
        (e.email && e.email.toLowerCase().includes(q));

      const matchPos = positionFilter === 'ALL' || e.position === positionFilter;

      const matchStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'ACTIVE'
          ? e.is_active
          : !e.is_active;

      return matchQuery && matchPos && matchStatus;
    });
  }, [employees, searchQuery, positionFilter, statusFilter]);

  // 2. Save Employee via RPC (save_employee)
  const handleSaveEmployee = async (data: {
    id?: string;
    employee_code: string;
    full_name: string;
    phone?: string | null;
    email?: string | null;
    position: string;
    hire_date?: string | null;
    termination_date?: string | null;
    is_active: boolean;
  }) => {
    const { error } = await supabase.rpc('save_employee', {
      p_employee_id: data.id || null,
      p_employee_code: data.employee_code,
      p_full_name: data.full_name,
      p_phone: data.phone || null,
      p_email: data.email || null,
      p_position: data.position,
      p_hire_date: data.hire_date || null,
      p_termination_date: data.termination_date || null,
      p_is_active: data.is_active,
    });

    if (error) throw error;

    onNotification?.({
      type: 'SUCCESS',
      message: `Data staff ${data.full_name} (${data.employee_code}) berhasil disimpan!`,
    });

    await loadData();
    await refreshData();
  };

  // 3. Toggle Employee Status via RPC (save_employee)
  const handleToggleStatus = async (emp: EmployeeItem) => {
    setTogglingId(emp.id);
    try {
      const newStatus = !emp.is_active;
      const { error } = await supabase.rpc('save_employee', {
        p_employee_id: emp.id,
        p_employee_code: emp.employee_code,
        p_full_name: emp.full_name,
        p_phone: emp.phone || null,
        p_email: emp.email || null,
        p_position: emp.position,
        p_hire_date: emp.hire_date ? emp.hire_date.split('T')[0] : null,
        p_termination_date: emp.termination_date
          ? emp.termination_date.split('T')[0]
          : null,
        p_is_active: newStatus,
      });

      if (error) throw error;

      onNotification?.({
        type: 'SUCCESS',
        message: `Status staf ${emp.full_name} diubah menjadi ${
          newStatus ? 'Aktif' : 'Nonaktif'
        }`,
      });

      await loadData();
      await refreshData();
    } catch (err: unknown) {
      console.error('Error toggling employee status:', err);
      onNotification?.({
        type: 'ERROR',
        message: err instanceof Error ? err.message : 'Gagal mengubah status staf',
      });
    } finally {
      setTogglingId(null);
    }
  };

  // 4. Set Employee Outlet Assignment via RPC (set_employee_outlet)
  const handleAssignmentChange = async (
    employeeId: string,
    outletId: string,
    isPrimary: boolean,
    isActive: boolean
  ) => {
    const { error } = await supabase.rpc('set_employee_outlet', {
      p_employee_id: employeeId,
      p_outlet_id: outletId,
      p_is_primary: isPrimary,
      p_is_active: isActive,
    });

    if (error) throw error;

    onNotification?.({
      type: 'SUCCESS',
      message: 'Penugasan cabang outlet berhasil diperbarui!',
    });

    await loadData();
    await refreshData();
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            <span>Manajemen Staff & Kapster Barber</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Daftar karyawan, kapster, kasir, manajer, dan konfigurasi penugasan cabang.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingEmployee(null);
            setIsFormModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md shadow-amber-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Staff Baru</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode staff, nama, no HP, atau email..."
            className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
          />
        </div>

        {/* Position Filter */}
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="w-full md:w-44 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
        >
          <option value="ALL">Semua Jabatan</option>
          <option value="BARBER">BARBER</option>
          <option value="CASHIER">CASHIER</option>
          <option value="MANAGER">MANAGER</option>
          <option value="ADMIN">ADMIN</option>
        </select>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5 self-stretch md:self-auto bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          {(
            [
              { id: 'ALL', label: 'Semua' },
              { id: 'ACTIVE', label: 'Aktif' },
              { id: 'INACTIVE', label: 'Nonaktif' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === tab.id
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table / List */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm text-slate-400">Memuat data staf...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            Tidak ada data staf yang sesuai dengan kriteria pencarian.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="p-4">Karyawan</th>
                  <th className="p-4">Jabatan</th>
                  <th className="p-4">Kontak</th>
                  <th className="p-4">Cabang Penugasan</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredEmployees.map((emp) => {
                  const activeAssignments = (emp.assigned_outlets || []).filter(
                    (a) => a.is_active
                  );

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-800/40 transition group text-slate-300"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                            {emp.employee_code}
                          </span>
                          <div>
                            <div className="font-bold text-white text-sm leading-tight">
                              {emp.full_name}
                            </div>
                            {emp.hire_date && (
                              <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <Calendar className="w-3 h-3 text-slate-600" />
                                <span>Mulai: {emp.hire_date.split('T')[0]}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        <span
                          className={`inline-block font-bold text-[10px] px-2.5 py-1 rounded-full border ${
                            emp.position === 'BARBER'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : emp.position === 'CASHIER'
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                              : emp.position === 'MANAGER'
                              ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                              : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                          }`}
                        >
                          {emp.position}
                        </span>
                      </td>

                      <td className="p-4">
                        <div className="space-y-1 text-slate-400 text-[11px]">
                          {emp.phone && (
                            <div className="flex items-center gap-1.5">
                              <Phone className="w-3 h-3 text-slate-500" />
                              <span>{emp.phone}</span>
                            </div>
                          )}
                          {emp.email && (
                            <div className="flex items-center gap-1.5">
                              <Mail className="w-3 h-3 text-slate-500" />
                              <span className="truncate max-w-[150px]">{emp.email}</span>
                            </div>
                          )}
                          {!emp.phone && !emp.email && (
                            <span className="text-slate-600 italic">Belum diisi</span>
                          )}
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
                          {activeAssignments.length === 0 ? (
                            <span className="text-slate-500 italic text-[11px]">
                              Belum ditugaskan
                            </span>
                          ) : (
                            activeAssignments.map((ao) => (
                              <span
                                key={ao.outlet_id}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${
                                  ao.is_primary
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-slate-800 text-slate-300 border-slate-700'
                                }`}
                              >
                                {ao.is_primary && (
                                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                )}
                                <span>{ao.outlet_name}</span>
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleToggleStatus(emp)}
                          disabled={togglingId === emp.id}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                            emp.is_active
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                              : 'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-slate-700'
                          }`}
                          title="Klik untuk mengubah status aktif/nonaktif"
                        >
                          {togglingId === emp.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : emp.is_active ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          <span>{emp.is_active ? 'Aktif' : 'Nonaktif'}</span>
                        </button>
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setAssigningEmployee(emp);
                              setIsAssignModalOpen(true);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition text-[11px] font-medium border border-slate-700"
                            title="Kelola Penugasan Cabang Outlet"
                          >
                            <Store className="w-3.5 h-3.5 text-amber-400" />
                            <span className="hidden sm:inline">Cabang</span>
                          </button>

                          <button
                            onClick={() => {
                              setEditingEmployee(emp);
                              setIsFormModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 transition border border-slate-700"
                            title="Edit Data Staff"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* Modals */}
      <EmployeeFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSave={handleSaveEmployee}
        editingEmployee={editingEmployee}
      />

      <EmployeeOutletAssignmentModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        employee={assigningEmployee}
        outlets={outlets}
        onAssignmentChange={handleAssignmentChange}
      />
    </div>
  );
}
