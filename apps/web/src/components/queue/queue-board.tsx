'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePos } from '../../context/pos-context';
import type { QueueItemView, BarberEmployee, CatalogItem } from '../../types/pos';
import {
  Scissors,
  Users,
  Clock,
  CheckCircle2,
  PhoneCall,
  Play,
  Check,
  CreditCard,
  XCircle,
  ArrowRight,
  Flame,
} from 'lucide-react';

interface QueueBoardProps {
  queues: QueueItemView[];
  onUpdateStatus: (queueId: string, newStatus: QueueItemView['status'], barberId?: string) => Promise<void>;
  onOpenWalkinModal: () => void;
  availableServices: CatalogItem[];
}

export function QueueBoard({
  queues,
  onUpdateStatus,
  onOpenWalkinModal,
  availableServices,
}: QueueBoardProps): React.JSX.Element {
  const router = useRouter();
  const { barbers } = usePos();

  // Local state for time ticker to update elapsed duration live
  const [, setTick] = useState<number>(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000); // every 30s
    return () => clearInterval(timer);
  }, []);

  // Filter queues by status
  const waitingQueues = queues.filter((q) => q.status === 'WAITING');
  const calledQueues = queues.filter((q) => q.status === 'CALLED');
  const inServiceQueues = queues.filter((q) => q.status === 'IN_SERVICE');
  const completedQueues = queues.filter((q) => q.status === 'COMPLETED');

  // Compute elapsed time helper
  const getElapsedMinutes = (startTimeStr: string | null): number => {
    if (!startTimeStr) return 0;
    const start = new Date(startTimeStr).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((now - start) / 60000));
  };

  // Hand-off to POS Cashier Screen
  const handleProceedToCashier = (queue: QueueItemView) => {
    try {
      // Find service prefill if stored
      const queueServices = JSON.parse(localStorage.getItem('barber_queue_services') || '{}');
      const savedService = queueServices[queue.id];

      const checkoutPayload = {
        queue_id: queue.id,
        queue_number: queue.queue_number,
        customer_id: queue.customer_id,
        customer_name: queue.customer_name,
        barber_id: queue.barber_id,
        barber_name: queue.barber_name,
        service_id: savedService?.service_id || queue.service_id || (availableServices[0]?.id || null),
        service_name: savedService?.service_name || queue.service_name || (availableServices[0]?.name || 'Layanan Pangkas'),
        service_price: savedService?.selling_price || queue.service_price || (availableServices[0]?.selling_price || 0),
        completed_at: queue.completed_at || new Date().toISOString(),
      };

      sessionStorage.setItem('pending_queue_checkout', JSON.stringify(checkoutPayload));
      router.push('/');
    } catch (err) {
      console.error('Hand-off error:', err);
      router.push('/');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-amber-100 text-amber-800">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 leading-tight">
              {waitingQueues.length}
            </div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Menunggu Giliran
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-blue-100 text-blue-800">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 leading-tight">
              {inServiceQueues.length}
            </div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Kursi Aktif Pangkas
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 leading-tight">
              {completedQueues.length}
            </div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Selesai Hari Ini
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-purple-100 text-purple-800">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 leading-tight">
              {queues.length}
            </div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Antrean Masuk
            </div>
          </div>
        </div>
      </div>

      {/* 2. Barber Workstations (Kursi Pangkas Kapster) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Stasiun Kursi Pangkas ({barbers.length} Kursi Tersedia)
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Status real-time setiap kapster & workstation
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {barbers.map((barber: BarberEmployee, index: number) => {
            // Find if this barber has an in-service customer or called customer
            const activeService = inServiceQueues.find((q) => q.barber_id === barber.id);
            const calledService = calledQueues.find((q) => q.barber_id === barber.id);
            const activeQueue = activeService || calledService;

            const isServing = Boolean(activeService);
            const isCalled = Boolean(calledService);
            const isFree = !activeQueue;

            const elapsedMins = isServing ? getElapsedMinutes(activeService?.started_at || null) : 0;

            return (
              <div
                key={barber.id}
                className={`rounded-2xl border p-4 transition-all shadow-xs flex flex-col justify-between ${
                  isServing
                    ? 'bg-gradient-to-b from-blue-50/70 to-white border-blue-200 ring-1 ring-blue-300'
                    : isCalled
                    ? 'bg-gradient-to-b from-amber-50/70 to-white border-amber-200 ring-1 ring-amber-300'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Station Top Bar */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-400">
                        KURSI #{index + 1}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900">{barber.full_name}</h3>
                    </div>
                    {isServing && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white flex items-center gap-1 shadow-2xs">
                        <Scissors className="w-3 h-3 animate-spin" />
                        <span>Sedang Mencukur</span>
                      </span>
                    )}
                    {isCalled && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 flex items-center gap-1 shadow-2xs animate-pulse">
                        <PhoneCall className="w-3 h-3" />
                        <span>Memanggil</span>
                      </span>
                    )}
                    {isFree && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        ● Kursi Kosong
                      </span>
                    )}
                  </div>

                  {/* Customer in Chair Details */}
                  {activeQueue ? (
                    <div className="bg-white/90 rounded-xl p-3 border border-slate-200/80 mb-3 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black px-1.5 py-0.5 bg-slate-900 text-amber-400 rounded-md">
                            #{activeQueue.queue_number}
                          </span>
                          <span className="text-xs font-bold text-slate-900 truncate max-w-[140px]">
                            {activeQueue.customer_name || 'Tamu Walk-in'}
                          </span>
                        </div>
                        {isServing && (
                          <div className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                            <Clock className="w-3 h-3" />
                            <span>{elapsedMins} mnt</span>
                          </div>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 flex items-center justify-between">
                        <span>{activeQueue.service_name || 'Layanan Reguler'}</span>
                        <span className="text-[10px]">
                          Masuk:{' '}
                          {new Date(activeQueue.joined_at).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-16 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center text-center text-slate-400 mb-3">
                      <Scissors className="w-4 h-4 text-slate-300 mb-0.5" />
                      <span className="text-xs font-medium">Siap melayani antrean berikutnya</span>
                    </div>
                  )}
                </div>

                {/* Chair Actions */}
                <div className="pt-2 border-t border-slate-100">
                  {isServing && (
                    <button
                      onClick={() => onUpdateStatus(activeService!.id, 'COMPLETED')}
                      className="w-full py-2 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Selesai Pangkas</span>
                    </button>
                  )}

                  {isCalled && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => onUpdateStatus(calledService!.id, 'IN_SERVICE')}
                        className="py-1.5 px-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Mulai</span>
                      </button>
                      <button
                        onClick={() => onUpdateStatus(calledService!.id, 'NO_SHOW')}
                        className="py-1.5 px-2 text-xs font-medium text-slate-600 hover:text-red-700 bg-slate-100 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Tidak Hadir</span>
                      </button>
                    </div>
                  )}

                  {isFree && (
                    <button
                      disabled={waitingQueues.length === 0}
                      onClick={() => {
                        // Find first waiting queue that is either for this barber or anyone
                        const eligible = waitingQueues.find(
                          (q) => !q.barber_id || q.barber_id === barber.id
                        );
                        if (eligible) {
                          onUpdateStatus(eligible.id, 'CALLED', barber.id);
                        }
                      }}
                      className={`w-full py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                        waitingQueues.length > 0
                          ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs cursor-pointer'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <PhoneCall className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {waitingQueues.length > 0 ? 'Panggil Antrean Berikut' : 'Tidak Ada Antrean'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Bottom Two Columns: Waiting Lounge vs Completed / Ready for Cashier */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Waiting Lounge Column */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col h-full">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
                <Users className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Ruang Tunggu Antrean ({waitingQueues.length})
              </h3>
            </div>
            <button
              onClick={onOpenWalkinModal}
              className="text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-lg transition-colors shadow-2xs flex items-center gap-1"
            >
              <span>+ Tambah Walk-in</span>
            </button>
          </div>

          {waitingQueues.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <Users className="w-10 h-10 text-slate-300 mb-2 stroke-1" />
              <p className="text-sm font-semibold text-slate-700">Ruang Tunggu Kosong</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Semua pelanggan telah dilayani atau belum ada antrean baru.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {waitingQueues.map((q) => {
                const assignedBarber = barbers.find((b: BarberEmployee) => b.id === q.barber_id);
                return (
                  <div
                    key={q.id}
                    className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-white transition-all flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-black text-sm shadow-2xs">
                        #{q.queue_number}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{q.customer_name || 'Tamu Walk-in'}</span>
                          {q.appointment_id && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 font-semibold px-1.5 py-0.2 rounded">
                              Booking
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Scissors className="w-3 h-3 text-slate-400" />
                            {assignedBarber ? assignedBarber.full_name : 'Siapa Saja / Bebas'}
                          </span>
                          <span>•</span>
                          <span>
                            {new Date(q.joined_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onUpdateStatus(q.id, 'CALLED', q.barber_id ?? undefined)}
                        className="px-2.5 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                        title="Panggil pelanggan"
                      >
                        <PhoneCall className="w-3 h-3" />
                        <span className="hidden sm:inline">Panggil</span>
                      </button>
                      <button
                        onClick={() => onUpdateStatus(q.id, 'CANCELLED')}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Batalkan antrean"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Completed & Ready for Cashier Column */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col h-full">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Selesai Pangkas & Siap Bayar ({completedQueues.length})
              </h3>
            </div>
            <span className="text-xs text-slate-500">Hand-off ke kasir POS</span>
          </div>

          {completedQueues.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <CheckCircle2 className="w-10 h-10 text-slate-300 mb-2 stroke-1" />
              <p className="text-sm font-semibold text-slate-700">Belum Ada Selesai Pangkas</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Layanan pangkas yang selesai akan muncul di sini untuk pembayaran.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {completedQueues.map((q) => {
                const assignedBarber = barbers.find((b: BarberEmployee) => b.id === q.barber_id);
                return (
                  <div
                    key={q.id}
                    className="p-3 rounded-xl border border-emerald-200/80 bg-emerald-50/30 hover:bg-emerald-50/60 transition-all flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-black text-sm shadow-2xs">
                        #{q.queue_number}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {q.customer_name || 'Tamu Walk-in'}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>Kapster: {assignedBarber ? assignedBarber.full_name : 'Staff'}</span>
                          <span>•</span>
                          <span>
                            Selesai:{' '}
                            {q.completed_at
                              ? new Date(q.completed_at).toLocaleTimeString('id-ID', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleProceedToCashier(q)}
                      className="px-3.5 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Bayar di Kasir</span>
                      <ArrowRight className="w-3 h-3 text-white" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
