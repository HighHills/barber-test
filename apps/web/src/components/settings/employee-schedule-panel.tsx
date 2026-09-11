'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePos } from '../../context/pos-context';
import type {
  EmployeeItem,
  ScheduleDayItem,
  WeeklySchedulePayloadItem,
} from '../../types/settings';
import {
  CalendarDays,
  Save,
  Loader2,
  Clock,
  Coffee,
  AlertCircle,
  User,
  Store,
  Copy,
} from 'lucide-react';

interface EmployeeSchedulePanelProps {
  onNotification?: (notif: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}

const defaultWeekDays: Array<{ day_of_week: number; day_name: string }> = [
  { day_of_week: 1, day_name: 'Senin' },
  { day_of_week: 2, day_name: 'Selasa' },
  { day_of_week: 3, day_name: 'Rabu' },
  { day_of_week: 4, day_name: 'Kamis' },
  { day_of_week: 5, day_name: 'Jumat' },
  { day_of_week: 6, day_name: 'Sabtu' },
  { day_of_week: 0, day_name: 'Minggu' },
];

export function EmployeeSchedulePanel({
  onNotification,
}: EmployeeSchedulePanelProps): React.JSX.Element {
  const { supabase, currentOutlet, availableOutlets } = usePos();

  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');

  const [schedules, setSchedules] = useState<ScheduleDayItem[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // 1. Load Employees & Initial Outlets
  useEffect(() => {
    async function fetchEmployees() {
      try {
        const { data } = await supabase
          .from('employees')
          .select('id, employee_code, full_name, position, is_active')
          .eq('is_active', true)
          .order('full_name');

        const list = (data || []) as EmployeeItem[];
        setEmployees(list);
        if (list.length > 0) {
          setSelectedEmployeeId(list[0].id);
        }
      } catch (err) {
        console.error('Error fetching employees for schedule:', err);
      }
    }

    fetchEmployees();

    if (currentOutlet) {
      setSelectedOutletId(currentOutlet.id);
    } else if (availableOutlets.length > 0) {
      setSelectedOutletId(availableOutlets[0].id);
    }
  }, [supabase, currentOutlet, availableOutlets]);

  // 2. Load Schedules for (employee, outlet) via SELECT
  const loadSchedules = useCallback(async () => {
    if (!selectedEmployeeId || !selectedOutletId) {
      setSchedules([]);
      return;
    }

    setIsLoadingSchedules(true);
    setValidationError(null);

    try {
      const { data, error } = await supabase
        .from('employee_schedules')
        .select('*')
        .eq('employee_id', selectedEmployeeId)
        .eq('outlet_id', selectedOutletId)
        .order('day_of_week');

      if (error) throw error;

      // Map rows into all 7 days
      const mapped: ScheduleDayItem[] = defaultWeekDays.map((d) => {
        const found = (data || []).find((s: any) => s.day_of_week === d.day_of_week);
        if (found) {
          const hasBreak = Boolean(found.break_start && found.break_end);
          return {
            id: found.id,
            day_of_week: d.day_of_week,
            day_name: d.day_name,
            is_active: Boolean(found.is_active),
            start_time: found.start_time ? found.start_time.slice(0, 5) : '09:00',
            end_time: found.end_time ? found.end_time.slice(0, 5) : '21:00',
            has_break: hasBreak,
            break_start: found.break_start ? found.break_start.slice(0, 5) : '12:00',
            break_end: found.break_end ? found.break_end.slice(0, 5) : '13:00',
          };
        }

        // Default day off or active
        const isSun = d.day_of_week === 0;
        return {
          day_of_week: d.day_of_week,
          day_name: d.day_name,
          is_active: !isSun, // default Sunday is off
          start_time: '09:00',
          end_time: '21:00',
          has_break: true,
          break_start: '12:00',
          break_end: '13:00',
        };
      });

      setSchedules(mapped);
    } catch (err: unknown) {
      console.error('Error loading employee schedules:', err);
      onNotification?.({
        type: 'ERROR',
        message: err instanceof Error ? err.message : 'Gagal memuat jadwal kerja staf',
      });
    } finally {
      setIsLoadingSchedules(false);
    }
  }, [supabase, selectedEmployeeId, selectedOutletId, onNotification]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  // Handle single day field change
  const handleDayChange = <K extends keyof ScheduleDayItem>(
    index: number,
    field: K,
    value: ScheduleDayItem[K]
  ) => {
    setSchedules((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Quick action: copy schedule of Monday to Tuesday-Saturday
  const handleCopyMondayToWeek = () => {
    if (schedules.length === 0) return;
    const monday = schedules.find((s) => s.day_of_week === 1);
    if (!monday) return;

    setSchedules((prev) =>
      prev.map((item) => {
        if (item.day_of_week === 0) return item; // Keep Sunday as is
        return {
          ...item,
          is_active: monday.is_active,
          start_time: monday.start_time,
          end_time: monday.end_time,
          has_break: monday.has_break,
          break_start: monday.break_start,
          break_end: monday.break_end,
        };
      })
    );
  };

  // 3. Save Schedules via Atomic Weekly RPC (save_employee_weekly_schedule)
  const handleSaveAll = async () => {
    if (!selectedEmployeeId || !selectedOutletId) {
      setValidationError('Pilih staf dan cabang outlet terlebih dahulu.');
      return;
    }

    // Validation
    for (const day of schedules) {
      if (day.is_active) {
        if (!day.start_time || !day.end_time || day.start_time >= day.end_time) {
          setValidationError(
            `Jam kerja hari ${day.day_name} tidak valid: Jam selesai (${day.end_time || '-'}) harus lebih besar dari jam mulai (${day.start_time || '-'}).`
          );
          return;
        }

        if (day.has_break) {
          const bStart = day.break_start?.trim();
          const bEnd = day.break_end?.trim();

          if (!bStart || !bEnd) {
            setValidationError(
              `Jam istirahat hari ${day.day_name} belum diisi lengkap.`
            );
            return;
          }
          if (bStart >= bEnd) {
            setValidationError(
              `Jam istirahat hari ${day.day_name} tidak valid: Selesai istirahat (${bEnd}) harus setelah mulai istirahat (${bStart}).`
            );
            return;
          }
          if (bStart < day.start_time || bEnd > day.end_time) {
            setValidationError(
              `Jam istirahat hari ${day.day_name} harus berada di antara jam kerja (${day.start_time} - ${day.end_time}).`
            );
            return;
          }
        }
      }
    }

    // Build 7-day atomic payload (days 0..6: Sunday through Saturday)
    const allDaysOfWeek = [0, 1, 2, 3, 4, 5, 6];
    const schedulesPayload: WeeklySchedulePayloadItem[] = allDaysOfWeek.map((dow) => {
      const day = schedules.find((s) => s.day_of_week === dow);
      if (!day) {
        return {
          day_of_week: dow,
          start_time: '09:00',
          end_time: '21:00',
          break_start: null,
          break_end: null,
          is_active: false,
        };
      }

      const isActive = Boolean(day.is_active);
      let startTime = day.start_time || '09:00';
      let endTime = day.end_time || '21:00';

      // For inactive / off days, ensure start_time < end_time so it always passes backend time checks
      if (!isActive && startTime >= endTime) {
        startTime = '09:00';
        endTime = '21:00';
      }

      const hasBreak =
        isActive &&
        Boolean(day.has_break) &&
        Boolean(day.break_start?.trim()) &&
        Boolean(day.break_end?.trim());

      return {
        day_of_week: day.day_of_week,
        start_time: startTime,
        end_time: endTime,
        break_start: hasBreak ? day.break_start.trim() : null,
        break_end: hasBreak ? day.break_end.trim() : null,
        is_active: isActive,
      };
    });

    setValidationError(null);
    setIsSaving(true);

    try {
      // Single atomic RPC invocation for the entire week
      const { error } = await supabase.rpc('save_employee_weekly_schedule', {
        p_employee_id: selectedEmployeeId,
        p_outlet_id: selectedOutletId,
        p_schedules: schedulesPayload,
      });

      if (error) throw error;

      const empName =
        employees.find((e) => e.id === selectedEmployeeId)?.full_name || 'Staf';
      onNotification?.({
        type: 'SUCCESS',
        message: `Jadwal mingguan untuk ${empName} berhasil disimpan!`,
      });

      await loadSchedules();
    } catch (err: unknown) {
      console.error('Error saving employee schedule:', err);
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan jadwal';
      setValidationError(msg);
      onNotification?.({ type: 'ERROR', message: msg });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-amber-400" />
            <span>Pengaturan Jadwal Kerja Staf & Kapster</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Atur jam operasional, shift harian, dan waktu istirahat staf per cabang.
          </p>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={isSaving || isLoadingSchedules || !selectedEmployeeId}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md shadow-amber-500/20 disabled:opacity-40"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Menyimpan Seluruh Jadwal...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Simpan Jadwal Mingguan</span>
            </>
          )}
        </button>
      </div>

      {validationError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Selectors Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
        {/* Select Staff */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-amber-400" />
            <span>Pilih Karyawan / Kapster</span>
          </label>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name} ({emp.employee_code}) — {emp.position}
              </option>
            ))}
          </select>
        </div>

        {/* Select Outlet */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-amber-400" />
            <span>Pilih Cabang Penugasan</span>
          </label>
          <select
            value={selectedOutletId}
            onChange={(e) => setSelectedOutletId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
          >
            {availableOutlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name} ({outlet.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Days Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-300 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Rincian Jadwal Hari (Senin - Minggu)</span>
          </div>

          <button
            type="button"
            onClick={handleCopyMondayToWeek}
            disabled={schedules.length === 0}
            className="text-[11px] font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Salin Jadwal Senin ke Sel-Sab</span>
          </button>
        </div>

        {isLoadingSchedules ? (
          <div className="flex flex-col items-center justify-center p-16 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm text-slate-400">Memuat jadwal kerja...</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {schedules.map((day, idx) => (
              <div
                key={day.day_of_week}
                className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition ${
                  day.is_active ? 'bg-transparent' : 'bg-slate-950/30 opacity-60'
                }`}
              >
                {/* Day name & Active Switch */}
                <div className="flex items-center gap-3 w-40">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={day.is_active}
                      onChange={(e) => handleDayChange(idx, 'is_active', e.target.checked)}
                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                    />
                    <span
                      className={`text-sm font-bold ${
                        day.is_active ? 'text-white' : 'text-slate-500 line-through'
                      }`}
                    >
                      {day.day_name}
                    </span>
                  </label>
                  {!day.is_active && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                      Libur
                    </span>
                  )}
                </div>

                {/* Working Hours */}
                {day.is_active ? (
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    {/* Shift start / end */}
                    <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
                      <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-slate-400 font-medium">Shift:</span>
                      <input
                        type="time"
                        value={day.start_time}
                        onChange={(e) => handleDayChange(idx, 'start_time', e.target.value)}
                        className="bg-transparent text-white font-mono focus:outline-none w-16"
                      />
                      <span className="text-slate-600">-</span>
                      <input
                        type="time"
                        value={day.end_time}
                        onChange={(e) => handleDayChange(idx, 'end_time', e.target.value)}
                        className="bg-transparent text-white font-mono focus:outline-none w-16"
                      />
                    </div>

                    {/* Break */}
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-400">
                        <input
                          type="checkbox"
                          checked={day.has_break}
                          onChange={(e) => handleDayChange(idx, 'has_break', e.target.checked)}
                          className="w-3.5 h-3.5 accent-amber-500 rounded cursor-pointer"
                        />
                        <Coffee className="w-3.5 h-3.5 text-amber-400" />
                        <span>Istirahat:</span>
                      </label>

                      {day.has_break ? (
                        <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
                          <input
                            type="time"
                            value={day.break_start}
                            onChange={(e) => handleDayChange(idx, 'break_start', e.target.value)}
                            className="bg-transparent text-white font-mono focus:outline-none w-16"
                          />
                          <span className="text-slate-600">-</span>
                          <input
                            type="time"
                            value={day.break_end}
                            onChange={(e) => handleDayChange(idx, 'break_end', e.target.value)}
                            className="bg-transparent text-white font-mono focus:outline-none w-16"
                          />
                        </div>
                      ) : (
                        <span className="text-slate-600 italic text-[11px]">Tanpa istirahat</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">
                    Staf dijadwalkan libur pada hari {day.day_name}.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
