// apps/web/src/lib/booking-error-helper.ts
// Helper utilities for Public Customer Self-Booking Portal
// Operating hours parsing, timing calculation, slot validation, and human-friendly error formatting.

export interface OperatingHours {
  openTime: string; // e.g. "09:00"
  closeTime: string; // e.g. "21:00"
  openMinutes: number; // minutes from 00:00 (e.g. 540)
  closeMinutes: number; // minutes from 00:00 (e.g. 1260)
  raw: string;
}

export interface BookingTiming {
  startTime: string; // "HH:MM"
  durationMinutes: number;
  estimatedEndTime: string; // "HH:MM"
  openTime: string;
  closeTime: string;
  latestValidStartTime: string; // "HH:MM"
  isOutsideHours: boolean; // start < open || start >= close
  isDurationOverrun: boolean; // start >= open && start < close && start + duration > close
  latestAllowableSlot: string | null;
}

export type BookingErrorKind =
  | 'DURATION_OVERRUN' // Kondisi B: Jam mulai dalam jam buka, tapi durasi selesai lewat jam tutup
  | 'OUTSIDE_HOURS' // Kondisi A: Jam mulai di luar jam operasional
  | 'BARBER_UNAVAILABLE' // Kondisi C: Barber yang dipilih bentrok / sudah ada janji
  | 'SLOT_TAKEN' // Kondisi D: Slot waktu habis / baru saja diambil orang lain (race condition)
  | 'GENERAL_ERROR';

export interface BookingErrorInfo {
  kind: BookingErrorKind;
  title: string;
  message: string;
  details?: {
    serviceName?: string;
    serviceDuration?: number;
    selectedSlot?: string;
    estimatedEndTime?: string;
    operatingHours?: string;
    outletName?: string;
    openTime?: string;
    closeTime?: string;
    latestValidTime?: string;
    latestRecommendedSlot?: string;
    barberName?: string;
  };
  suggestion: string;
  actionType?: 'change_time' | 'choose_any_barber' | 'refresh_slots';
}

/**
 * Converts "HH:MM" or "HH:MM:SS" string to total minutes from midnight.
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}

/**
 * Converts total minutes from midnight to "HH:MM" string.
 */
export function minutesToTime(totalMinutes: number): string {
  const norm = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Parses operating hours string (e.g. "09:00 - 21:00", "09:00 - 21:00 WIB", "09.00 - 21.00").
 * Defaults to 09:00 - 21:00 if undefined or unparseable.
 */
export function parseOperatingHours(operatingHours?: string | null): OperatingHours {
  const fallback = {
    openTime: '09:00',
    closeTime: '21:00',
    openMinutes: 9 * 60,
    closeMinutes: 21 * 60,
    raw: operatingHours || '09:00 - 21:00 WIB',
  };

  if (!operatingHours || typeof operatingHours !== 'string') {
    return fallback;
  }

  // Find all time patterns like "09:00", "9:00", "09.00"
  const matches = operatingHours.match(/(\d{1,2})[:.](\d{2})/g);
  if (!matches || matches.length < 2) {
    return fallback;
  }

  const parseMins = (str: string) => {
    const clean = str.replace('.', ':');
    const [h, m] = clean.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const openMinutes = parseMins(matches[0]);
  const closeMinutes = parseMins(matches[1]);

  return {
    openTime: minutesToTime(openMinutes),
    closeTime: minutesToTime(closeMinutes),
    openMinutes,
    closeMinutes,
    raw: operatingHours,
  };
}

/**
 * Checks if a slot time has already passed based on backend reason or selected date & time.
 */
export function isSlotPastTime(
  slot: { time_slot: string; reason?: string | null },
  selectedDate?: string | null
): boolean {
  // 1. Check backend explicit reason
  if (slot.reason) {
    const r = slot.reason.toLowerCase();
    if (r.includes('lewat') || r.includes('past') || r.includes('lampau')) {
      return true;
    }
  }

  // 2. Client-side evaluation for selectedDate
  if (selectedDate) {
    const todayStr = new Date().toISOString().split('T')[0];
    if (selectedDate < todayStr) {
      return true;
    }
    if (selectedDate === todayStr) {
      const now = new Date();
      const currentMins = now.getHours() * 60 + now.getMinutes();
      const slotMins = timeToMinutes(slot.time_slot);
      // Buffer of 10 minutes, matching backend rule
      if (slotMins <= currentMins + 10) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Finds the latest available slot from a list of slots where slot_time + duration <= closeMinutes.
 */
export function findLatestAllowableSlot(
  slots: { time_slot: string; is_available?: boolean; reason?: string | null }[],
  closeMinutes: number,
  durationMinutes: number,
  selectedDate?: string | null
): string | null {
  const validSlots = slots
    .map((s) => ({
      slot: s.time_slot,
      mins: timeToMinutes(s.time_slot),
      available: s.is_available !== false,
      isPast: isSlotPastTime(s, selectedDate),
    }))
    .filter((s) => s.mins + durationMinutes <= closeMinutes)
    .sort((a, b) => b.mins - a.mins);

  if (validSlots.length === 0) return null;

  // Prefer available and not-past slot
  const preferred = validSlots.find((s) => s.available && !s.isPast);
  if (preferred) return preferred.slot;

  const anyAvailable = validSlots.find((s) => s.available);
  return anyAvailable ? anyAvailable.slot : validSlots[0].slot;
}

/**
 * Calculates complete booking timing metrics (start, duration, estimated finish, closing limit).
 */
export function calculateBookingTiming(
  startTime: string,
  durationMinutes: number,
  operatingHoursStr?: string | null,
  availableSlots: { time_slot: string; is_available?: boolean }[] = []
): BookingTiming {
  const op = parseOperatingHours(operatingHoursStr);
  const startMins = timeToMinutes(startTime);
  const duration = Math.max(1, durationMinutes || 45);
  const endMins = startMins + duration;

  // Latest start time to finish on or before closing
  const latestValidMins = op.closeMinutes - duration;
  const latestValidStartTime = minutesToTime(Math.max(op.openMinutes, latestValidMins));

  const isOutsideHours = startMins < op.openMinutes || startMins >= op.closeMinutes;
  const isDurationOverrun =
    startMins >= op.openMinutes && startMins < op.closeMinutes && endMins > op.closeMinutes;

  const latestAllowableSlot = findLatestAllowableSlot(availableSlots, op.closeMinutes, duration);

  return {
    startTime: minutesToTime(startMins),
    durationMinutes: duration,
    estimatedEndTime: minutesToTime(endMins),
    openTime: op.openTime,
    closeTime: op.closeTime,
    latestValidStartTime,
    isOutsideHours,
    isDurationOverrun,
    latestAllowableSlot,
  };
}

export interface BookingErrorContext {
  service?: { name: string; duration_minutes: number } | null;
  outlet?: { name: string; operating_hours: string } | null;
  barber?: { full_name: string } | null;
  isAnyBarber?: boolean;
  selectedSlot?: string | null;
  selectedDate?: string | null;
  availableSlots?: { time_slot: string; is_available?: boolean; reason?: string | null }[];
}

/**
 * Humanizes and formats any booking error into a specific, structured, and helpful message.
 * Differentiates 4 explicit error conditions:
 *   A. OUTSIDE_HOURS: Start time outside operating hours
 *   B. DURATION_OVERRUN: Service duration makes finish time exceed outlet closing time
 *   C. BARBER_UNAVAILABLE: Barber collision / already booked
 *   D. SLOT_TAKEN: Slot was just taken by another customer
 */
export function formatBookingError(
  rawError: any,
  context: BookingErrorContext
): BookingErrorInfo {
  const rawMsg =
    typeof rawError === 'string'
      ? rawError
      : rawError?.message || 'Terjadi kendala saat memproses reservasi.';

  const lower = rawMsg.toLowerCase();
  const serviceName = context.service?.name || 'Layanan Pangkas';
  const duration = context.service?.duration_minutes || 45;
  const outletName = context.outlet?.name || 'Barbershop';
  const operatingHours = context.outlet?.operating_hours || '09:00 - 21:00 WIB';
  const selectedSlot = context.selectedSlot || 'jam yang dipilih';
  const barberName = context.barber?.full_name;

  // 1. Calculate timing metrics if slot is selected
  const timing = context.selectedSlot
    ? calculateBookingTiming(
        context.selectedSlot,
        duration,
        context.outlet?.operating_hours,
        context.availableSlots || []
      )
    : null;

  // --- KONDISI B: DURATION OVERRUN ---
  // If timing reveals an overrun OR backend mentions operating hours with start time before closing
  const isOperatingHourError =
    lower.includes('jam operasional') ||
    lower.includes('operating hours') ||
    lower.includes('jam tutup') ||
    lower.includes('di luar jam');

  if (timing?.isDurationOverrun || (isOperatingHourError && timing && !timing.isOutsideHours)) {
    const estEnd = timing?.estimatedEndTime || 'melewati jam operasional';
    const closeTime = timing?.closeTime || '21:00';
    const latestTime = timing?.latestValidStartTime || 'sebelumnya';
    const recSlot = timing?.latestAllowableSlot;

    const recText = recSlot
      ? ` Silakan pilih slot jam ${recSlot} WIB (atau waktu sebelumnya).`
      : ` Silakan pilih jam kedatangan sebelum pukul ${latestTime} WIB.`;

    return {
      kind: 'DURATION_OVERRUN',
      title: 'Durasi Layanan Melewati Jam Tutup Barbershop',
      message: `Layanan "${serviceName}" memerlukan waktu pengerjaan sekitar ${duration} menit. Jika dimulai pukul ${selectedSlot} WIB, pengerjaan diperkirakan baru selesai pukul ${estEnd} WIB, sedangkan cabang ${outletName} tutup pada pukul ${closeTime} WIB.`,
      details: {
        serviceName,
        serviceDuration: duration,
        selectedSlot: `${selectedSlot} WIB`,
        estimatedEndTime: `${estEnd} WIB`,
        operatingHours,
        outletName,
        closeTime: `${closeTime} WIB`,
        latestValidTime: `${latestTime} WIB`,
        latestRecommendedSlot: recSlot ? `${recSlot} WIB` : undefined,
      },
      suggestion: `Agar pengerjaan rambut Anda maksimal dan tidak terburu-buru, silakan atur waktu kedatangan lebih awal.${recText}`,
      actionType: 'change_time',
    };
  }

  // --- KONDISI A: OUTSIDE OPERATING HOURS ---
  if (timing?.isOutsideHours || (isOperatingHourError && timing?.isOutsideHours)) {
    const openTime = timing?.openTime || '09:00';
    const closeTime = timing?.closeTime || '21:00';
    const latestTime = timing?.latestValidStartTime || '20:00';

    return {
      kind: 'OUTSIDE_HOURS',
      title: 'Waktu Booking di Luar Jam Buka Operasional',
      message: `Cabang ${outletName} beroperasi pukul ${openTime} – ${closeTime} WIB. Waktu kedatangan yang dipilih (${selectedSlot} WIB) berada di luar jam operasional barbershop.`,
      details: {
        serviceName,
        serviceDuration: duration,
        selectedSlot: `${selectedSlot} WIB`,
        operatingHours,
        outletName,
        openTime: `${openTime} WIB`,
        closeTime: `${closeTime} WIB`,
        latestValidTime: `${latestTime} WIB`,
      },
      suggestion: `Silakan pilih waktu kedatangan antara pukul ${openTime} hingga sebelum pukul ${latestTime} WIB.`,
      actionType: 'change_time',
    };
  }

  // --- PAST TIME ERROR (Evaluated before collision/full checks) ---
  const isPastTime =
    (context.selectedSlot && context.selectedDate
      ? isSlotPastTime({ time_slot: context.selectedSlot }, context.selectedDate)
      : false) ||
    lower.includes('lampau') ||
    lower.includes('past') ||
    lower.includes('waktu sudah lewat');

  if (isPastTime) {
    return {
      kind: 'OUTSIDE_HOURS',
      title: 'Waktu Reservasi Sudah Terlewat',
      message: `Slot waktu pukul ${selectedSlot} WIB sudah terlewat dari waktu saat ini.`,
      details: {
        selectedSlot: `${selectedSlot} WIB`,
        outletName,
      },
      suggestion: `Silakan pilih slot waktu kedatangan berikutnya yang masih tersedia hari ini atau pilih tanggal lain.`,
      actionType: 'change_time',
    };
  }

  // --- KONDISI C: BARBER COLLISION / SCHEDULE CONFLICT ---
  if (
    lower.includes('sudah memiliki jadwal') ||
    lower.includes('bentrok') ||
    lower.includes('overlapping') ||
    lower.includes('exclude_overlapping') ||
    lower.includes('tidak ditugaskan') ||
    (lower.includes('barber') && lower.includes('jadwal'))
  ) {
    return {
      kind: 'BARBER_UNAVAILABLE',
      title: 'Jadwal Barber Sedang Terisi',
      message: barberName
        ? `Barber ${barberName} sudah memiliki janji temu lain dengan pelanggan pada jam ${selectedSlot} WIB.`
        : `Barber pilihan Anda sudah memiliki jadwal reservasi lain pada jam ${selectedSlot} WIB.`,
      details: {
        serviceName,
        selectedSlot: `${selectedSlot} WIB`,
        barberName: barberName || 'Barber Pilihan',
        outletName,
      },
      suggestion: `Anda dapat memilih jam kedatangan lain, atau pilih opsi "Siapa Saja / Bebas" agar sistem mencarikan barber terbaik yang sedang siap melayani.`,
      actionType: context.isAnyBarber ? 'change_time' : 'choose_any_barber',
    };
  }

  // --- KONDISI D: RACE CONDITION / SLOT TAKEN ---
  if (
    lower.includes('semua barber sedang penuh') ||
    lower.includes('slot penuh') ||
    lower.includes('penuh pada jam tersebut') ||
    lower.includes('tidak tersedia') ||
    lower.includes('baru saja') ||
    lower.includes('terisi')
  ) {
    return {
      kind: 'SLOT_TAKEN',
      title: 'Slot Jam Baru Saja Terisi',
      message: `Mohon maaf, slot kedatangan pukul ${selectedSlot} WIB baru saja dipesan oleh pelanggan lain beberapa saat yang lalu.`,
      details: {
        serviceName,
        selectedSlot: `${selectedSlot} WIB`,
        outletName,
      },
      suggestion: `Jadwal telah diperbarui secara otomatis. Silakan pilih slot jam lain yang masih tersedia pada daftar di bawah.`,
      actionType: 'refresh_slots',
    };
  }



  // --- CLEAN GENERAL FALLBACK (Without RPC/database technical jargon) ---
  let cleanMsg = rawMsg;
  if (
    cleanMsg.includes('PGRST') ||
    cleanMsg.includes('RPC') ||
    cleanMsg.includes('postgres') ||
    cleanMsg.includes('relation') ||
    cleanMsg.includes('query')
  ) {
    cleanMsg = 'Terjadi kendala koneksi saat menghubungi sistem barbershop. Silakan periksa kembali data Anda atau coba beberapa saat lagi.';
  }

  return {
    kind: 'GENERAL_ERROR',
    title: 'Periksa Kembali Reservasi Anda',
    message: cleanMsg,
    suggestion: 'Silakan periksa kembali data yang dimasukkan atau coba pilih jam kedatangan lain.',
    actionType: 'change_time',
  };
}
