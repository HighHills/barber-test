'use client';

import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import type { BarberEmployee, CatalogItem, CustomerOption } from '../../types/pos';
import { customerService } from '../../services/customer-service';
import { appointmentService } from '../../services/appointment-service';
import {
  X,
  Calendar,
  UserCheck,
  UserPlus,
  AlertCircle,
  Loader2,
  FileText,
  Search,
  CheckCircle2,
} from 'lucide-react';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  availableServices: CatalogItem[];
  prefilledDate?: string;
  prefilledBarberId?: string;
}

export function AppointmentModal({
  isOpen,
  onClose,
  onSuccess,
  availableServices,
  prefilledDate,
  prefilledBarberId,
}: AppointmentModalProps): React.JSX.Element | null {
  const { supabase, currentOutlet, barbers } = usePos();

  // Mode: Customer
  const [customerMode, setCustomerMode] = useState<'NEW' | 'EXISTING'>('NEW');
  const [newCustomerName, setNewCustomerName] = useState<string>('');
  const [newCustomerPhone, setNewCustomerPhone] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [existingCustomers, setExistingCustomers] = useState<CustomerOption[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [isSearchingCustomer, setIsSearchingCustomer] = useState<boolean>(false);

  // Booking Form State
  const todayStr = prefilledDate || new Date().toISOString().split('T')[0];
  const [bookingDate, setBookingDate] = useState<string>(todayStr || '');
  const [bookingTime, setBookingTime] = useState<string>('10:00');
  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    availableServices[0]?.id || ''
  );
  const [selectedBarberId, setSelectedBarberId] = useState<string>(
    prefilledBarberId || barbers[0]?.id || ''
  );
  const [notes, setNotes] = useState<string>('');

  // Status & Error
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync initial state if props change
  useEffect(() => {
    if (prefilledBarberId) setSelectedBarberId(prefilledBarberId);
    if (prefilledDate) setBookingDate(prefilledDate);
  }, [prefilledBarberId, prefilledDate]);

  // Search existing customers
  useEffect(() => {
    if (!isOpen || customerMode !== 'EXISTING') return;

    let isMounted = true;
    const fetchCustomers = async () => {
      setIsSearchingCustomer(true);
      try {
        let query = supabase
          .from('customers')
          .select('id, customer_code, full_name, phone, email')
          .eq('is_active', true)
          .order('full_name')
          .limit(20);

        if (customerSearchQuery.trim()) {
          query = query.or(
            `full_name.ilike.%${customerSearchQuery.trim()}%,phone.ilike.%${customerSearchQuery.trim()}%`
          );
        }

        const { data, error } = await query;
        if (error) throw error;

        if (isMounted && data) {
          setExistingCustomers(data as CustomerOption[]);
        }
      } catch (err: unknown) {
        console.error('Customer query error:', err);
      } finally {
        if (isMounted) setIsSearchingCustomer(false);
      }
    };

    const timer = setTimeout(fetchCustomers, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, customerMode, customerSearchQuery, supabase]);

  if (!isOpen) return null;

  const selectedService = availableServices.find((s) => s.id === selectedServiceId);
  const durationMinutes = selectedService?.duration_minutes || 45;

  // Calculate End Time
  const calculateEndDateTime = (dateStr: string, timeStr: string, duration: number): Date => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date(dateStr);
    date.setHours(hours || 0, minutes || 0, 0, 0);
    return new Date(date.getTime() + duration * 60000);
  };

  const startDateTime = new Date(`${bookingDate}T${bookingTime}:00`);
  const endDateTime = calculateEndDateTime(bookingDate, bookingTime, durationMinutes);

  const formattedEndTime = endDateTime.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOutlet) {
      setErrorMessage('Pilih cabang outlet terlebih dahulu.');
      return;
    }
    if (!selectedBarberId) {
      setErrorMessage('Silakan pilih salah satu Barber untuk janji temu.');
      return;
    }
    if (!selectedServiceId) {
      setErrorMessage('Silakan pilih Layanan pangkas.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      let finalCustomerId: string | null = null;
      let finalCustomerName = '';

      // 1. Resolve Customer (appointments table strictly requires customer_id NOT NULL)
      if (customerMode === 'NEW') {
        const phone = newCustomerPhone.trim() || '080000000000';

        const newCust = await customerService.createCustomer(
          {
            full_name: newCustomerName.trim(),
            phone: phone,
          },
          supabase
        );

        finalCustomerId = newCust.id;
        finalCustomerName = newCust.full_name;
      } else {
        if (!selectedCustomerId) {
          throw new Error('Silakan pilih pelanggan terdaftar dari daftar.');
        }
        finalCustomerId = selectedCustomerId;
        const custObj = existingCustomers.find((c) => c.id === selectedCustomerId);
        finalCustomerName = custObj?.full_name || 'Pelanggan Terdaftar';
      }

      // 2. Pre-check frontend collision for user-friendly early feedback
      const { data: overlapping, error: checkErr } = await supabase
        .from('appointments')
        .select('id, appointment_number, start_at, end_at')
        .eq('barber_id', selectedBarberId)
        .not('status', 'in', '("CANCELLED","NO_SHOW")')
        .lt('start_at', endDateTime.toISOString())
        .gt('end_at', startDateTime.toISOString());

      if (checkErr) {
        console.warn('Pre-check appointment error:', checkErr);
      }

      if (overlapping && overlapping.length > 0) {
        throw new Error(
          `Jadwal tabrakan: Barber yang dipilih telah memiliki janji temu aktif pada rentang waktu ini (${overlapping[0].appointment_number}). Silakan pilih jam atau barber lain.`
        );
      }

      // 3. Create Appointment via Authoritative Backend RPC
      const newApt = await appointmentService.createAppointment(
        {
          customer_id: finalCustomerId,
          outlet_id: currentOutlet.id,
          service_id: selectedServiceId,
          barber_id: selectedBarberId,
          start_at: startDateTime.toISOString(),
          notes: notes.trim() || null,
          status: 'CONFIRMED',
        },
        supabase
      );

      // Extract server-derived end time for user feedback
      const serverEndDate = new Date(newApt.end_at);
      const serverEndTime = !isNaN(serverEndDate.getTime())
        ? serverEndDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
        : formattedEndTime;

      onSuccess(
        `Janji Temu #${newApt.appointment_number} untuk ${newApt.customer_name || finalCustomerName} pada jam ${bookingTime} - ${serverEndTime} berhasil dikonfirmasi.`
      );
      onClose();
    } catch (err: unknown) {
      console.error('Appointment submit error:', err);
      setErrorMessage(
        err instanceof Error ? err.message : 'Terjadi kesalahan sistem saat membuat janji temu.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-slate-950 rounded-xl font-bold shadow-sm">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Reservasi Janji Temu</h2>
              <p className="text-xs font-medium text-slate-300">
                Booking jadwal layanan pangkas terproteksi tabrakan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Customer Selection Mode */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Data Pelanggan
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl mb-3">
              <button
                type="button"
                onClick={() => setCustomerMode('NEW')}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  customerMode === 'NEW'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Pelanggan Baru</span>
              </button>
              <button
                type="button"
                onClick={() => setCustomerMode('EXISTING')}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  customerMode === 'EXISTING'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Pelanggan Terdaftar</span>
              </button>
            </div>

            {customerMode === 'NEW' ? (
              <div className="space-y-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nama pelanggan..."
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nomor WhatsApp / HP
                  </label>
                  <input
                    type="tel"
                    placeholder="08xxxxxxxxxx"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari pelanggan..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>
                <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg bg-white divide-y divide-slate-100">
                  {existingCustomers.length === 0 ? (
                    <div className="p-2 text-center text-xs text-slate-400">
                      {isSearchingCustomer ? 'Mencari...' : 'Tidak ada data pelanggan.'}
                    </div>
                  ) : (
                    existingCustomers.map((cust) => (
                      <button
                        key={cust.id}
                        type="button"
                        onClick={() => setSelectedCustomerId(cust.id)}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-slate-50 ${
                          selectedCustomerId === cust.id ? 'bg-amber-50 font-bold text-amber-900' : ''
                        }`}
                      >
                        <span>{cust.full_name}</span>
                        <span className="text-slate-400 text-[11px]">{cust.phone}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Service & Barber Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Layanan Pangkas <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              >
                {availableServices.map((srv) => (
                  <option key={srv.id} value={srv.id}>
                    {srv.name} ({srv.duration_minutes || 45} mnt)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Barber (Kapster) <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedBarberId}
                onChange={(e) => setSelectedBarberId(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              >
                {barbers.map((b: BarberEmployee) => (
                  <option key={b.id} value={b.id}>
                    {b.full_name} ({b.position || 'Barber'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3 bg-amber-50/60 p-3.5 rounded-xl border border-amber-200/80">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Tanggal Booking
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={bookingDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Jam Mulai & Estimasi Selesai
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  required
                  value={bookingTime}
                  step="900" // 15 mins step
                  onChange={(e) => setBookingTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                />
                <span className="text-xs text-slate-500 font-semibold">s/d</span>
                <div className="px-2 py-1.5 text-xs font-bold text-slate-800 bg-amber-200/70 rounded-lg whitespace-nowrap">
                  {formattedEndTime}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Catatan Khusus (Opsional)
            </label>
            <div className="relative">
              <FileText className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Contoh: Minta potongan fade rendah, bawa anak kecil..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span>Memvalidasi Slot...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Konfirmasi Reservasi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
