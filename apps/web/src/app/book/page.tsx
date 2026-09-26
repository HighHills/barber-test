'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Store,
  Scissors,
  UserCheck,
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  FileText,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Share2,
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  Loader2,
  MapPin,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  parseOperatingHours,
  calculateBookingTiming,
  formatBookingError,
  findLatestAllowableSlot,
  isSlotPastTime,
  minutesToTime,
  type BookingErrorInfo,
} from '../../lib/booking-error-helper';
import type {
  PublicOutlet,
  PublicService,
  PublicBarber,
  BookingTimeSlot,
  BookingConfirmation,
} from '../../types/booking';
import {
  fetchPublicOutlets,
  fetchPublicServices,
  fetchPublicBarbers,
  fetchPublicAvailableSlots,
  submitPublicBooking,
  buildWhatsAppTicketUrl,
} from '../../lib/booking-service';

export default function PublicBookingPage(): React.JSX.Element {
  // Step State: 1 = Outlet, 2 = Service, 3 = Barber, 4 = Schedule, 5 = Customer Info, 6 = Success Ticket
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Loaded Options
  const [outlets, setOutlets] = useState<PublicOutlet[]>([]);
  const [services, setServices] = useState<PublicService[]>([]);
  const [barbers, setBarbers] = useState<PublicBarber[]>([]);
  const [slots, setSlots] = useState<BookingTimeSlot[]>([]);

  // Selection States
  const [selectedOutlet, setSelectedOutlet] = useState<PublicOutlet | null>(null);
  const [selectedService, setSelectedService] = useState<PublicService | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<PublicBarber | null>(null); // null = Any Barber
  const [isAnyBarber, setIsAnyBarber] = useState<boolean>(true);

  // Date & Time
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);

  // Customer Form Data
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [bookingNotes, setBookingNotes] = useState<string>('');

  // UI Status
  const [isLoadingOutlets, setIsLoadingOutlets] = useState<boolean>(true);
  const [isLoadingServices, setIsLoadingServices] = useState<boolean>(false);
  const [isLoadingBarbers, setIsLoadingBarbers] = useState<boolean>(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<BookingErrorInfo | null>(null);

  const clearErrors = () => {
    setErrorMessage(null);
    setBookingError(null);
  };
  const [copiedTicket, setCopiedTicket] = useState<boolean>(false);

  // Confirmed Ticket
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  // 1. Initial Load Outlets
  useEffect(() => {
    let isMounted = true;
    async function loadOutlets() {
      setIsLoadingOutlets(true);
      setErrorMessage(null);
      try {
        const data = await fetchPublicOutlets();
        if (isMounted) {
          setOutlets(data);
          if (data.length > 0) {
            setSelectedOutlet(data[0]);
          }
        }
      } catch (err: any) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error loading outlets:', err?.message || err);
        }
        if (isMounted) {
          setErrorMessage(err?.message || 'Gagal memuat daftar cabang.');
        }
      } finally {
        if (isMounted) setIsLoadingOutlets(false);
      }
    }
    loadOutlets();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. When Outlet changes, fetch Services and Barbers
  useEffect(() => {
    if (!selectedOutlet) return;
    const outletId = selectedOutlet.id;
    let isMounted = true;

    async function loadOutletData() {
      setIsLoadingServices(true);
      setIsLoadingBarbers(true);
      try {
        const [srvData, brbData] = await Promise.all([
          fetchPublicServices(outletId),
          fetchPublicBarbers(outletId),
        ]);
        if (isMounted) {
          setServices(srvData);
          setBarbers(brbData);
          if (srvData.length > 0 && !selectedService) {
            setSelectedService(srvData[0]);
          }
        }
      } catch (err: any) {
        if (process.env.NODE_ENV === 'development') {
          console.error(
            'Error loading outlet services/barbers:',
            err?.message || err
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingServices(false);
          setIsLoadingBarbers(false);
        }
      }
    }

    loadOutletData();
    return () => {
      isMounted = false;
    };
  }, [selectedOutlet]);

  // 3. When Date, Outlet, Barber, or Service changes, calculate available slots
  const loadSlots = useCallback(async () => {
    if (!selectedOutlet) return;
    setIsLoadingSlots(true);
    try {
      const barberId = isAnyBarber ? null : selectedBarber?.id || null;
      const serviceId = selectedService?.id || null;
      const slotData = await fetchPublicAvailableSlots(
        selectedOutlet.id,
        selectedDate,
        barberId,
        serviceId
      );
      setSlots(slotData);
      // Reset selected slot if no longer available
      if (selectedTimeSlot) {
        const found = slotData.find((s) => s.time_slot === selectedTimeSlot);
        if (!found || !found.is_available) {
          setSelectedTimeSlot(null);
        }
      }
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error(
          'Error fetching available slots:',
          err?.message || err
        );
      }
    } finally {
      setIsLoadingSlots(false);
    }
  }, [selectedOutlet, selectedDate, isAnyBarber, selectedBarber, selectedService, selectedTimeSlot]);

  useEffect(() => {
    if (selectedOutlet && currentStep >= 4) {
      loadSlots();
    }
  }, [selectedOutlet, selectedDate, isAnyBarber, selectedBarber, selectedService, currentStep, loadSlots]);

  // Handle Submit Booking
  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOutlet) {
      setErrorMessage('Silakan pilih cabang terlebih dahulu.');
      return;
    }
    if (!selectedService) {
      setErrorMessage('Silakan pilih layanan pangkas.');
      return;
    }
    if (!selectedTimeSlot) {
      setErrorMessage('Silakan pilih jam slot kedatangan Anda.');
      return;
    }
    const trimmedCustomerName = customerName.trim();
    if (!trimmedCustomerName) {
      setErrorMessage('Nama lengkap wajib diisi.');
      return;
    }
    if (trimmedCustomerName.length < 2 || trimmedCustomerName.length > 40) {
      setErrorMessage('Nama pelanggan harus 2-40 karakter');
      return;
    }
    if (!customerPhone.trim() || customerPhone.replace(/[^0-9]/g, '').length < 8) {
      setErrorMessage('Nomor WhatsApp aktif minimal 8 digit wajib diisi.');
      return;
    }

    clearErrors();

    // Pre-validate timing against outlet operating hours & service duration
    const timingCheck = calculateBookingTiming(
      selectedTimeSlot,
      selectedService.duration_minutes,
      selectedOutlet.operating_hours,
      slots
    );

    if (timingCheck.isDurationOverrun || timingCheck.isOutsideHours) {
      const formatted = formatBookingError(
        timingCheck.isDurationOverrun
          ? 'Durasi layanan melewati jam operasional barbershop'
          : 'Waktu booking berada di luar jam operasional barbershop',
        {
          service: selectedService,
          outlet: selectedOutlet,
          barber: selectedBarber,
          isAnyBarber,
          selectedSlot: selectedTimeSlot,
          availableSlots: slots,
        }
      );
      setBookingError(formatted);
      setErrorMessage(formatted.message);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        outlet_id: selectedOutlet.id,
        service_id: selectedService.id,
        booking_date: selectedDate,
        booking_time: `${selectedTimeSlot}:00`,
        customer_name: trimmedCustomerName,
        customer_phone: customerPhone.trim().slice(0, 20),
        barber_id: isAnyBarber ? null : selectedBarber?.id || null,
        customer_email: customerEmail.trim().slice(0, 100) || null,
        notes: bookingNotes.trim().slice(0, 1000) || null,
      };

      const result = await submitPublicBooking(payload);
      setConfirmation(result);
      clearErrors();
      setCurrentStep(6); // Go to success ticket
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Booking submission error:', err?.message || err);
      }
      const formatted = formatBookingError(err, {
        service: selectedService,
        outlet: selectedOutlet,
        barber: selectedBarber,
        isAnyBarber,
        selectedSlot: selectedTimeSlot,
        availableSlots: slots,
      });
      setBookingError(formatted);
      setErrorMessage(formatted.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper date buttons
  const setQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setSelectedDate(d.toISOString().split('T')[0]);
    setSelectedTimeSlot(null);
  };

  const formatDateDisplay = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Copy Ticket text
  const handleCopyTicket = () => {
    if (!confirmation) return;
    navigator.clipboard.writeText(confirmation.whatsapp_message);
    setCopiedTicket(true);
    setTimeout(() => setCopiedTicket(false), 2500);
  };

  // Reset booking form
  const handleResetBooking = () => {
    clearErrors();
    setConfirmation(null);
    setSelectedTimeSlot(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setBookingNotes('');
    setCurrentStep(1);
  };

  const stepsList = [
    { num: 1, label: 'Cabang' },
    { num: 2, label: 'Layanan' },
    { num: 3, label: 'Barber' },
    { num: 4, label: 'Jadwal' },
    { num: 5, label: 'Data Diri' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950 font-sans antialiased">
      {/* 1. Header */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 via-amber-500 to-amber-300 p-0.5 shadow-lg shadow-amber-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-xl">
                💈
              </div>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                BARBERSHOP <span className="text-amber-400">RESERVATION</span>
              </h1>
              <p className="text-xs text-slate-400">
                Reservasi Mandiri Instan • Bebas Antre • Tiket WhatsApp
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Content Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center">
        {/* Step Progress Bar (Hidden on Success Step 6) */}
        {currentStep < 6 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              {stepsList.map((step) => {
                const isPassed = currentStep > step.num;
                const isCurrent = currentStep === step.num;
                return (
                  <button
                    key={step.num}
                    type="button"
                    onClick={() => {
                      if (step.num < currentStep) {
                        clearErrors();
                        setCurrentStep(step.num);
                      }
                    }}
                    disabled={step.num > currentStep}
                    className={`flex items-center gap-1.5 text-xs font-bold transition-all ${
                      isCurrent
                        ? 'text-amber-400 scale-105'
                        : isPassed
                        ? 'text-emerald-400 cursor-pointer hover:underline'
                        : 'text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black border transition-colors ${
                        isCurrent
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/30'
                          : isPassed
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-slate-900 text-slate-600 border-slate-800'
                      }`}
                    >
                      {isPassed ? <Check className="w-3.5 h-3.5" /> : step.num}
                    </span>
                    <span className="hidden md:inline">{step.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Linear Progress Bar */}
            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-amber-500 to-amber-300 h-full transition-all duration-300"
                style={{ width: `${((currentStep - 1) / (stepsList.length - 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Global Rich Error Banner */}
        <BookingErrorAlert
          error={bookingError}
          simpleMessage={errorMessage}
          onClear={clearErrors}
          onAction={(actionType) => {
            if (actionType === 'choose_any_barber') {
              setIsAnyBarber(true);
              setSelectedBarber(null);
              clearErrors();
              setCurrentStep(4);
              loadSlots();
            } else {
              clearErrors();
              setCurrentStep(4);
              loadSlots();
            }
          }}
        />

        {/* STEP 1: PILIH CABANG */}
        {currentStep === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-amber-400" />
                Pilih Cabang Barbershop
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Tentukan lokasi cabang terdekat untuk layanan terbaik Anda.
              </p>
            </div>

            {isLoadingOutlets ? (
              <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                <p className="text-sm">Memuat daftar cabang...</p>
              </div>
            ) : outlets.length === 0 ? (
              <div className="py-16 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                <Store className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                <p className="text-sm font-medium">Belum ada cabang barbershop yang aktif.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {outlets.map((outlet) => {
                  const isSelected = selectedOutlet?.id === outlet.id;
                  return (
                    <div
                      key={outlet.id}
                      onClick={() => setSelectedOutlet(outlet)}
                      className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-3 right-3 bg-amber-500 text-slate-950 p-1 rounded-full shadow-sm">
                          <Check className="w-3.5 h-3.5 font-black" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-white">{outlet.name}</h3>
                          <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md">
                            {outlet.code}
                          </span>
                        </div>
                        {outlet.address && (
                          <p className="text-xs text-slate-400 mt-2 flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-400/80 shrink-0 mt-0.5" />
                            <span>{outlet.address}</span>
                          </p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          {outlet.operating_hours || '09:00 - 21:00 WIB'}
                        </span>
                        {outlet.phone && (
                          <span className="flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-slate-500" />
                            {outlet.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  clearErrors();
                  setCurrentStep(2);
                }}
                disabled={!selectedOutlet}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-6 py-3 rounded-xl flex items-center gap-2 text-sm shadow-md shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <span>Lanjut: Pilih Layanan</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PILIH LAYANAN */}
        {currentStep === 2 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <Scissors className="w-5 h-5 text-amber-400" />
                  Pilih Layanan & Treatment
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Cabang: <span className="text-amber-300 font-semibold">{selectedOutlet?.name}</span>
                </p>
              </div>
            </div>

            {isLoadingServices ? (
              <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                <p className="text-sm">Memuat daftar menu layanan...</p>
              </div>
            ) : services.length === 0 ? (
              <div className="py-16 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                <Scissors className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                <p className="text-sm font-medium">Belum ada layanan tersedia di cabang ini.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {services.map((service) => {
                  const isSelected = selectedService?.id === service.id;
                  return (
                    <div
                      key={service.id}
                      onClick={() => setSelectedService(service)}
                      className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all duration-200 relative flex flex-col justify-between ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-3 right-3 bg-amber-500 text-slate-950 p-1 rounded-full shadow-sm">
                          <Check className="w-3.5 h-3.5 font-black" />
                        </div>
                      )}
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                          {service.category_name}
                        </span>
                        <h3 className="font-bold text-base text-white mt-2">{service.name}</h3>
                        {service.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                            {service.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                        <span className="text-xs text-slate-400 flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-lg">
                          <Clock className="w-3 h-3 text-amber-400" />
                          {service.duration_minutes} Menit
                        </span>
                        <span className="text-base font-black text-amber-400">
                          Rp {service.selling_price.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  clearErrors();
                  setCurrentStep(1);
                }}
                className="text-slate-400 hover:text-white font-medium px-4 py-2.5 rounded-xl flex items-center gap-1.5 text-sm transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  clearErrors();
                  setCurrentStep(3);
                }}
                disabled={!selectedService}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-6 py-3 rounded-xl flex items-center gap-2 text-sm shadow-md shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <span>Lanjut: Pilih Barber</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PILIH BARBER */}
        {currentStep === 3 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-400" />
                Pilih Barber / Stylist Favorit
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Pilih kapster pilihan Anda atau pilih opsi fleksibel untuk rekomendasi waktu tercepat.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {/* Option 1: Bebas / Siapa Saja */}
              <div
                onClick={() => {
                  setIsAnyBarber(true);
                  setSelectedBarber(null);
                }}
                className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all duration-200 relative flex flex-col justify-between ${
                  isAnyBarber
                    ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                {isAnyBarber && (
                  <div className="absolute top-3 right-3 bg-amber-500 text-slate-950 p-1 rounded-full shadow-sm">
                    <Check className="w-3.5 h-3.5 font-black" />
                  </div>
                )}
                <div>
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500/20 to-amber-400/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xl font-bold mb-3">
                    ✨
                  </div>
                  <h3 className="font-bold text-base text-white">Siapa Saja / Bebas</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Slot jam lebih banyak & fleksibel. Sistem akan mencarikan barber terbaik yang siap melayani.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] font-bold text-amber-400">
                  ⚡ Paling Cepat & Fleksibel
                </div>
              </div>

              {/* Individual Barbers */}
              {isLoadingBarbers ? (
                <div className="col-span-full py-12 text-center text-slate-500 flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                  <span className="text-xs">Memuat daftar barber...</span>
                </div>
              ) : (
                barbers.map((barber) => {
                  const isSelected = !isAnyBarber && selectedBarber?.id === barber.id;
                  return (
                    <div
                      key={barber.id}
                      onClick={() => {
                        setIsAnyBarber(false);
                        setSelectedBarber(barber);
                      }}
                      className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all duration-200 relative flex flex-col justify-between ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-3 right-3 bg-amber-500 text-slate-950 p-1 rounded-full shadow-sm">
                          <Check className="w-3.5 h-3.5 font-black" />
                        </div>
                      )}
                      <div>
                        <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-white font-bold text-base mb-3 shadow-sm">
                          {barber.full_name.charAt(0)}
                        </div>
                        <h3 className="font-bold text-base text-white">{barber.full_name}</h3>
                        <p className="text-xs text-slate-400 mt-1">{barber.position}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  clearErrors();
                  setCurrentStep(2);
                }}
                className="text-slate-400 hover:text-white font-medium px-4 py-2.5 rounded-xl flex items-center gap-1.5 text-sm transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>
              <button
                type="button"
                onClick={() => {
                      clearErrors();
                      setCurrentStep(4);
                    }}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-6 py-3 rounded-xl flex items-center gap-2 text-sm shadow-md shadow-amber-500/20 transition-all"
              >
                <span>Lanjut: Pilih Jadwal & Jam</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: PILIH TANGGAL & JAM SLOT */}
        {currentStep === 4 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-400" />
                  Pilih Tanggal & Jam Kedatangan
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Pilih slot waktu yang bebas bentrok untuk kenyamanan Anda.
                </p>
              </div>

              <button
                type="button"
                onClick={() => loadSlots()}
                disabled={isLoadingSlots}
                className="text-xs text-slate-400 hover:text-amber-400 flex items-center gap-1 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSlots ? 'animate-spin' : ''}`} />
                <span>Cek Ulang Slot</span>
              </button>
            </div>

            {/* Date Quick Selector */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setQuickDate(0)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                  selectedDate === todayStr
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => setQuickDate(1)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                  selectedDate ===
                  new Date(Date.now() + 86400000).toISOString().split('T')[0]
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                Besok
              </button>
              <button
                type="button"
                onClick={() => setQuickDate(2)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                  selectedDate ===
                  new Date(Date.now() + 172800000).toISOString().split('T')[0]
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                Lusa
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-slate-400 hidden sm:inline">Pilih Tanggal:</span>
                <input
                  type="date"
                  min={todayStr}
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedTimeSlot(null);
                  }}
                  className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Selected Date & Barber Header */}
            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-400">
                Jadwal:{' '}
                <strong className="text-white">{formatDateDisplay(selectedDate)}</strong>
              </span>
              <span className="text-amber-400/90 font-medium">
                Barber:{' '}
                <strong>{isAnyBarber ? 'Siapa Saja (Tersedia)' : selectedBarber?.full_name}</strong>
              </span>
            </div>

            {/* Service & Operational Hours Guidance Header */}
            {selectedService && selectedOutlet && (() => {
              const opHours = parseOperatingHours(selectedOutlet.operating_hours);
              const recSlot = findLatestAllowableSlot(slots, opHours.closeMinutes, selectedService.duration_minutes, selectedDate);
              const latestTime = minutesToTime(opHours.closeMinutes - selectedService.duration_minutes);

              return (
                <div className="bg-slate-900/80 p-3 sm:p-3.5 rounded-2xl border border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <Scissors className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-white text-sm">{selectedService.name}</strong>
                        <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.2 rounded-md">
                          {selectedService.duration_minutes} Menit
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Operasional: {opHours.openTime} – {opHours.closeTime} WIB ({selectedOutlet.name})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Batas kedatangan:</span>
                    <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-xl font-mono font-bold text-xs flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Maks. {recSlot || latestTime} WIB
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Slot Grid */}
            {isLoadingSlots ? (
              <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                <p className="text-sm">Menghitung ketersediaan slot jam...</p>
              </div>
            ) : slots.length === 0 ? (
              <div className="py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                <Clock className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p className="text-sm font-medium">Tidak ada slot jam yang tersedia pada tanggal ini.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                  {slots.map((slot) => {
                    const isSelected = selectedTimeSlot === slot.time_slot;
                    const isPastTime = isSlotPastTime(slot, selectedDate);
                    const slotTiming = calculateBookingTiming(
                      slot.time_slot,
                      selectedService?.duration_minutes || 45,
                      selectedOutlet?.operating_hours,
                      slots
                    );
                    const isOverrun = slot.is_available && !isPastTime && slotTiming.isDurationOverrun;
                    const isFullyBooked = !slot.is_available && !isPastTime;
                    const statusLabel = isPastTime
                      ? 'Sudah Lewat'
                      : isFullyBooked
                      ? 'Penuh'
                      : isOverrun
                      ? 'Lewat Jam Tutup'
                      : 'Tersedia';

                    const isDisabled = isPastTime || isFullyBooked;

                    return (
                      <button
                        key={slot.time_slot}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          setSelectedTimeSlot(slot.time_slot);
                          if (isOverrun) {
                            const err = formatBookingError(
                              'Durasi layanan melewati jam operasional barbershop',
                              {
                                service: selectedService,
                                outlet: selectedOutlet,
                                barber: selectedBarber,
                                isAnyBarber,
                                selectedSlot: slot.time_slot,
                                selectedDate,
                                availableSlots: slots,
                              }
                            );
                            setBookingError(err);
                          } else {
                            clearErrors();
                          }
                        }}
                        className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 relative overflow-hidden ${
                          isSelected
                            ? isOverrun
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500 font-black shadow-lg shadow-amber-500/10 scale-105'
                              : 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-lg shadow-amber-500/20 scale-105'
                            : isPastTime
                            ? 'bg-slate-950/60 text-slate-600 border-slate-900 cursor-not-allowed opacity-50'
                            : isFullyBooked
                            ? 'bg-slate-950/40 text-rose-400/80 border-rose-950/50 cursor-not-allowed opacity-60'
                            : isOverrun
                            ? 'bg-slate-900/90 text-amber-200/90 border-amber-500/30 hover:border-amber-400 hover:bg-slate-800/80'
                            : 'bg-slate-900 text-white border-slate-800 hover:border-amber-400/60 hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-sm font-mono tracking-tight font-bold">
                          {slot.time_slot}
                        </span>
                        <span
                          className={`text-[10px] ${
                            isSelected
                              ? isOverrun
                                ? 'text-amber-300 font-bold'
                                : 'text-slate-950 font-bold'
                              : isPastTime
                              ? 'text-slate-600'
                              : isFullyBooked
                              ? 'text-rose-400 font-medium'
                              : isOverrun
                              ? 'text-amber-400/90 font-medium'
                              : 'text-emerald-400 font-medium'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Slot Legend */}
                <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-400 pt-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    Slot Tersedia
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                    Sudah Lewat
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    Penuh
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    Lewat Jam Tutup
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    Pilihan Anda
                  </span>
                </div>

                {/* Interactive Timing Status Card for Selected Slot */}
                {selectedTimeSlot && selectedService && selectedOutlet && (() => {
                  const currentTiming = calculateBookingTiming(
                    selectedTimeSlot,
                    selectedService.duration_minutes,
                    selectedOutlet.operating_hours,
                    slots
                  );

                  if (currentTiming.isDurationOverrun) {
                    return (
                      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-200 space-y-2 animate-in fade-in">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <div className="text-sm font-bold text-white flex items-center gap-2">
                              <span>Durasi Layanan Melewati Jam Tutup Cabang</span>
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                Butuh Waktu Lebih Awal
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">
                              Layanan <strong>{selectedService.name}</strong> berdurasi <strong>{selectedService.duration_minutes} menit</strong>. Jika Anda mulai pukul <strong className="text-white font-mono">{selectedTimeSlot} WIB</strong>, estimasi selesai adalah pukul <strong className="text-amber-300 font-mono font-bold">~{currentTiming.estimatedEndTime} WIB</strong>, melewati jam operasional tutup cabang ({currentTiming.closeTime} WIB).
                            </p>
                            <p className="text-xs text-amber-300 font-medium pt-1">
                              💡 Silakan pilih slot jam kedatangan paling lambat pukul <strong className="underline decoration-amber-400 font-bold">{currentTiming.latestAllowableSlot || currentTiming.latestValidStartTime} WIB</strong> agar proses pangkas dapat selesai dengan maksimal.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="p-3.5 rounded-xl bg-slate-900/70 border border-emerald-500/30 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2 animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                          Estimasi Jadwal:{' '}
                          <strong className="text-white font-mono">{selectedTimeSlot} – {currentTiming.estimatedEndTime} WIB</strong>
                          <span className="text-emerald-400 ml-1.5 font-medium">
                            ({selectedService.duration_minutes} menit • Dalam jam operasional)
                          </span>
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Jam tutup cabang: <strong className="text-slate-300">{currentTiming.closeTime} WIB</strong>
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  clearErrors();
                  setCurrentStep(3);
                }}
                className="text-slate-400 hover:text-white font-medium px-4 py-2.5 rounded-xl flex items-center gap-1.5 text-sm transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>
              {(() => {
                const activeTiming = selectedTimeSlot && selectedService && selectedOutlet
                  ? calculateBookingTiming(
                      selectedTimeSlot,
                      selectedService.duration_minutes,
                      selectedOutlet.operating_hours,
                      slots
                    )
                  : null;

                const selectedSlotObj = slots.find((s) => s.time_slot === selectedTimeSlot);
                const isPast = selectedSlotObj ? isSlotPastTime(selectedSlotObj, selectedDate) : false;
                const isOverrun = Boolean(activeTiming?.isDurationOverrun);
                const isInvalid = isOverrun || isPast;

                return (
                  <div className="flex items-center gap-3">
                    {isOverrun && (
                      <span className="text-[11px] text-amber-400 hidden sm:inline">
                        Pilih slot sebelum {activeTiming?.latestAllowableSlot || activeTiming?.latestValidStartTime} WIB
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (isOverrun) {
                          const err = formatBookingError(
                            'Durasi layanan melewati jam operasional barbershop',
                            {
                              service: selectedService,
                              outlet: selectedOutlet,
                              barber: selectedBarber,
                              isAnyBarber,
                              selectedSlot: selectedTimeSlot,
                              availableSlots: slots,
                            }
                          );
                          setBookingError(err);
                          return;
                        }
                        clearErrors();
                        setCurrentStep(5);
                      }}
                      disabled={!selectedTimeSlot || isInvalid}
                      className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-6 py-3 rounded-xl flex items-center gap-2 text-sm shadow-md shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <span>Lanjut: Isi Data Diri</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* STEP 5: FORMULIR DATA DIRI & REVIEW */}
        {currentStep === 5 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-amber-400" />
                Lengkapi Data Diri Reservasi
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Tiket konfirmasi dan pengingat jadwal akan dikirimkan langsung ke nomor WhatsApp Anda.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              {/* Form inputs (3 cols) */}
              <form onSubmit={handleBookingSubmit} className="md:col-span-3 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Nama Lengkap <span className="text-amber-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      maxLength={40}
                      placeholder="Contoh: Budi Santoso"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Nomor WhatsApp / HP <span className="text-amber-400">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input
                      type="tel"
                      inputMode="numeric"
                      required
                      maxLength={20}
                      placeholder="Contoh: 0812-3456-7890"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value.slice(0, 20))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Gunakan nomor aktif untuk kemudahan kirim tiket dan konfirmasi kedatangan.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Email (Opsional)
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input
                      type="email"
                      maxLength={100}
                      placeholder="email@domain.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value.slice(0, 100))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Catatan / Preferensi Gaya Rambut (Opsional)
                  </label>
                  <div className="relative">
                    <FileText className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <textarea
                      rows={2}
                      maxLength={1000}
                      placeholder="Contoh: Model low taper fade samping rapi..."
                      value={bookingNotes}
                      onChange={(e) => setBookingNotes(e.target.value.slice(0, 1000))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                    <span>Preferensi model atau instruksi khusus untuk barber.</span>
                    <span className="font-mono">{bookingNotes.length} / 1000</span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      clearErrors();
                      setCurrentStep(4);
                    }}
                    className="text-slate-400 hover:text-white font-medium px-4 py-2.5 rounded-xl flex items-center gap-1.5 text-sm transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Kembali</span>
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black px-6 py-3.5 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Mengonfirmasi Reservasi...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Konfirmasi Reservasi Sekarang</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Booking Summary Card (2 cols) */}
              <div className="md:col-span-2">
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 sticky top-20 shadow-xl">
                  <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 border-b border-slate-800 pb-2 mb-3">
                    Ringkasan Reservasi
                  </h3>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-slate-500 block">Cabang Barbershop:</span>
                      <strong className="text-white text-sm">{selectedOutlet?.name}</strong>
                      <p className="text-[11px] text-slate-400">{selectedOutlet?.address}</p>
                    </div>

                    <div className="border-t border-slate-800/80 pt-2">
                      <span className="text-slate-500 block">Layanan Terpilih:</span>
                      <div className="flex justify-between items-center mt-0.5">
                        <strong className="text-white text-sm">{selectedService?.name}</strong>
                        <span className="text-amber-400 font-bold">
                          Rp {selectedService?.selling_price.toLocaleString('id-ID')}
                        </span>
                      </div>
                      <span className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-amber-400" />
                        Durasi: {selectedService?.duration_minutes} Menit
                      </span>
                    </div>

                    <div className="border-t border-slate-800/80 pt-2">
                      <span className="text-slate-500 block">Barber / Stylist:</span>
                      <strong className="text-white">
                        {isAnyBarber ? 'Siapa Saja / Bebas (Tersedia)' : selectedBarber?.full_name}
                      </strong>
                    </div>

                    <div className="border-t border-slate-800/80 pt-2">
                      <span className="text-slate-500 block">Waktu Kedatangan:</span>
                      <strong className="text-amber-300 block text-sm">
                        {formatDateDisplay(selectedDate)}
                      </strong>
                      <span className="text-white font-mono text-base font-bold">
                        ⏰ {selectedTimeSlot} WIB
                      </span>
                    </div>

                    <div className="border-t border-slate-800/80 pt-3 flex justify-between items-center text-sm">
                      <span className="text-slate-400 font-medium">Estimasi Biaya:</span>
                      <span className="text-lg font-black text-amber-400">
                        Rp {selectedService?.selling_price.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 italic text-right">
                      *Pembayaran dilakukan di kasir saat kedatangan
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: TIKET RESERVASI DIGITAL & NOTIFIKASI WHATSAPP */}
        {currentStep === 6 && confirmation && (
          <div className="max-w-xl mx-auto w-full space-y-6 animate-in zoom-in-95 duration-300">
            {/* Success Banner */}
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-500/40 text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black text-white">Reservasi Berhasil Dikonfirmasi!</h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Janji temu Anda telah tercatat pada sistem barbershop dan siap dilayani.
              </p>
            </div>

            {/* Boarding Pass Ticket Card */}
            <div className="bg-gradient-to-b from-slate-900 to-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative">
              {/* Ticket Top Ribbon */}
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 text-slate-950 flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-widest font-black opacity-80">
                    Tiket Resmi Reservasi
                  </span>
                  <div className="text-lg font-black tracking-tight">{confirmation.outlet_name}</div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold bg-slate-950/20 px-2 py-0.5 rounded">
                    Status
                  </span>
                  <div className="text-xs font-black uppercase tracking-wider text-slate-950 mt-0.5">
                    Terkonfirmasi ✅
                  </div>
                </div>
              </div>

              {/* Ticket Body */}
              <div className="p-6 space-y-4">
                {/* Booking Code Banner */}
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Kode Booking Janji Temu
                  </span>
                  <div className="text-xl sm:text-2xl font-mono font-black text-amber-400 tracking-wider mt-0.5">
                    {confirmation.appointment_number}
                  </div>
                  {confirmation.queue_number && (
                    <div className="text-xs text-slate-400 mt-1">
                      Nomor Antrean Hari Ini:{' '}
                      <span className="text-emerald-400 font-bold font-mono">
                        #{confirmation.queue_number}
                      </span>
                    </div>
                  )}
                </div>

                {/* Ticket Details Grid */}
                <div className="grid grid-cols-2 gap-4 text-xs pt-1">
                  <div>
                    <span className="text-slate-500 block">Nama Pelanggan:</span>
                    <strong className="text-white text-sm">{confirmation.customer_name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">No. WhatsApp:</span>
                    <strong className="text-white text-sm font-mono">
                      {confirmation.customer_phone}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Layanan Pangkas:</span>
                    <strong className="text-white text-sm">{confirmation.service_name}</strong>
                    <span className="text-slate-400 text-[11px] block">
                      ⏱️ {confirmation.duration_minutes} Menit
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Barber / Stylist:</span>
                    <strong className="text-amber-400 text-sm">
                      💈 {confirmation.barber_name}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Hari / Tanggal:</span>
                    <strong className="text-white text-sm">
                      {formatDateDisplay(confirmation.booking_date)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Waktu Kedatangan:</span>
                    <strong className="text-amber-300 text-sm font-mono">
                      ⏰ {confirmation.booking_time} WIB
                    </strong>
                  </div>
                </div>

                {/* Location & Instructions */}
                <div className="border-t border-slate-800/80 pt-3 text-xs text-slate-400 space-y-1">
                  <div className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{confirmation.outlet_address || 'Alamat cabang barbershop'}</span>
                  </div>
                  {confirmation.outlet_phone && (
                    <div className="flex items-center gap-1.5 font-mono">
                      <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Telp: {confirmation.outlet_phone}</span>
                    </div>
                  )}
                </div>

                {/* Total Cost */}
                <div className="border-t border-dashed border-slate-800 pt-3 flex justify-between items-center">
                  <span className="text-xs text-slate-400">Total Biaya (Bayar di Kasir):</span>
                  <span className="text-lg font-black text-amber-400">
                    Rp {Number(confirmation.price).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* Perforated Divider Visual */}
              <div className="relative border-b border-dashed border-slate-800">
                <div className="w-5 h-5 rounded-full bg-slate-950 absolute -left-2.5 -top-2.5 border-r border-slate-800" />
                <div className="w-5 h-5 rounded-full bg-slate-950 absolute -right-2.5 -top-2.5 border-l border-slate-800" />
              </div>

              {/* Ticket Footer Actions */}
              <div className="p-5 bg-slate-950/60 flex flex-col sm:flex-row items-center gap-3">
                {/* WhatsApp Button */}
                <a
                  href={buildWhatsAppTicketUrl(
                    confirmation.customer_phone,
                    confirmation.whatsapp_message
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-emerald-600/20 transition-all"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Kirim Tiket ke WhatsApp</span>
                </a>

                {/* Copy Button */}
                <button
                  type="button"
                  onClick={handleCopyTicket}
                  className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm border border-slate-700 transition-colors"
                >
                  {copiedTicket ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Salin Rincian</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Arrival Notice Card */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-300 space-y-1">
              <strong className="block font-bold">📌 Petunjuk Kedatangan:</strong>
              <p>1. Mohon hadir 10 menit sebelum jam janji temu Anda.</p>
              <p>2. Tunjukkan kode booking <strong>{confirmation.appointment_number}</strong> ke kasir atau kapster saat tiba.</p>
              <p>3. Janji temu otomatis dibatalkan jika terlambat lebih dari 15 menit tanpa konfirmasi.</p>
            </div>

            {/* Book Another Button */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleResetBooking}
                className="text-xs text-slate-400 hover:text-white font-semibold underline underline-offset-4 transition-colors"
              >
                Buat Reservasi Baru
              </button>
            </div>
          </div>
        )}
      </main>

      {/* 3. Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-4 text-center text-xs text-slate-500">
        <p>© 2026 Barbershop Operating System. All Rights Reserved.</p>
      </footer>
    </div>
  );
}

/**
 * Structured Booking Error Component
 * Formats Condition A (outside hours), Condition B (duration overrun), Condition C (barber conflict),
 * and Condition D (slot taken) with human-friendly Indonesian text, live data, and quick actions.
 */
function BookingErrorAlert({
  error,
  simpleMessage,
  onClear,
  onAction,
}: {
  error: BookingErrorInfo | null;
  simpleMessage: string | null;
  onClear: () => void;
  onAction?: (actionType: string) => void;
}) {
  if (!error && !simpleMessage) return null;

  // Simple string message fallback
  if (!error) {
    return (
      <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start justify-between gap-3 animate-in fade-in">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-sm font-medium">{simpleMessage}</div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-rose-400 hover:text-white p-1 rounded-lg transition-colors"
          title="Tutup Pesan"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const isDurationOverrun = error.kind === 'DURATION_OVERRUN';
  const isBarberUnavailable = error.kind === 'BARBER_UNAVAILABLE';
  const isSlotTaken = error.kind === 'SLOT_TAKEN';
  const isRateLimit = error.kind === 'RATE_LIMIT';

  const themeClasses = isDurationOverrun
    ? 'bg-amber-950/40 border-amber-500/40 text-amber-200 shadow-amber-500/5'
    : isBarberUnavailable
    ? 'bg-sky-950/40 border-sky-500/40 text-sky-200 shadow-sky-500/5'
    : isSlotTaken
    ? 'bg-orange-950/40 border-orange-500/40 text-orange-200 shadow-orange-500/5'
    : isRateLimit
    ? 'bg-amber-950/40 border-amber-500/40 text-amber-200 shadow-amber-500/5'
    : 'bg-rose-950/40 border-rose-500/40 text-rose-200 shadow-rose-500/5';

  const badgeClasses = isDurationOverrun
    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    : isBarberUnavailable
    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
    : isSlotTaken
    ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
    : isRateLimit
    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    : 'bg-rose-500/20 text-rose-300 border-rose-500/40';

  const iconComponent = isDurationOverrun ? (
    <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
  ) : isBarberUnavailable ? (
    <UserCheck className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
  ) : isSlotTaken ? (
    <RefreshCw className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
  ) : isRateLimit ? (
    <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
  ) : (
    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
  );

  return (
    <div className={`mb-6 p-4 sm:p-5 rounded-2xl border shadow-xl animate-in fade-in duration-200 ${themeClasses}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {iconComponent}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                {error.title}
              </h3>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeClasses}`}>
                {isDurationOverrun
                  ? 'Durasi Pengerjaan'
                  : isBarberUnavailable
                  ? 'Jadwal Barber'
                  : isSlotTaken
                  ? 'Slot Terisi'
                  : isRateLimit
                  ? 'Batas Percobaan'
                  : 'Info Reservasi'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {error.message}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors shrink-0"
          title="Tutup Pesan"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Structured Details Card (Actual Data) */}
      {error.details && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
          {error.details.serviceName && (
            <div className="bg-slate-900/70 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Layanan & Durasi
              </span>
              <strong className="text-white block mt-0.5">
                {error.details.serviceName}
              </strong>
              {error.details.serviceDuration && (
                <span className="text-amber-400 font-mono font-medium text-[11px]">
                  {error.details.serviceDuration} Menit Pengerjaan
                </span>
              )}
            </div>
          )}

          {error.details.selectedSlot && (
            <div className="bg-slate-900/70 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Waktu Dipilih
              </span>
              <strong className="text-white font-mono block mt-0.5">
                {error.details.selectedSlot}
              </strong>
              {error.details.estimatedEndTime && (
                <span className="text-rose-300 font-mono text-[11px]">
                  Estimasi Selesai: ~{error.details.estimatedEndTime}
                </span>
              )}
            </div>
          )}

          {error.details.operatingHours && (
            <div className="bg-slate-900/70 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Jam Operasional
              </span>
              <strong className="text-white font-mono block mt-0.5">
                {error.details.operatingHours}
              </strong>
              {error.details.closeTime && (
                <span className="text-slate-400 text-[11px]">
                  Tutup Cabang: {error.details.closeTime}
                </span>
              )}
            </div>
          )}

          {error.details.latestValidTime && (
            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-amber-500/40 col-span-2 sm:col-span-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block">
                💡 Batas Booking Terakhir yang Tersedia
              </span>
              <div className="text-xs text-slate-200 mt-0.5">
                Silakan pilih jadwal kedatangan paling lambat pukul{' '}
                <strong className="text-amber-300 font-mono font-bold text-sm">
                  {error.details.latestValidTime}
                </strong>{' '}
                agar layanan pangkas dapat diselesaikan secara maksimal sebelum jam tutup barbershop.
                {error.details.latestRecommendedSlot && (
                  <span className="block mt-0.5 text-slate-300">
                    Rekomendasi slot terdekat:{' '}
                    <strong className="text-emerald-400 font-mono font-bold">
                      {error.details.latestRecommendedSlot}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          )}

          {error.details.barberName && !error.details.latestValidTime && (
            <div className="bg-slate-900/70 p-2.5 rounded-xl border border-slate-800/80 col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Barber Terpilih
              </span>
              <strong className="text-white block mt-0.5">{error.details.barberName}</strong>
            </div>
          )}
        </div>
      )}

      {/* Suggestion Callout & Action Buttons */}
      <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <p className="text-slate-300 font-medium flex-1">
          {error.suggestion}
        </p>

        <div className="flex items-center gap-2">
          {error.actionType === 'choose_any_barber' && (
            <button
              type="button"
              onClick={() => onAction && onAction('choose_any_barber')}
              className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-sky-500/20"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Gunakan Opsi "Siapa Saja"</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onAction && onAction('change_time')}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-amber-500/20"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pilih Jadwal Lain</span>
          </button>
        </div>
      </div>
    </div>
  );
}
