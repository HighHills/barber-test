/**
 * Barber Operational Availability Error Mapping & Parsing (Phase 4B)
 * Authoritative backend error contract:
 * SQLSTATE: P0006
 * Message prefix: BARBER_NOT_OPERATIONALLY_AVAILABLE: <STATUS>
 */

import {
  type BarberAvailabilityStatus,
  BARBER_AVAILABILITY_LABELS,
  isValidBarberAvailabilityStatus,
} from '../types/pos';

export const BARBER_OPERATIONAL_ERROR_CODE = 'P0006';
export const BARBER_OPERATIONAL_ERROR_PREFIX = 'BARBER_NOT_OPERATIONALLY_AVAILABLE';

export interface BarberOperationalError {
  type: 'BARBER_NOT_OPERATIONALLY_AVAILABLE';
  status: BarberAvailabilityStatus | null;
  message: string;
  rawMessage: string;
}

/**
 * Parses an unknown error into a typed BarberOperationalError.
 * Returns null if the error is not an authoritative barber operational rejection.
 * Rejects SHIFT_ACTIVE as an invalid rejection.
 * Fails closed if status is malformed or unknown (status = null).
 */
export function parseBarberOperationalError(error: unknown): BarberOperationalError | null {
  if (!error) return null;

  let code: string | null = null;
  let rawMessage = '';

  if (typeof error === 'string') {
    rawMessage = error;
  } else if (typeof error === 'object' && error !== null) {
    const errObj = error as { code?: unknown; message?: unknown };
    if (typeof errObj.code === 'string') {
      code = errObj.code.trim();
    }
    if (typeof errObj.message === 'string') {
      rawMessage = errObj.message.trim();
    }
  }

  const isP0006 = code === BARBER_OPERATIONAL_ERROR_CODE;
  const containsPrefix = rawMessage.includes(BARBER_OPERATIONAL_ERROR_PREFIX);

  // Must match either SQLSTATE P0006 or the authoritative prefix
  if (!isP0006 && !containsPrefix) {
    return null;
  }

  // Extract status token after "BARBER_NOT_OPERATIONALLY_AVAILABLE:"
  let parsedStatus: BarberAvailabilityStatus | null = null;
  const match = rawMessage.match(/BARBER_NOT_OPERATIONALLY_AVAILABLE:\s*([A-Za-z0-9_]+)/i);

  if (match && match[1]) {
    const rawStatus = match[1].trim().toUpperCase();

    // RULE A: P0006 + SHIFT_ACTIVE -> parser must not treat as valid rejection
    if (rawStatus === 'SHIFT_ACTIVE') {
      return null;
    }

    if (isValidBarberAvailabilityStatus(rawStatus)) {
      parsedStatus = rawStatus;
    }
  }

  // If status is parsed and valid (ON_BREAK, UNCONFIGURED, OUTSIDE_SHIFT, DAY_OFF, ON_LEAVE, INACTIVE)
  if (parsedStatus) {
    const statusLabel = BARBER_AVAILABILITY_LABELS[parsedStatus];
    return {
      type: 'BARBER_NOT_OPERATIONALLY_AVAILABLE',
      status: parsedStatus,
      message: `Kapster tidak dapat ditugaskan saat ini. Status: ${statusLabel}.`,
      rawMessage,
    };
  }

  // RULE F: P0006 with unknown status -> status = null -> fail closed
  return {
    type: 'BARBER_NOT_OPERATIONALLY_AVAILABLE',
    status: null,
    message: 'Kapster tidak dapat ditugaskan saat ini karena kendala ketersediaan operasional.',
    rawMessage,
  };
}

/**
 * Returns a contextual Indonesian message based on operational status and context
 */
export function formatBarberOperationalErrorMessage(
  status: BarberAvailabilityStatus | null,
  context: 'walkin' | 'called',
  barberName?: string | null
): string {
  const barberIdentifier = barberName?.trim() ? `kapster ${barberName.trim()}` : 'kapster';

  if (!status) {
    return context === 'called'
      ? `Antrean belum dapat dipanggil karena ${barberIdentifier} tidak tersedia secara operasional saat ini.`
      : 'Kapster tidak dapat ditugaskan saat ini karena kendala ketersediaan operasional.';
  }

  switch (status) {
    case 'ON_BREAK':
      return context === 'called'
        ? `Antrean belum dapat dipanggil karena ${barberIdentifier} sedang istirahat.`
        : 'Kapster tidak dapat ditugaskan saat ini. Status: Sedang Istirahat.';
    case 'UNCONFIGURED':
      return context === 'called'
        ? `Antrean belum dapat dipanggil karena jadwal ${barberIdentifier} belum diatur.`
        : 'Kapster tidak dapat ditugaskan saat ini. Status: Jadwal Belum Diatur.';
    case 'OUTSIDE_SHIFT':
      return context === 'called'
        ? `Antrean belum dapat dipanggil karena ${barberIdentifier} sedang di luar shift.`
        : 'Kapster tidak dapat ditugaskan saat ini. Status: Di Luar Shift.';
    case 'DAY_OFF':
      return context === 'called'
        ? `Antrean belum dapat dipanggil karena ${barberIdentifier} sedang hari libur.`
        : 'Kapster tidak dapat ditugaskan saat ini. Status: Hari Libur.';
    case 'ON_LEAVE':
      return context === 'called'
        ? `Antrean belum dapat dipanggil karena ${barberIdentifier} sedang cuti.`
        : 'Kapster tidak dapat ditugaskan saat ini. Status: Sedang Cuti.';
    case 'INACTIVE':
      return context === 'called'
        ? `Antrean belum dapat dipanggil karena ${barberIdentifier} sedang nonaktif.`
        : 'Kapster tidak dapat ditugaskan saat ini. Status: Nonaktif.';
    default:
      return `Kapster tidak dapat ditugaskan saat ini. Status: ${BARBER_AVAILABILITY_LABELS[status] || status}.`;
  }
}
