'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePos, PosProvider } from '../../context/pos-context';
import type {
  QueueItemView,
  AppointmentView,
  CatalogItem,
} from '../../types/pos';
import { QueueBoard } from '../../components/queue/queue-board';
import { AppointmentCalendar } from '../../components/queue/appointment-calendar';
import { WalkinModal } from '../../components/queue/walkin-modal';
import { AppointmentModal } from '../../components/queue/appointment-modal';
import {
  ArrowLeft,
  Calendar,
  Users,
  Scissors,
  RefreshCw,
  Clock,
  History,
  Package,
  AlertCircle,
  CheckCircle2,
  X,
  Store,
  Coins,
  BarChart3,
  TrendingUp,
} from 'lucide-react';

function QueueManagementContent(): React.JSX.Element {
  const { supabase, currentOutlet, availableOutlets, setCurrentOutlet, isCashier } = usePos();

  const [activeTab, setActiveTab] = useState<'BOARD' | 'APPOINTMENTS' | 'HISTORY'>('BOARD');

  // Data States
  const [queues, setQueues] = useState<QueueItemView[]>([]);
  const [appointments, setAppointments] = useState<AppointmentView[]>([]);
  const [availableServices, setAvailableServices] = useState<CatalogItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Modals & UI States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isWalkinModalOpen, setIsWalkinModalOpen] = useState<boolean>(false);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState<boolean>(false);
  const [bookingPrefilledBarber, setBookingPrefilledBarber] = useState<string | undefined>(undefined);

  // Notification Banner
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // 1. Fetch Services for current outlet
  const loadServices = useCallback(async () => {
    if (!currentOutlet) return;
    try {
      const { data, error } = await supabase
        .from('services')
        .select(`
          id,
          code,
          name,
          description,
          duration_minutes,
          service_outlets!inner(selling_price, is_active)
        `)
        .eq('is_active', true)
        .eq('service_outlets.outlet_id', currentOutlet.id)
        .eq('service_outlets.is_active', true);

      if (!error && data) {
        const formatted: CatalogItem[] = data.map((d: any) => {
          const outletPricing = Array.isArray(d.service_outlets)
            ? d.service_outlets[0]
            : d.service_outlets;
          return {
            id: d.id,
            type: 'SERVICE',
            code: d.code,
            name: d.name,
            description: d.description,
            selling_price: Number(outletPricing?.selling_price) || 0,
            duration_minutes: d.duration_minutes || 45,
          };
        });
        setAvailableServices(formatted);
      }
    } catch (err) {
      console.warn('Failed to load services:', err);
    }
  }, [supabase, currentOutlet]);

  // 2. Fetch Queues for Today
  const loadQueues = useCallback(async () => {
    if (!currentOutlet) return;
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('queues')
        .select(`
          id,
          queue_number,
          outlet_id,
          customer_id,
          appointment_id,
          barber_id,
          status,
          joined_at,
          called_at,
          started_at,
          completed_at,
          customers(full_name, phone),
          employees!barber_id(full_name)
        `)
        .eq('outlet_id', currentOutlet.id)
        .gte('joined_at', todayStart.toISOString())
        .order('queue_number', { ascending: true });

      if (error) {
        console.error('Queue load error:', error);
        return;
      }

      // Read stored services map for queues
      const queueServices = JSON.parse(localStorage.getItem('barber_queue_services') || '{}');

      const mapped: QueueItemView[] = (data || []).map((q: any) => {
        const cust = q.customers;
        const emp = q.employees;
        const savedSrv = queueServices[q.id];

        return {
          id: q.id,
          queue_number: q.queue_number,
          outlet_id: q.outlet_id,
          customer_id: q.customer_id,
          customer_name: cust?.full_name || null,
          customer_phone: cust?.phone || null,
          appointment_id: q.appointment_id,
          barber_id: q.barber_id,
          barber_name: emp?.full_name || null,
          status: q.status,
          joined_at: q.joined_at,
          called_at: q.called_at,
          started_at: q.started_at,
          completed_at: q.completed_at,
          service_id: savedSrv?.service_id || null,
          service_name: savedSrv?.service_name || null,
          service_price: savedSrv?.selling_price || null,
        };
      });

      setQueues(mapped);
    } catch (err) {
      console.error('Error fetching queues:', err);
    }
  }, [supabase, currentOutlet]);

  // 3. Fetch Appointments
  const loadAppointments = useCallback(async () => {
    if (!currentOutlet) return;
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          appointment_number,
          customer_id,
          outlet_id,
          service_id,
          barber_id,
          start_at,
          end_at,
          status,
          notes,
          created_at,
          customers(full_name, phone),
          services(name, duration_minutes),
          employees!barber_id(full_name)
        `)
        .eq('outlet_id', currentOutlet.id)
        .order('start_at', { ascending: true });

      if (error) {
        console.error('Appointment load error:', error);
        return;
      }

      const mapped: AppointmentView[] = (data || []).map((a: any) => ({
        id: a.id,
        appointment_number: a.appointment_number,
        customer_id: a.customer_id,
        customer_name: a.customers?.full_name || 'Pelanggan',
        customer_phone: a.customers?.phone || '',
        outlet_id: a.outlet_id,
        service_id: a.service_id,
        service_name: a.services?.name || 'Layanan Pangkas',
        service_duration: a.services?.duration_minutes || 45,
        barber_id: a.barber_id,
        barber_name: a.employees?.full_name || 'Barber',
        start_at: a.start_at,
        end_at: a.end_at,
        status: a.status,
        notes: a.notes,
        created_at: a.created_at,
      }));

      setAppointments(mapped);
    } catch (err) {
      console.error('Error fetching appointments:', err);
    }
  }, [supabase, currentOutlet]);

  // Refresh all data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadServices(), loadQueues(), loadAppointments()]);
    setIsRefreshing(false);
  };

  // Initial Data Load & Supabase Realtime Channels
  useEffect(() => {
    if (!currentOutlet) return;

    let isMounted = true;
    const init = async () => {
      setIsLoading(true);
      await Promise.all([loadServices(), loadQueues(), loadAppointments()]);
      if (isMounted) setIsLoading(false);
    };

    init();

    // Setup Supabase Realtime Subscription for Queues
    const queueChannel = supabase
      .channel(`rt-queues-${currentOutlet.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queues',
          filter: `outlet_id=eq.${currentOutlet.id}`,
        },
        () => {
          loadQueues();
        }
      )
      .subscribe();

    // Setup Supabase Realtime Subscription for Appointments
    const appointmentChannel = supabase
      .channel(`rt-appointments-${currentOutlet.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `outlet_id=eq.${currentOutlet.id}`,
        },
        () => {
          loadAppointments();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(queueChannel);
      supabase.removeChannel(appointmentChannel);
    };
  }, [supabase, currentOutlet, loadServices, loadQueues, loadAppointments]);

  // Queue Status Transition Handler
  const handleUpdateQueueStatus = async (
    queueId: string,
    newStatus: QueueItemView['status'],
    barberId?: string
  ) => {
    try {
      const nowIso = new Date().toISOString();
      const updates: any = { status: newStatus };

      if (barberId) updates.barber_id = barberId;
      if (newStatus === 'CALLED') updates.called_at = nowIso;
      if (newStatus === 'IN_SERVICE') updates.started_at = nowIso;
      if (newStatus === 'COMPLETED') updates.completed_at = nowIso;

      const { error } = await supabase.from('queues').update(updates).eq('id', queueId);
      if (error) throw error;

      // Also check if this queue was linked to an appointment
      const queueObj = queues.find((q) => q.id === queueId);
      if (queueObj?.appointment_id) {
        let aptStatus: AppointmentView['status'] | null = null;
        if (newStatus === 'IN_SERVICE') aptStatus = 'IN_SERVICE';
        if (newStatus === 'COMPLETED') aptStatus = 'COMPLETED';
        if (newStatus === 'CANCELLED') aptStatus = 'CANCELLED';
        if (newStatus === 'NO_SHOW') aptStatus = 'NO_SHOW';

        if (aptStatus) {
          await supabase
            .from('appointments')
            .update({ status: aptStatus })
            .eq('id', queueObj.appointment_id);
        }
      }

      await loadQueues();
      setFeedback({
        type: 'success',
        message: `Status antrean berhasil diperbarui menjadi ${newStatus}.`,
      });
    } catch (err: unknown) {
      console.error('Update queue error:', err);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal memperbarui status antrean.',
      });
    }
  };

  // Check-in Appointment into Live Queue
  const handleCheckInToQueue = async (appointment: AppointmentView) => {
    if (!currentOutlet) return;
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Get next queue number
      const { data: maxQ } = await supabase
        .from('queues')
        .select('queue_number')
        .eq('outlet_id', currentOutlet.id)
        .gte('joined_at', todayStart.toISOString())
        .order('queue_number', { ascending: false })
        .limit(1);

      const nextNum = maxQ && maxQ.length > 0 && maxQ[0]?.queue_number ? maxQ[0].queue_number + 1 : 1;

      // Insert to queues
      const { data: newQ, error: qErr } = await supabase
        .from('queues')
        .insert({
          queue_number: nextNum,
          outlet_id: currentOutlet.id,
          customer_id: appointment.customer_id,
          appointment_id: appointment.id,
          barber_id: appointment.barber_id,
          status: 'WAITING',
          joined_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (qErr) throw qErr;

      // Save service prefill
      if (newQ?.id && appointment.service_id) {
        try {
          const queueServices = JSON.parse(localStorage.getItem('barber_queue_services') || '{}');
          queueServices[newQ.id] = {
            service_id: appointment.service_id,
            service_name: appointment.service_name,
            selling_price: 0, // default or catalog price
          };
          localStorage.setItem('barber_queue_services', JSON.stringify(queueServices));
        } catch {
          // ignore
        }
      }

      // Update appointment status to ARRIVED
      const { error: aptErr } = await supabase
        .from('appointments')
        .update({ status: 'ARRIVED' })
        .eq('id', appointment.id);

      if (aptErr) throw aptErr;

      await Promise.all([loadQueues(), loadAppointments()]);
      setFeedback({
        type: 'success',
        message: `Janji temu #${appointment.appointment_number} (${appointment.customer_name}) berhasil check-in sebagai Antrean Kursi #${nextNum}!`,
      });
      setActiveTab('BOARD');
    } catch (err: unknown) {
      console.error('Check-in error:', err);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal melakukan check-in janji temu.',
      });
    }
  };

  // Update Appointment Status directly
  const handleUpdateAppointmentStatus = async (
    appointmentId: string,
    newStatus: AppointmentView['status']
  ) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', appointmentId);

      if (error) throw error;
      await loadAppointments();
      setFeedback({
        type: 'success',
        message: `Status janji temu berhasil diubah menjadi ${newStatus}.`,
      });
    } catch (err: unknown) {
      console.error('Update appointment status error:', err);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal memperbarui status janji temu.',
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 px-4 py-3 sticky top-0 z-30 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Outlet */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Kembali ke Kasir POS"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center font-bold text-slate-950 text-base shadow-sm">
                💈
              </span>
              <div>
                <h1 className="text-base font-bold tracking-tight text-white leading-tight flex items-center gap-2">
                  <span>Antrean & Janji Temu</span>
                  <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    Real-time
                  </span>
                </h1>
                <p className="text-[11px] text-amber-400 font-medium">
                  Sistem Antrean Kursi Pangkas & Kalender Reservasi
                </p>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-700 mx-1 hidden md:block" />

            {/* Outlet Selector / Locked Badge for Cashier */}
            {isCashier ? (
              <div
                className="flex items-center gap-1.5 bg-slate-800/90 border border-amber-500/40 px-2.5 py-1.5 rounded-lg text-xs"
                title="Cabang terkunci khusus penugasan akun kasir ini"
              >
                <Store className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold text-white truncate max-w-[140px]">
                  {currentOutlet?.name || 'Cabang Kasir'}
                </span>
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300 font-bold ml-1">
                  Terkunci
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs">
                <Store className="w-3.5 h-3.5 text-amber-400" />
                <select
                  value={currentOutlet?.id || ''}
                  onChange={(e) => {
                    const target = availableOutlets.find((o) => o.id === e.target.value);
                    if (target) setCurrentOutlet(target);
                  }}
                  className="bg-transparent text-slate-100 font-medium focus:outline-none cursor-pointer pr-1"
                >
                  {availableOutlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id} className="bg-slate-900 text-white">
                      {outlet.name} ({outlet.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Quick Actions & Navigation Links */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsWalkinModalOpen(true)}
              className="px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              <span>+ Antrean Walk-in</span>
            </button>

            <button
              onClick={() => {
                setBookingPrefilledBarber(undefined);
                setIsAppointmentModalOpen(true);
              }}
              className="px-3 py-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>+ Reservasi</span>
            </button>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
              title="Muat ulang data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            <div className="h-5 w-px bg-slate-700 mx-0.5 hidden sm:block" />

            <Link
              href="/history"
              className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
              title="Riwayat Nota Penjualan"
            >
              <History className="w-3.5 h-3.5 text-amber-400" />
              <span>Riwayat</span>
            </Link>

            <Link
              href="/inventory"
              className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
              title="Manajemen Inventori"
            >
              <Package className="w-3.5 h-3.5 text-amber-400" />
              <span>Inventori</span>
            </Link>

            <Link
              href="/commissions"
              className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
              title="Komisi Kapster & Rekapitulasi"
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>Komisi</span>
            </Link>

            <Link
              href="/customers"
              className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
              title="CRM, Member & Program Loyalitas"
            >
              <Users className="w-3.5 h-3.5 text-sky-400" />
              <span>Pelanggan</span>
            </Link>

            {/* OWNER ONLY */}
            {!isCashier && (
              <>
                <Link
                  href="/accounting"
                  className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
                  title="Laporan Keuangan & Akuntansi"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Keuangan</span>
                </Link>

                <Link
                  href="/analytics"
                  className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
                  title="Analitik Bisnis & Dashboard Owner"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                  <span>Analitik</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* Feedback Alert Banner */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-in fade-in duration-200 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-700 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* View Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveTab('BOARD')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'BOARD'
                ? 'bg-slate-900 text-amber-400 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Scissors className="w-4 h-4" />
            <span>Papan Kursi & Antrean Langsung</span>
            <span className="text-[10px] bg-slate-800 text-slate-200 px-1.5 py-0.2 rounded-full">
              {queues.filter((q) => q.status === 'WAITING' || q.status === 'IN_SERVICE').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('APPOINTMENTS')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'APPOINTMENTS'
                ? 'bg-slate-900 text-amber-400 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Jadwal Janji Temu</span>
            <span className="text-[10px] bg-slate-800 text-slate-200 px-1.5 py-0.2 rounded-full">
              {appointments.filter((a) => a.status === 'CONFIRMED' || a.status === 'PENDING').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'HISTORY'
                ? 'bg-slate-900 text-amber-400 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Riwayat Antrean Hari Ini</span>
            <span className="text-[10px] bg-slate-800 text-slate-200 px-1.5 py-0.2 rounded-full">
              {queues.length}
            </span>
          </button>
        </div>

        {/* Loading Spinner or Tab Content */}
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2.5">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
            <span className="text-xs font-semibold text-slate-600">Memuat data antrean & janji temu...</span>
          </div>
        ) : (
          <>
            {/* Tab 1: Live Chair Board */}
            {activeTab === 'BOARD' && (
              <QueueBoard
                queues={queues}
                onUpdateStatus={handleUpdateQueueStatus}
                onOpenWalkinModal={() => setIsWalkinModalOpen(true)}
                availableServices={availableServices}
              />
            )}

        {/* Tab 2: Appointment Calendar */}
        {activeTab === 'APPOINTMENTS' && (
          <AppointmentCalendar
            appointments={appointments}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onOpenBookingModal={(barberId) => {
              setBookingPrefilledBarber(barberId);
              setIsAppointmentModalOpen(true);
            }}
            onCheckInToQueue={handleCheckInToQueue}
            onUpdateAppointmentStatus={handleUpdateAppointmentStatus}
          />
        )}

        {/* Tab 3: Today Queue History Table */}
        {activeTab === 'HISTORY' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900">
                  Log Riwayat Antrean Hari Ini ({queues.length} Tamu)
                </h3>
              </div>
            </div>

            {queues.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada rekaman antrean hari ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">No. Antrean</th>
                      <th className="py-2.5 px-3">Pelanggan</th>
                      <th className="py-2.5 px-3">Kapster</th>
                      <th className="py-2.5 px-3">Waktu Masuk</th>
                      <th className="py-2.5 px-3">Mulai Cukur</th>
                      <th className="py-2.5 px-3">Selesai</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {queues.map((q) => (
                      <tr key={q.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          #{q.queue_number}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">
                          {q.customer_name || 'Tamu Walk-in'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {q.barber_name || 'Siapa Saja / Bebas'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {new Date(q.joined_at).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {q.started_at
                            ? new Date(q.started_at).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {q.completed_at
                            ? new Date(q.completed_at).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              q.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : q.status === 'IN_SERVICE'
                                ? 'bg-blue-100 text-blue-800'
                                : q.status === 'CALLED'
                                ? 'bg-amber-100 text-amber-800'
                                : q.status === 'CANCELLED' || q.status === 'NO_SHOW'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {q.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </>
    )}
  </main>

      {/* Modals */}
      <WalkinModal
        isOpen={isWalkinModalOpen}
        onClose={() => setIsWalkinModalOpen(false)}
        onSuccess={(msg) => {
          setFeedback({ type: 'success', message: msg });
          loadQueues();
        }}
        availableServices={availableServices}
      />

      <AppointmentModal
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        onSuccess={(msg) => {
          setFeedback({ type: 'success', message: msg });
          loadAppointments();
        }}
        availableServices={availableServices}
        prefilledDate={selectedDate}
        prefilledBarberId={bookingPrefilledBarber}
      />
    </div>
  );
}

export default function QueuePage(): React.JSX.Element {
  return (
    <PosProvider>
      <QueueManagementContent />
    </PosProvider>
  );
}
