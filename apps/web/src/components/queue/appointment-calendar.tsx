'use client';

import React, { useState } from 'react';
import { usePos } from '../../context/pos-context';
import type { AppointmentView, BarberEmployee } from '../../types/pos';
import {
  Calendar,
  Clock,
  Phone,
  ChevronLeft,
  ChevronRight,
  Plus,
  UserCheck,
  Loader2,
} from 'lucide-react';

interface AppointmentCalendarProps {
  appointments: AppointmentView[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onOpenBookingModal: (prefilledBarberId?: string) => void;
  onCheckInToQueue: (appointment: AppointmentView) => Promise<void>;
  onUpdateAppointmentStatus: (
    appointmentId: string,
    newStatus: AppointmentView['status']
  ) => Promise<void>;
}

export function AppointmentCalendar({
  appointments,
  selectedDate,
  onSelectDate,
  onOpenBookingModal,
  onCheckInToQueue,
  onUpdateAppointmentStatus,
}: AppointmentCalendarProps): React.JSX.Element {
  const { barbers } = usePos();

  const [selectedBarberFilter, setSelectedBarberFilter] = useState<string>('ALL');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Quick Date Selectors
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const changeDateByDays = (delta: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + delta);
    onSelectDate(current.toISOString().split('T')[0]);
  };

  // Filter appointments for the selected date & barber
  const filteredAppointments = appointments.filter((apt) => {
    const aptDate = apt.start_at.split('T')[0];
    const matchDate = aptDate === selectedDate;
    const matchBarber =
      selectedBarberFilter === 'ALL' || apt.barber_id === selectedBarberFilter;
    return matchDate && matchBarber;
  });

  const handleCheckIn = async (apt: AppointmentView) => {
    setProcessingId(apt.id);
    try {
      await onCheckInToQueue(apt);
    } finally {
      setProcessingId(null);
    }
  };

  const handleStatusChange = async (aptId: string, status: AppointmentView['status']) => {
    setProcessingId(aptId);
    try {
      await onUpdateAppointmentStatus(aptId, status);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Date Navigation & Filter Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Date Selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => changeDateByDays(-1)}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
              title="Hari Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onSelectDate(e.target.value)}
              className="px-3 py-1 bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
            />
            <button
              onClick={() => changeDateByDays(1)}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
              title="Hari Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => onSelectDate(todayStr)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              selectedDate === todayStr
                ? 'bg-amber-500 text-slate-950 shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            Hari Ini
          </button>
          <button
            onClick={() => onSelectDate(tomorrowStr)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              selectedDate === tomorrowStr
                ? 'bg-amber-500 text-slate-950 shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            Besok
          </button>
        </div>

        {/* Barber Filter & New Booking Button */}
        <div className="flex items-center gap-2.5">
          <select
            value={selectedBarberFilter}
            onChange={(e) => setSelectedBarberFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="ALL">Semua Barber (Kapster)</option>
            {barbers.map((b: BarberEmployee) => (
              <option key={b.id} value={b.id}>
                {b.full_name}
              </option>
            ))}
          </select>

          <button
            onClick={() => onOpenBookingModal()}
            className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Reservasi Baru</span>
          </button>
        </div>
      </div>

      {/* 2. Appointments List / Timeline View */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
            <h3 className="text-sm font-bold text-slate-900 break-words">
              Daftar Janji Temu (
              {new Date(selectedDate).toLocaleDateString('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              ) : {filteredAppointments.length} Reservasi
            </h3>
          </div>
          <span className="text-xs text-slate-500 shrink-0">
            Proteksi tabrakan aktif (PostgreSQL Exclusion Constraint)
          </span>
        </div>

        {filteredAppointments.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
            <Calendar className="w-12 h-12 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-semibold text-slate-700">Belum Ada Janji Temu</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Tidak ada reservasi yang dijadwalkan pada tanggal ini. Klik tombol &ldquo;Reservasi Baru&rdquo;
              untuk menambah janji temu.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAppointments.map((apt) => {
              const startTime = new Date(apt.start_at).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const endTime = new Date(apt.end_at).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              });

              const isArrived = apt.status === 'ARRIVED';
              const isConfirmed = apt.status === 'CONFIRMED' || apt.status === 'PENDING';
              const isCompleted = apt.status === 'COMPLETED';
              const isCancelled = apt.status === 'CANCELLED' || apt.status === 'NO_SHOW';

              return (
                <div
                  key={apt.id}
                  className={`min-w-0 overflow-hidden rounded-2xl border p-4 transition-all shadow-2xs flex flex-col justify-between ${
                    isArrived
                      ? 'bg-purple-50/50 border-purple-200'
                      : isCompleted
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : isCancelled
                      ? 'bg-slate-50 border-slate-200 opacity-60'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="min-w-0 w-full">
                    {/* Top row: Time & Status Badge */}
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 bg-slate-100 px-2 py-1 rounded-md shrink-0">
                        <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>
                          {startTime} - {endTime}
                        </span>
                      </div>

                      {apt.status === 'CONFIRMED' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 shrink-0">
                          Terkonfirmasi
                        </span>
                      )}
                      {apt.status === 'PENDING' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
                          Pending
                        </span>
                      )}
                      {apt.status === 'ARRIVED' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 flex items-center gap-1 shrink-0">
                          <UserCheck className="w-3 h-3 shrink-0" />
                          <span>Telah Check-in</span>
                        </span>
                      )}
                      {apt.status === 'COMPLETED' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                          Selesai
                        </span>
                      )}
                      {apt.status === 'CANCELLED' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 shrink-0">
                          Dibatalkan
                        </span>
                      )}
                      {apt.status === 'NO_SHOW' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 shrink-0">
                          Tidak Hadir
                        </span>
                      )}
                    </div>

                    {/* Customer Info */}
                    <div className="mb-3 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <h4
                          className="text-sm font-bold text-slate-900 leading-tight line-clamp-2 break-words [overflow-wrap:anywhere]"
                          title={apt.customer_name}
                        >
                          {apt.customer_name}
                        </h4>
                        {!apt.customer_id ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">
                            Guest
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                            Customer
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 min-w-0">
                        <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="min-w-0 truncate break-all [overflow-wrap:anywhere]">
                          {apt.customer_phone || '-'}
                        </span>
                      </p>
                    </div>

                    {/* Service & Barber */}
                    <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-3 min-w-0">
                      <div className="flex items-start justify-between gap-3 min-w-0">
                        <span className="text-slate-400 shrink-0">Layanan:</span>
                        <span className="font-semibold text-slate-800 min-w-0 text-right break-words [overflow-wrap:anywhere]">
                          {apt.service_name}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3 min-w-0">
                        <span className="text-slate-400 shrink-0">Kapster:</span>
                        <span className="font-semibold text-slate-800 min-w-0 text-right break-words [overflow-wrap:anywhere]">
                          {apt.barber_name}
                        </span>
                      </div>
                      {apt.notes && (
                        <div
                          className="pt-1.5 border-t border-slate-200 text-[11px] text-slate-500 italic min-w-0 break-words [overflow-wrap:anywhere] line-clamp-2"
                          title={apt.notes}
                        >
                          &ldquo;{apt.notes}&rdquo;
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-slate-100 min-w-0 w-full">
                    {isConfirmed && (
                      <div className="space-y-1.5 min-w-0">
                        <button
                          disabled={processingId === apt.id}
                          onClick={() => handleCheckIn(apt)}
                          className="w-full py-2 px-3 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5 disabled:opacity-50 min-w-0"
                        >
                          {processingId === apt.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span className="truncate">Check-in ke Antrean Kursi</span>
                        </button>

                        <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                          <button
                            disabled={processingId === apt.id}
                            onClick={() => handleStatusChange(apt.id, 'NO_SHOW')}
                            className="text-[11px] text-slate-500 hover:text-slate-800 px-2 py-1 shrink-0"
                          >
                            Tidak Hadir
                          </button>
                          <button
                            disabled={processingId === apt.id}
                            onClick={() => handleStatusChange(apt.id, 'CANCELLED')}
                            className="text-[11px] text-red-500 hover:text-red-700 px-2 py-1 shrink-0"
                          >
                            Batalkan
                          </button>
                        </div>
                      </div>
                    )}

                    {isArrived && (
                      <div className="text-center py-1 min-w-0">
                        <span className="inline-block max-w-full text-xs font-semibold text-purple-700 bg-purple-100 px-2.5 py-1 rounded-lg truncate">
                          ✓ Sedang Masuk Antrean Kursi
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
