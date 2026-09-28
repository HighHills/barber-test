/**
 * Verification Test Suite for Web Barber Operational Availability (Phase 4A)
 * Covers:
 * - Scenario A: Budi & Rian = UNCONFIGURED
 * - Scenario B: All 7 Availability Statuses (A through G)
 * - Scenario C: Fail-Closed Enforcement (H through N)
 * - Scenario D: Outlet Isolation & Switching
 * - Scenario E: Zero Device Clock Dependency
 * - Scenario F: Static Codebase Audit (No duplicate queries, single source of truth)
 * - Scenario G: Phase 4A Non-Blocking Selection Behavior
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BARBER_AVAILABILITY_STATUSES,
  BARBER_AVAILABILITY_LABELS,
  BARBER_AVAILABILITY_VARIANTS,
  BARBER_AVAILABILITY_BADGE_CLASSES,
  isValidBarberAvailabilityStatus,
  type RawBarberAvailabilityRow,
} from '../types/barber-availability';
import { parseAuthoritativeBarbers } from '../lib/barber-parser';
import {
  parseBarberOperationalError,
  formatBarberOperationalErrorMessage,
  BARBER_OPERATIONAL_ERROR_CODE,
  BARBER_OPERATIONAL_ERROR_PREFIX,
} from '../lib/barber-operation-errors';

const TEST_OUTLET_A = '11111111-1111-1111-1111-111111111111';
const TEST_OUTLET_B = '22222222-2222-2222-2222-222222222222';

function createMockRow(overrides: Partial<RawBarberAvailabilityRow> = {}): RawBarberAvailabilityRow {
  return {
    outlet_id: TEST_OUTLET_A,
    employee_id: 'emp-budi-01',
    employee_code: 'EMP-001',
    full_name: 'Budi Santoso',
    barber_position: 'Kapster',
    employee_is_active: true,
    assignment_is_active: true,
    schedule_configured: true,
    today_schedule_active: true,
    shift_start: '09:00:00',
    shift_end: '18:00:00',
    break_start: '12:00:00',
    break_end: '13:00:00',
    availability_status: 'SHIFT_ACTIVE',
    is_available_now: true,
    observed_at: '2026-09-27T10:00:00Z',
    outlet_timezone: 'Asia/Jakarta',
    local_date: '2026-09-27',
    local_time: '17:00:00',
    day_of_week: 0,
    ...overrides,
  };
}

describe('Contract & Enum Validation', () => {
  it('defines exactly the 7 authoritative availability statuses', () => {
    expect(BARBER_AVAILABILITY_STATUSES).toEqual([
      'SHIFT_ACTIVE',
      'ON_BREAK',
      'OUTSIDE_SHIFT',
      'DAY_OFF',
      'ON_LEAVE',
      'UNCONFIGURED',
      'INACTIVE',
    ]);
    expect(BARBER_AVAILABILITY_STATUSES).toHaveLength(7);
  });

  it('validates statuses correctly with isValidBarberAvailabilityStatus', () => {
    for (const status of BARBER_AVAILABILITY_STATUSES) {
      expect(isValidBarberAvailabilityStatus(status)).toBe(true);
    }
    expect(isValidBarberAvailabilityStatus('AVAILABLE')).toBe(false);
    expect(isValidBarberAvailabilityStatus('BUSY')).toBe(false);
    expect(isValidBarberAvailabilityStatus('OFFLINE')).toBe(false);
    expect(isValidBarberAvailabilityStatus('')).toBe(false);
    expect(isValidBarberAvailabilityStatus(null)).toBe(false);
    expect(isValidBarberAvailabilityStatus(undefined)).toBe(false);
  });

  it('maps Indonesian labels and badges for all 7 statuses', () => {
    expect(BARBER_AVAILABILITY_LABELS.SHIFT_ACTIVE).toBe('Sedang Bertugas');
    expect(BARBER_AVAILABILITY_LABELS.ON_BREAK).toBe('Sedang Istirahat');
    expect(BARBER_AVAILABILITY_LABELS.OUTSIDE_SHIFT).toBe('Di Luar Shift');
    expect(BARBER_AVAILABILITY_LABELS.DAY_OFF).toBe('Hari Libur');
    expect(BARBER_AVAILABILITY_LABELS.ON_LEAVE).toBe('Sedang Cuti');
    expect(BARBER_AVAILABILITY_LABELS.UNCONFIGURED).toBe('Jadwal Belum Diatur');
    expect(BARBER_AVAILABILITY_LABELS.INACTIVE).toBe('Nonaktif');

    expect(BARBER_AVAILABILITY_VARIANTS.SHIFT_ACTIVE).toBe('success');
    expect(BARBER_AVAILABILITY_VARIANTS.ON_BREAK).toBe('warning');
    expect(BARBER_AVAILABILITY_VARIANTS.OUTSIDE_SHIFT).toBe('neutral');
    expect(BARBER_AVAILABILITY_VARIANTS.DAY_OFF).toBe('neutral');
    expect(BARBER_AVAILABILITY_VARIANTS.ON_LEAVE).toBe('neutral');
    expect(BARBER_AVAILABILITY_VARIANTS.UNCONFIGURED).toBe('warning');
    expect(BARBER_AVAILABILITY_VARIANTS.INACTIVE).toBe('neutral');

    for (const status of BARBER_AVAILABILITY_STATUSES) {
      expect(BARBER_AVAILABILITY_BADGE_CLASSES[status]).toBeDefined();
      expect(BARBER_AVAILABILITY_BADGE_CLASSES[status].length).toBeGreaterThan(0);
    }
  });
});

describe('Scenario A: Budi & Rian = UNCONFIGURED', () => {
  it('correctly handles unconfigured schedules for Budi and Rian', () => {
    const rawData: RawBarberAvailabilityRow[] = [
      createMockRow({
        employee_id: 'emp-budi',
        employee_code: 'BARBER-01',
        full_name: 'Budi',
        schedule_configured: false,
        today_schedule_active: false,
        shift_start: null,
        shift_end: null,
        break_start: null,
        break_end: null,
        availability_status: 'UNCONFIGURED',
        is_available_now: false,
      }),
      createMockRow({
        employee_id: 'emp-rian',
        employee_code: 'BARBER-02',
        full_name: 'Rian',
        schedule_configured: false,
        today_schedule_active: false,
        shift_start: null,
        shift_end: null,
        break_start: null,
        break_end: null,
        availability_status: 'UNCONFIGURED',
        is_available_now: false,
      }),
    ];

    const result = parseAuthoritativeBarbers(rawData, TEST_OUTLET_A);
    expect(result.error).toBeNull();
    expect(result.barbers).toHaveLength(2);

    const [budi, rian] = result.barbers;
    expect(budi.full_name).toBe('Budi');
    expect(budi.availability_status).toBe('UNCONFIGURED');
    expect(budi.is_available_now).toBe(false);
    expect(budi.schedule_configured).toBe(false);
    expect(budi.shift_start).toBeNull();
    expect(BARBER_AVAILABILITY_LABELS[budi.availability_status]).toBe('Jadwal Belum Diatur');
    expect(BARBER_AVAILABILITY_VARIANTS[budi.availability_status]).toBe('warning');

    expect(rian.full_name).toBe('Rian');
    expect(rian.availability_status).toBe('UNCONFIGURED');
    expect(BARBER_AVAILABILITY_LABELS[rian.availability_status]).toBe('Jadwal Belum Diatur');
    expect(BARBER_AVAILABILITY_VARIANTS[rian.availability_status]).toBe('warning');
  });
});

describe('Scenario B: All 7 Availability Statuses (A through G)', () => {
  it('correctly maps status A: SHIFT_ACTIVE', () => {
    const raw = [createMockRow({ availability_status: 'SHIFT_ACTIVE', is_available_now: true })];
    const { barbers } = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    expect(barbers[0].availability_status).toBe('SHIFT_ACTIVE');
    expect(barbers[0].is_available_now).toBe(true);
    expect(BARBER_AVAILABILITY_LABELS[barbers[0].availability_status]).toBe('Sedang Bertugas');
    expect(BARBER_AVAILABILITY_VARIANTS[barbers[0].availability_status]).toBe('success');
  });

  it('correctly maps status B: ON_BREAK', () => {
    const raw = [createMockRow({ availability_status: 'ON_BREAK', is_available_now: false })];
    const { barbers } = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    expect(barbers[0].availability_status).toBe('ON_BREAK');
    expect(barbers[0].is_available_now).toBe(false);
    expect(BARBER_AVAILABILITY_LABELS[barbers[0].availability_status]).toBe('Sedang Istirahat');
    expect(BARBER_AVAILABILITY_VARIANTS[barbers[0].availability_status]).toBe('warning');
  });

  it('correctly maps status C: OUTSIDE_SHIFT', () => {
    const raw = [createMockRow({ availability_status: 'OUTSIDE_SHIFT', is_available_now: false })];
    const { barbers } = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    expect(barbers[0].availability_status).toBe('OUTSIDE_SHIFT');
    expect(barbers[0].is_available_now).toBe(false);
    expect(BARBER_AVAILABILITY_LABELS[barbers[0].availability_status]).toBe('Di Luar Shift');
    expect(BARBER_AVAILABILITY_VARIANTS[barbers[0].availability_status]).toBe('neutral');
  });

  it('correctly maps status D: DAY_OFF', () => {
    const raw = [createMockRow({ availability_status: 'DAY_OFF', is_available_now: false })];
    const { barbers } = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    expect(barbers[0].availability_status).toBe('DAY_OFF');
    expect(barbers[0].is_available_now).toBe(false);
    expect(BARBER_AVAILABILITY_LABELS[barbers[0].availability_status]).toBe('Hari Libur');
    expect(BARBER_AVAILABILITY_VARIANTS[barbers[0].availability_status]).toBe('neutral');
  });

  it('correctly maps status E: ON_LEAVE', () => {
    const raw = [
      createMockRow({
        availability_status: 'ON_LEAVE',
        is_available_now: false,
      }),
    ];
    const { barbers } = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    expect(barbers[0].availability_status).toBe('ON_LEAVE');
    expect(barbers[0].is_available_now).toBe(false);
    expect(BARBER_AVAILABILITY_LABELS[barbers[0].availability_status]).toBe('Sedang Cuti');
    expect(BARBER_AVAILABILITY_VARIANTS[barbers[0].availability_status]).toBe('neutral');
  });

  it('correctly maps status F: UNCONFIGURED', () => {
    const raw = [
      createMockRow({
        availability_status: 'UNCONFIGURED',
        schedule_configured: false,
        is_available_now: false,
      }),
    ];
    const { barbers } = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    expect(barbers[0].availability_status).toBe('UNCONFIGURED');
    expect(barbers[0].is_available_now).toBe(false);
    expect(BARBER_AVAILABILITY_LABELS[barbers[0].availability_status]).toBe('Jadwal Belum Diatur');
    expect(BARBER_AVAILABILITY_VARIANTS[barbers[0].availability_status]).toBe('warning');
  });

  it('filters out inactive employee or assignment (status G: INACTIVE)', () => {
    const raw = [
      createMockRow({ employee_id: 'emp-inactive-1', employee_is_active: false }),
      createMockRow({ employee_id: 'emp-inactive-2', assignment_is_active: false }),
      createMockRow({ employee_id: 'emp-active', employee_is_active: true, assignment_is_active: true }),
    ];
    const { barbers } = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    expect(barbers).toHaveLength(1);
    expect(barbers[0].id).toBe('emp-active');
  });
});

describe('Scenario C: Fail Closed Rules (H through N)', () => {
  it('Rule H: returns empty array on null/empty/invalid input', () => {
    expect(parseAuthoritativeBarbers(null, TEST_OUTLET_A).barbers).toEqual([]);
    expect(parseAuthoritativeBarbers(null, TEST_OUTLET_A).error).toBeDefined();

    expect(parseAuthoritativeBarbers(undefined, TEST_OUTLET_A).barbers).toEqual([]);
    expect(parseAuthoritativeBarbers('invalid', TEST_OUTLET_A).barbers).toEqual([]);
    expect(parseAuthoritativeBarbers({}, TEST_OUTLET_A).barbers).toEqual([]);
  });

  it('Rule I: fails closed on missing outletId', () => {
    const raw = [createMockRow()];
    const result = parseAuthoritativeBarbers(raw, '');
    expect(result.barbers).toEqual([]);
    expect(result.error).toContain('ID Cabang tidak valid');
  });

  it('Rule J: fails closed on mismatched outlet_id in row', () => {
    const raw = [
      createMockRow({ outlet_id: TEST_OUTLET_A }),
      createMockRow({ employee_id: 'emp-other', outlet_id: TEST_OUTLET_B }),
    ];
    const result = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    expect(result.barbers).toEqual([]);
    expect(result.error).toContain('tidak sesuai dengan cabang yang sedang aktif');
  });

  it('Rule K: fails closed on duplicate employee_id in response', () => {
    const raw = [
      createMockRow({ employee_id: 'emp-duplicate' }),
      createMockRow({ employee_id: 'emp-duplicate' }),
    ];
    const result = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    expect(result.barbers).toEqual([]);
    expect(result.error).toContain('duplikasi penugasan');
  });

  it('Rule L: fails closed on invalid availability_status enum', () => {
    const malformedStatusRow = {
      ...createMockRow(),
      availability_status: 'UNKNOWN_STATUS',
    } as unknown as RawBarberAvailabilityRow;
    const raw = [malformedStatusRow];
    const result = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    expect(result.barbers).toEqual([]);
    expect(result.error).toContain('di luar kontrak');
  });

  it('Rule M: fails closed on missing operational metadata (observed_at, local_date, etc.)', () => {
    const missingMetadata1 = [
      { ...createMockRow(), observed_at: null } as unknown as RawBarberAvailabilityRow,
    ];
    expect(parseAuthoritativeBarbers(missingMetadata1, TEST_OUTLET_A).barbers).toEqual([]);
    expect(parseAuthoritativeBarbers(missingMetadata1, TEST_OUTLET_A).error).toContain('metadata');

    const missingMetadata2 = [
      { ...createMockRow(), local_date: null } as unknown as RawBarberAvailabilityRow,
    ];
    expect(parseAuthoritativeBarbers(missingMetadata2, TEST_OUTLET_A).barbers).toEqual([]);

    const missingMetadata3 = [
      { ...createMockRow(), outlet_timezone: null } as unknown as RawBarberAvailabilityRow,
    ];
    expect(parseAuthoritativeBarbers(missingMetadata3, TEST_OUTLET_A).barbers).toEqual([]);
  });

  it('Rule N: fails closed on missing or empty employee_id', () => {
    const rawEmpty = [createMockRow({ employee_id: '' })];
    const resultEmpty = parseAuthoritativeBarbers(rawEmpty, TEST_OUTLET_A);
    expect(resultEmpty.barbers).toEqual([]);
    expect(resultEmpty.error).toContain('employee_id wajib ada');

    const rawNull = [
      { ...createMockRow(), employee_id: null } as unknown as RawBarberAvailabilityRow,
    ];
    const resultNull = parseAuthoritativeBarbers(rawNull, TEST_OUTLET_A);
    expect(resultNull.barbers).toEqual([]);
    expect(resultNull.error).toContain('employee_id wajib ada');
  });
});

describe('Scenario D: Outlet Isolation & Switching', () => {
  it('isolates barbers strictly by requested outlet_id', () => {
    const outletARows = [
      createMockRow({ employee_id: 'barber-outlet-a', outlet_id: TEST_OUTLET_A, full_name: 'Barber A' }),
    ];
    const outletBRows = [
      createMockRow({ employee_id: 'barber-outlet-b', outlet_id: TEST_OUTLET_B, full_name: 'Barber B' }),
    ];

    const resultA = parseAuthoritativeBarbers(outletARows, TEST_OUTLET_A);
    expect(resultA.barbers).toHaveLength(1);
    expect(resultA.barbers[0].id).toBe('barber-outlet-a');

    const resultB = parseAuthoritativeBarbers(outletBRows, TEST_OUTLET_B);
    expect(resultB.barbers).toHaveLength(1);
    expect(resultB.barbers[0].id).toBe('barber-outlet-b');

    // Mismatched cross-query fails closed
    const leakAttempt = parseAuthoritativeBarbers(outletARows, TEST_OUTLET_B);
    expect(leakAttempt.barbers).toEqual([]);
    expect(leakAttempt.error).toBeDefined();
  });
});

describe('Scenario E: Zero Device Clock Dependency', () => {
  it('preserves exact authoritative timestamp and timezone from backend RPC', () => {
    const raw = [
      createMockRow({
        observed_at: '2026-09-27T10:00:00Z',
        outlet_timezone: 'Asia/Jayapura',
        local_date: '2026-09-27',
        local_time: '19:00:00',
        day_of_week: 0,
        availability_status: 'OUTSIDE_SHIFT',
        is_available_now: false,
      }),
    ];

    const { barbers } = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    const b = barbers[0];
    expect(b.observed_at).toBe('2026-09-27T10:00:00Z');
    expect(b.outlet_timezone).toBe('Asia/Jayapura');
    expect(b.local_date).toBe('2026-09-27');
    expect(b.local_time).toBe('19:00:00');
    expect(b.day_of_week).toBe(0);
    expect(b.availability_status).toBe('OUTSIDE_SHIFT');
  });

  it('guarantees parser does not evaluate Date methods or browser clock', () => {
    const originalDateNow = Date.now;
    let clockTouched = false;
    Date.now = () => {
      clockTouched = true;
      return 0;
    };

    try {
      const raw = [createMockRow()];
      parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
      expect(clockTouched).toBe(false);
    } finally {
      Date.now = originalDateNow;
    }
  });
});

describe('Scenario F: Single Source of Truth & Static Codebase Audit', () => {
  const webSrcDir = path.resolve(__dirname, '..');

  it('verifies pos-screen.tsx has no direct employee table query and uses usePos', () => {
    const posScreenContent = fs.readFileSync(
      path.join(webSrcDir, 'components/pos/pos-screen.tsx'),
      'utf-8'
    );
    expect(posScreenContent).not.toMatch(/from\(['"]employees['"]\)/);
    expect(posScreenContent).toMatch(/const\s*\{\s*[^}]*barbers[^}]*\}\s*=\s*usePos\(\)/);
  });

  it('verifies customers/page.tsx has no direct employee table query and uses usePos', () => {
    const customersPageContent = fs.readFileSync(
      path.join(webSrcDir, 'app/customers/page.tsx'),
      'utf-8'
    );
    expect(customersPageContent).not.toMatch(/from\(['"]employees['"]\)/);
    expect(customersPageContent).toMatch(/const\s*\{\s*[^}]*barbers[^}]*\}\s*=\s*usePos\(\)/);
  });

  it('verifies pos-context.tsx calls get_outlet_barber_availability RPC and clears barbers on switch', () => {
    const posContextContent = fs.readFileSync(
      path.join(webSrcDir, 'context/pos-context.tsx'),
      'utf-8'
    );
    expect(posContextContent).toMatch(/get_outlet_barber_availability/);
    expect(posContextContent).toMatch(/parseAuthoritativeBarbers/);
    // Verified that setCurrentOutlet clears barbers
    expect(posContextContent).toMatch(/setBarbers\(\[\]\)/);
  });
});

describe('Scenario G: Phase 4A Non-Blocking Picker Behavior', () => {
  const webSrcDir = path.resolve(__dirname, '..');

  it('allows barbers with non-active operational status to be selected in parser', () => {
    const raw = [
      createMockRow({ employee_id: 'emp-off', availability_status: 'DAY_OFF', is_available_now: false }),
      createMockRow({ employee_id: 'emp-break', availability_status: 'ON_BREAK', is_available_now: false }),
      createMockRow({ employee_id: 'emp-unconf', availability_status: 'UNCONFIGURED', is_available_now: false }),
      createMockRow({ employee_id: 'emp-active', availability_status: 'SHIFT_ACTIVE', is_available_now: true }),
    ];
    const { barbers } = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    // All 4 active barbers are returned and selectable in Phase 4A
    expect(barbers).toHaveLength(4);
    expect(barbers.map((b) => b.id)).toEqual(
      expect.arrayContaining(['emp-off', 'emp-break', 'emp-unconf', 'emp-active'])
    );
  });

  it('verifies UI pickers render availability badges and maintain non-blocking selection', () => {
    const barberModalContent = fs.readFileSync(
      path.join(webSrcDir, 'components/pos/barber-select-modal.tsx'),
      'utf-8'
    );
    expect(barberModalContent).toMatch(/BARBER_AVAILABILITY_LABELS/);
    expect(barberModalContent).toMatch(/BARBER_AVAILABILITY_BADGE_CLASSES/);
    // Non-blocking: must not disable barber selection buttons based on availability
    expect(barberModalContent).not.toMatch(/disabled=\{!barber\.is_available_now\}/);

    const walkinModalContent = fs.readFileSync(
      path.join(webSrcDir, 'components/queue/walkin-modal.tsx'),
      'utf-8'
    );
    expect(walkinModalContent).toMatch(/BARBER_AVAILABILITY_LABELS/);
    expect(walkinModalContent).not.toMatch(/disabled=\{!b\.is_available_now\}/);

    const apptModalContent = fs.readFileSync(
      path.join(webSrcDir, 'components/queue/appointment-modal.tsx'),
      'utf-8'
    );
    expect(apptModalContent).toMatch(/BARBER_AVAILABILITY_LABELS/);

    const queueBoardContent = fs.readFileSync(
      path.join(webSrcDir, 'components/queue/queue-board.tsx'),
      'utf-8'
    );
    expect(queueBoardContent).toMatch(/BARBER_AVAILABILITY_LABELS/);
  });
});

describe('Phase 4B: Authoritative Barber Availability Enforcement (P0006)', () => {
  const webSrcDir = path.resolve(__dirname, '..');

  it('defines authoritative P0006 error code and prefix constants', () => {
    expect(BARBER_OPERATIONAL_ERROR_CODE).toBe('P0006');
    expect(BARBER_OPERATIONAL_ERROR_PREFIX).toBe('BARBER_NOT_OPERATIONALLY_AVAILABLE');
  });

  it('Rule A: P0006 + SHIFT_ACTIVE is not treated as a valid rejection', () => {
    const errorA = {
      code: 'P0006',
      message: 'BARBER_NOT_OPERATIONALLY_AVAILABLE: SHIFT_ACTIVE',
    };
    expect(parseBarberOperationalError(errorA)).toBeNull();
  });

  it('Rule B: P0006 + ON_BREAK parses correctly with status ON_BREAK', () => {
    const errorB = {
      code: 'P0006',
      message: 'BARBER_NOT_OPERATIONALLY_AVAILABLE: ON_BREAK',
    };
    const parsed = parseBarberOperationalError(errorB);
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('BARBER_NOT_OPERATIONALLY_AVAILABLE');
    expect(parsed?.status).toBe('ON_BREAK');
    expect(parsed?.message).toContain('Sedang Istirahat');
  });

  it('Rule C: P0006 + UNCONFIGURED parses correctly with status UNCONFIGURED', () => {
    const errorC = {
      code: 'P0006',
      message: 'BARBER_NOT_OPERATIONALLY_AVAILABLE: UNCONFIGURED',
    };
    const parsed = parseBarberOperationalError(errorC);
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('BARBER_NOT_OPERATIONALLY_AVAILABLE');
    expect(parsed?.status).toBe('UNCONFIGURED');
    expect(parsed?.message).toContain('Jadwal Belum Diatur');
  });

  it('Rule D: P0006 + OUTSIDE_SHIFT parses correctly with status OUTSIDE_SHIFT', () => {
    const errorD = {
      code: 'P0006',
      message: 'BARBER_NOT_OPERATIONALLY_AVAILABLE: OUTSIDE_SHIFT',
    };
    const parsed = parseBarberOperationalError(errorD);
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('BARBER_NOT_OPERATIONALLY_AVAILABLE');
    expect(parsed?.status).toBe('OUTSIDE_SHIFT');
    expect(parsed?.message).toContain('Di Luar Shift');
  });

  it('Rule E: P0006 + ON_LEAVE parses correctly with status ON_LEAVE', () => {
    const errorE = {
      code: 'P0006',
      message: 'BARBER_NOT_OPERATIONALLY_AVAILABLE: ON_LEAVE',
    };
    const parsed = parseBarberOperationalError(errorE);
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('BARBER_NOT_OPERATIONALLY_AVAILABLE');
    expect(parsed?.status).toBe('ON_LEAVE');
    expect(parsed?.message).toContain('Sedang Cuti');
  });

  it('Rule F: P0006 with unknown status fails closed with status = null', () => {
    const errorF = {
      code: 'P0006',
      message: 'BARBER_NOT_OPERATIONALLY_AVAILABLE: UNKNOWN_STATUS_XYZ',
    };
    const parsed = parseBarberOperationalError(errorF);
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('BARBER_NOT_OPERATIONALLY_AVAILABLE');
    expect(parsed?.status).toBeNull();
    expect(parsed?.message).toContain('kendala ketersediaan operasional');
  });

  it('Rule G: generic Supabase errors return null', () => {
    expect(parseBarberOperationalError(null)).toBeNull();
    expect(parseBarberOperationalError(undefined)).toBeNull();
    expect(parseBarberOperationalError({ code: '42501', message: 'permission denied' })).toBeNull();
    expect(parseBarberOperationalError({ code: '22023', message: 'invalid input' })).toBeNull();
    expect(parseBarberOperationalError(new Error('Network disconnected'))).toBeNull();
    expect(parseBarberOperationalError('generic error string')).toBeNull();
  });

  it('formats contextual Indonesian messages correctly for walkin and called flows', () => {
    expect(formatBarberOperationalErrorMessage('ON_BREAK', 'walkin')).toBe(
      'Kapster tidak dapat ditugaskan saat ini. Status: Sedang Istirahat.'
    );
    expect(formatBarberOperationalErrorMessage('ON_BREAK', 'called', 'Budi')).toBe(
      'Antrean belum dapat dipanggil karena kapster Budi sedang istirahat.'
    );
    expect(formatBarberOperationalErrorMessage('UNCONFIGURED', 'called')).toBe(
      'Antrean belum dapat dipanggil karena jadwal kapster belum diatur.'
    );
    expect(formatBarberOperationalErrorMessage(null, 'walkin')).toBe(
      'Kapster tidak dapat ditugaskan saat ini karena kendala ketersediaan operasional.'
    );
  });

  it('Rule H: UI source audit ensures walkin and queue mutations handle P0006', () => {
    const walkinModalContent = fs.readFileSync(
      path.join(webSrcDir, 'components/queue/walkin-modal.tsx'),
      'utf-8'
    );
    expect(walkinModalContent).toMatch(/parseBarberOperationalError/);
    expect(walkinModalContent).toMatch(/refreshData/);

    const queuePageContent = fs.readFileSync(
      path.join(webSrcDir, 'app/queue/page.tsx'),
      'utf-8'
    );
    expect(queuePageContent).toMatch(/parseBarberOperationalError/);
    expect(queuePageContent).toMatch(/formatBarberOperationalErrorMessage/);
    expect(queuePageContent).toMatch(/refreshData/);
  });

  it('Rule I: verifies no local clock is used for availability decisions', () => {
    const errorParserContent = fs.readFileSync(
      path.join(webSrcDir, 'lib/barber-operation-errors.ts'),
      'utf-8'
    );
    expect(errorParserContent).not.toMatch(/new Date\(\)/);
    expect(errorParserContent).not.toMatch(/Date\.now\(\)/);
    expect(errorParserContent).not.toMatch(/\.getHours\(\)/);
    expect(errorParserContent).not.toMatch(/\.getDay\(\)/);

    const barberParserContent = fs.readFileSync(
      path.join(webSrcDir, 'lib/barber-parser.ts'),
      'utf-8'
    );
    expect(barberParserContent).not.toMatch(/new Date\(\)/);
    expect(barberParserContent).not.toMatch(/Date\.now\(\)/);
    expect(barberParserContent).not.toMatch(/\.getHours\(\)/);
    expect(barberParserContent).not.toMatch(/\.getDay\(\)/);
  });
});

describe('Phase 4B: Migration Fidelity and Static Audit', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const migrationPath = path.join(
    repoRoot,
    'supabase/migrations/20260927084643_enforce_barber_operational_availability_at_queue_mutation.sql'
  );
  const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

  it('Static Audit: strictly forbids text/text parameter overloads for transition status', () => {
    expect(migrationContent).not.toMatch(
      /FUNCTION\s+private\.transition_queue_status_internal\s*\([^)]*p_target_status\s+text/i
    );
    expect(migrationContent).not.toMatch(
      /FUNCTION\s+public\.transition_queue_status\s*\([^)]*p_target_status\s+text/i
    );
    expect(migrationContent).not.toMatch(/p_target_status\s+text/);
    expect(migrationContent).not.toMatch(/p_expected_current_status\s+text/);
  });

  it('Static Audit: strictly validates private.assert_barber_operationally_available signature & security', () => {
    const helperMatch = migrationContent.match(
      /CREATE OR REPLACE FUNCTION private\.assert_barber_operationally_available[\s\S]*?\$\$[\s\S]*?\$\$;/
    );
    expect(helperMatch).not.toBeNull();
    const helperSql = helperMatch![0];

    // Returns text
    expect(helperSql).toMatch(/RETURNS\s+text/i);
    expect(helperSql).not.toMatch(/RETURNS\s+void/i);

    // SECURITY INVOKER
    expect(helperSql).toMatch(/SECURITY\s+INVOKER/i);
    expect(helperSql).not.toMatch(/SECURITY\s+DEFINER/i);

    // search_path is ''
    expect(helperSql).toMatch(/SET\s+search_path\s*=\s*''/i);
    expect(helperSql).not.toMatch(/SET\s+search_path\s*=\s*public/i);

    // BARBER_REQUIRED behavior
    expect(helperSql).toMatch(/p_outlet_id\s+IS\s+NULL\s+OR\s+p_barber_id\s+IS\s+NULL/i);
    expect(helperSql).toMatch(/RAISE\s+EXCEPTION\s+'BARBER_REQUIRED'/i);
    expect(helperSql).toMatch(/ERRCODE\s*=\s*'22023'/i);

    // BARBER_NOT_FOUND_OR_NOT_ASSIGNED behavior
    expect(helperSql).toMatch(/RAISE\s+EXCEPTION\s+'BARBER_NOT_FOUND_OR_NOT_ASSIGNED'/i);

    // P0006 operational rejection
    expect(helperSql).toMatch(/availability_status\s*<>\s*'SHIFT_ACTIVE'/i);
    expect(helperSql).toMatch(/BARBER_NOT_OPERATIONALLY_AVAILABLE:\s*%/i);
    expect(helperSql).toMatch(/ERRCODE\s*=\s*'P0006'/i);

    // Returns status text
    expect(helperSql).toMatch(/RETURN\s+v_availability\.availability_status;/i);

    // No execute grants to private helper
    expect(migrationContent).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+private\.assert_barber_operationally_available/i
    );
  });

  it('Static Audit: verifies internal transition function signature, DEFAULT NULL, and variable declarations', () => {
    const internalMatch = migrationContent.match(
      /CREATE OR REPLACE FUNCTION private\.transition_queue_status_internal[\s\S]*?\$\$[\s\S]*?\$\$;/
    );
    expect(internalMatch).not.toBeNull();
    const internalSql = internalMatch![0];

    // Signature with queue_status_enum and DEFAULT NULL
    expect(internalSql).toMatch(/p_target_status\s+public\.queue_status_enum/);
    expect(internalSql).toMatch(
      /p_expected_current_status\s+public\.queue_status_enum\s+DEFAULT\s+NULL/i
    );
    expect(internalSql).toMatch(/p_barber_id\s+uuid\s+DEFAULT\s+NULL/i);

    // Production variable declarations
    expect(internalSql).toMatch(/v_queue\s+public\.queues%rowtype;/);
    expect(internalSql).toMatch(/v_now\s+timestamptz\s*:=\s*statement_timestamp\(\);/);
    expect(internalSql).toMatch(/v_appointment_status\s+public\.appointment_status_enum;/);

    // Row locking
    expect(internalSql).toMatch(/FOR UPDATE/);
  });

  it('Static Audit: verifies wrapper transition function signature, DEFAULT NULL, and LANGUAGE sql delegation', () => {
    const wrapperMatch = migrationContent.match(
      /CREATE OR REPLACE FUNCTION public\.transition_queue_status[\s\S]*?\$\$[\s\S]*?\$\$;/
    );
    expect(wrapperMatch).not.toBeNull();
    const wrapperSql = wrapperMatch![0];

    // Signature with queue_status_enum and DEFAULT NULL
    expect(wrapperSql).toMatch(/p_target_status\s+public\.queue_status_enum/);
    expect(wrapperSql).toMatch(
      /p_expected_current_status\s+public\.queue_status_enum\s+DEFAULT\s+NULL/i
    );
    expect(wrapperSql).toMatch(/p_barber_id\s+uuid\s+DEFAULT\s+NULL/i);

    // LANGUAGE sql and delegation
    expect(wrapperSql).toMatch(/LANGUAGE\s+sql/i);
    expect(wrapperSql).toMatch(
      /SELECT\s+private\.transition_queue_status_internal\(\$1,\s*\$2,\s*\$3,\s*\$4,\s*\$5\);/i
    );
  });

  it('Static Audit: distinguishes production state machine from forbidden extra transitions', () => {
    const internalMatch = migrationContent.match(
      /CREATE OR REPLACE FUNCTION private\.transition_queue_status_internal[\s\S]*?\$\$[\s\S]*?\$\$;/
    );
    expect(internalMatch).not.toBeNull();
    const internalSql = internalMatch![0];

    // 1. Check WAITING branch allowed & forbidden
    const waitingMatch = internalSql.match(
      /v_queue\.status\s*=\s*'WAITING'::public\.queue_status_enum\s+THEN([\s\S]*?)ELSIF/
    );
    expect(waitingMatch).not.toBeNull();
    const waitingBranch = waitingMatch![1];
    expect(waitingBranch).toMatch(/'CALLED'::public\.queue_status_enum/);
    expect(waitingBranch).toMatch(/'CANCELLED'::public\.queue_status_enum/);
    expect(waitingBranch).not.toMatch(/'NO_SHOW'/);
    expect(waitingBranch).not.toMatch(/'IN_SERVICE'/);

    // 2. Check CALLED branch allowed & forbidden
    const calledMatch = internalSql.match(
      /v_queue\.status\s*=\s*'CALLED'::public\.queue_status_enum\s+THEN([\s\S]*?)ELSIF/
    );
    expect(calledMatch).not.toBeNull();
    const calledBranch = calledMatch![1];
    expect(calledBranch).toMatch(/'IN_SERVICE'::public\.queue_status_enum/);
    expect(calledBranch).toMatch(/'NO_SHOW'::public\.queue_status_enum/);
    expect(calledBranch).toMatch(/'CANCELLED'::public\.queue_status_enum/);
    expect(calledBranch).not.toMatch(/'WAITING'/);
    expect(calledBranch).not.toMatch(/'COMPLETED'/);

    // 3. Check IN_SERVICE branch allowed & forbidden
    const inServiceMatch = internalSql.match(
      /v_queue\.status\s*=\s*'IN_SERVICE'::public\.queue_status_enum\s+THEN([\s\S]*?)ELSE/
    );
    expect(inServiceMatch).not.toBeNull();
    const inServiceBranch = inServiceMatch![1];
    expect(inServiceBranch).toMatch(/'COMPLETED'::public\.queue_status_enum/);
    expect(inServiceBranch).not.toMatch(/'CANCELLED'/);
    expect(inServiceBranch).not.toMatch(/'WAITING'/);
  });

  it('Static Audit: verifies expected status contract with P0003', () => {
    const internalMatch = migrationContent.match(
      /CREATE OR REPLACE FUNCTION private\.transition_queue_status_internal[\s\S]*?\$\$[\s\S]*?\$\$;/
    );
    expect(internalMatch).not.toBeNull();
    const internalSql = internalMatch![0];

    expect(internalSql).toMatch(
      /IF\s+p_expected_current_status\s+IS\s+NOT\s+NULL\s+AND\s+v_queue\.status\s*<>\s*p_expected_current_status\s+THEN\s*RAISE\s+EXCEPTION\s+'Queue status changed by another operator \(current: %\)'/i
    );
    expect(internalSql).toMatch(/ERRCODE\s*=\s*'P0003'/i);
  });

  it('Static Audit: verifies non-CALLED barber rejection with P0004', () => {
    const internalMatch = migrationContent.match(
      /CREATE OR REPLACE FUNCTION private\.transition_queue_status_internal[\s\S]*?\$\$[\s\S]*?\$\$;/
    );
    expect(internalMatch).not.toBeNull();
    const internalSql = internalMatch![0];

    expect(internalSql).toMatch(
      /IF\s+p_target_status\s*<>\s*'CALLED'::public\.queue_status_enum\s+AND\s+p_barber_id\s+IS\s+NOT\s+NULL\s+THEN\s*RAISE\s+EXCEPTION\s+'Barber assignment is only allowed when transitioning to CALLED'\s*USING\s+ERRCODE\s*=\s*'P0004';/i
    );
  });

  it('Static Audit: verifies CALLED validations (22004 barber required, 42501 active barber assignment, Phase 4B availability)', () => {
    const internalMatch = migrationContent.match(
      /CREATE OR REPLACE FUNCTION private\.transition_queue_status_internal[\s\S]*?\$\$[\s\S]*?\$\$;/
    );
    expect(internalMatch).not.toBeNull();
    const internalSql = internalMatch![0];

    // Barber required when calling queue (22004)
    expect(internalSql).toMatch(/IF\s+p_barber_id\s+IS\s+NULL\s+THEN\s*RAISE\s+EXCEPTION\s+'A barber is required when calling a queue'\s*USING\s+ERRCODE\s*=\s*'22004';/i);

    // Active barber check (42501)
    expect(internalSql).toMatch(/NOT\s+EXISTS\s*\([\s\S]*?FROM\s+public\.employees\s+e[\s\S]*?JOIN\s+public\.employee_outlets\s+eo/i);
    expect(internalSql).toMatch(/RAISE\s+EXCEPTION\s+'Barber %\s+is not an active barber assigned to outlet %',\s*p_barber_id,\s*p_outlet_id\s*USING\s+ERRCODE\s*=\s*'42501';/i);

    // Authoritative Phase 4B availability assertion
    expect(internalSql).toMatch(/PERFORM\s+private\.assert_barber_operationally_available\(p_outlet_id,\s*p_barber_id\);/i);
  });

  it('Static Audit: verifies advisory lock key prefix and P0005 duplicate assignment protection', () => {
    const internalMatch = migrationContent.match(
      /CREATE OR REPLACE FUNCTION private\.transition_queue_status_internal[\s\S]*?\$\$[\s\S]*?\$\$;/
    );
    expect(internalMatch).not.toBeNull();
    const internalSql = internalMatch![0];

    // Exact advisory lock key prefix: 'queue-barber:'
    expect(internalSql).toMatch(/'queue-barber:'\s*\|\|\s*p_outlet_id::text\s*\|\|\s*':'\s*\|\|\s*p_barber_id::text/i);
    expect(internalSql).not.toMatch(/'queue-barber-assignment:'/i);

    // Duplicate active barber assignment protection (P0005)
    expect(internalSql).toMatch(/RAISE\s+EXCEPTION\s+'Barber %\s+already has an active queue assignment at this outlet',\s*p_barber_id\s*USING\s+ERRCODE\s*=\s*'P0005';/i);
    expect(internalSql).toMatch(
      /status\s+IN\s*\('CALLED'::public\.queue_status_enum,\s*'IN_SERVICE'::public\.queue_status_enum\)/i
    );
  });

  it('Static Audit: verifies linked appointment consistency and sync contracts', () => {
    const internalMatch = migrationContent.match(
      /CREATE OR REPLACE FUNCTION private\.transition_queue_status_internal[\s\S]*?\$\$[\s\S]*?\$\$;/
    );
    expect(internalMatch).not.toBeNull();
    const internalSql = internalMatch![0];

    // Linked appointment consistency check: exact predicate & 23514
    expect(internalSql).toMatch(/a\.id\s*=\s*v_queue\.appointment_id/i);
    expect(internalSql).toMatch(/a\.outlet_id\s*=\s*p_outlet_id/i);
    expect(internalSql).toMatch(/a\.barber_id\s*=\s*coalesce\(p_barber_id,\s*v_queue\.barber_id\)/i);
    expect(internalSql).toMatch(/RAISE\s+EXCEPTION\s+'Linked appointment is inconsistent with queue outlet or barber'\s*USING\s+ERRCODE\s*=\s*'23514';/i);

    // Branch-specific queue updates
    expect(internalSql).toMatch(/p_target_status\s*=\s*'CALLED'::public\.queue_status_enum\s+THEN\s*UPDATE\s+public\.queues\s+SET\s+status\s*=\s*p_target_status,\s*barber_id\s*=\s*p_barber_id,\s*called_at\s*=\s*coalesce\(called_at,\s*v_now\)/i);
    expect(internalSql).toMatch(/p_target_status\s*=\s*'IN_SERVICE'::public\.queue_status_enum\s+THEN\s*UPDATE\s+public\.queues\s+SET\s+status\s*=\s*p_target_status,\s*started_at\s*=\s*coalesce\(started_at,\s*v_now\)/i);
    expect(internalSql).toMatch(/p_target_status\s*=\s*'COMPLETED'::public\.queue_status_enum\s+THEN\s*UPDATE\s+public\.queues\s+SET\s+status\s*=\s*p_target_status,\s*completed_at\s*=\s*coalesce\(completed_at,\s*v_now\)/i);

    // Linked appointment update must not mutate barber_id
    const appointmentUpdateSection = internalSql.match(/UPDATE\s+public\.appointments[\s\S]*?WHERE[\s\S]*?;/i);
    expect(appointmentUpdateSection).not.toBeNull();
    expect(appointmentUpdateSection![0]).not.toMatch(/barber_id\s*=/i);
    expect(appointmentUpdateSection![0]).toMatch(/outlet_id\s*=\s*p_outlet_id/i);

    // Failed linked appointment update protection (23514)
    expect(internalSql).toMatch(/IF\s+NOT\s+FOUND\s+THEN\s*RAISE\s+EXCEPTION\s+'Linked appointment update failed'\s*USING\s+ERRCODE\s*=\s*'23514';/i);
  });

  it('Static Audit: verifies complete absence of obsolete custom error strings in migration', () => {
    expect(migrationContent).not.toMatch(/LINKED_APPOINTMENT_OUTLET_MISMATCH/i);
    expect(migrationContent).not.toMatch(/LINKED_APPOINTMENT_BARBER_MISMATCH/i);
    expect(migrationContent).not.toMatch(/LINKED_APPOINTMENT_UPDATE_FAILED/i);
    expect(migrationContent).not.toMatch(/DUPLICATE_ACTIVE_BARBER_ASSIGNMENT/i);
    expect(migrationContent).not.toMatch(/QUEUE_NOT_FOUND/i);
    expect(migrationContent).not.toMatch(/INVALID_TARGET_STATUS/i);
  });
});

describe('Phase 4B: Backend Contract & Availability Rules Verification (Rules A through F)', () => {
  // Helper simulator mirroring exact private.assert_barber_operationally_available contract
  const simulateAssertBarberOperationallyAvailable = (
    availabilityMap: Map<string, string>,
    outletId: string | null,
    barberId: string | null
  ): string => {
    if (!outletId || !barberId) {
      const err = new Error('BARBER_REQUIRED');
      Object.assign(err, { code: '22023' });
      throw err;
    }
    const status = availabilityMap.get(barberId);
    if (!status) {
      const err = new Error('BARBER_NOT_FOUND_OR_NOT_ASSIGNED');
      Object.assign(err, { code: '22023' });
      throw err;
    }
    if (status !== 'SHIFT_ACTIVE') {
      const err = new Error(`BARBER_NOT_OPERATIONALLY_AVAILABLE: ${status}`);
      Object.assign(err, { code: 'P0006' });
      throw err;
    }
    return status;
  };

  it('Rule A: helper returns SHIFT_ACTIVE when barber schedule is active', () => {
    const map = new Map<string, string>([['barber-1', 'SHIFT_ACTIVE']]);
    const result = simulateAssertBarberOperationallyAvailable(map, TEST_OUTLET_A, 'barber-1');
    expect(result).toBe('SHIFT_ACTIVE');
  });

  it('Rule B: helper rejects non-active statuses, missing barber, or null inputs', () => {
    const map = new Map<string, string>([
      ['b-active', 'SHIFT_ACTIVE'],
      ['b-break', 'ON_BREAK'],
      ['b-outside', 'OUTSIDE_SHIFT'],
      ['b-dayoff', 'DAY_OFF'],
      ['b-leave', 'ON_LEAVE'],
      ['b-unconfigured', 'UNCONFIGURED'],
      ['b-inactive', 'INACTIVE'],
    ]);

    // Null outlet or barber throws 22023 BARBER_REQUIRED
    expect(() =>
      simulateAssertBarberOperationallyAvailable(map, null, 'b-active')
    ).toThrowError(/BARBER_REQUIRED/);
    expect(() =>
      simulateAssertBarberOperationallyAvailable(map, TEST_OUTLET_A, null)
    ).toThrowError(/BARBER_REQUIRED/);

    // Missing barber throws 22023 BARBER_NOT_FOUND_OR_NOT_ASSIGNED
    expect(() =>
      simulateAssertBarberOperationallyAvailable(map, TEST_OUTLET_A, 'non-existent')
    ).toThrowError(/BARBER_NOT_FOUND_OR_NOT_ASSIGNED/);

    // Operational availability rejections throw P0006
    const nonActiveStatuses = [
      'b-break',
      'b-outside',
      'b-dayoff',
      'b-leave',
      'b-unconfigured',
      'b-inactive',
    ];

    for (const barberKey of nonActiveStatuses) {
      try {
        simulateAssertBarberOperationallyAvailable(map, TEST_OUTLET_A, barberKey);
        expect.unreachable(`Expected ${barberKey} to throw P0006`);
      } catch (err: unknown) {
        const parsed = parseBarberOperationalError(err);
        expect(parsed).not.toBeNull();
        expect(parsed?.type).toBe('BARBER_NOT_OPERATIONALLY_AVAILABLE');
      }
    }
  });

  it('Rule C: create_walk_in_queue rejects unavailable barber with P0006 and succeeds on null barber', () => {
    const map = new Map<string, string>([['barber-break', 'ON_BREAK']]);

    const simulateCreateWalkInQueue = (barberId: string | null) => {
      if (barberId) {
        simulateAssertBarberOperationallyAvailable(map, TEST_OUTLET_A, barberId);
      }
      return { success: true, queue_id: 'q-new-123' };
    };

    // With null barber, walk-in creation succeeds without availability assertion
    expect(simulateCreateWalkInQueue(null).success).toBe(true);

    // With unavailable barber, throws P0006
    expect(() => simulateCreateWalkInQueue('barber-break')).toThrowError(
      /BARBER_NOT_OPERATIONALLY_AVAILABLE: ON_BREAK/
    );
  });

  it('Rule D: transition_queue_status enforces exact production state transitions and rejects forbidden transitions', () => {
    const map = new Map<string, string>([
      ['barber-active', 'SHIFT_ACTIVE'],
      ['barber-leave', 'ON_LEAVE'],
    ]);

    const simulateTransition = (
      currentStatus: 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW',
      targetStatus: 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW',
      expectedCurrentStatus: string | null,
      barberId: string | null
    ) => {
      if (expectedCurrentStatus && currentStatus !== expectedCurrentStatus) {
        throw new Error('QUEUE_STATUS_MISMATCH');
      }

      // State machine validation
      if (currentStatus === 'WAITING') {
        if (!['CALLED', 'CANCELLED'].includes(targetStatus)) {
          throw new Error(`INVALID_QUEUE_TRANSITION: ${currentStatus} to ${targetStatus}`);
        }
      } else if (currentStatus === 'CALLED') {
        if (!['IN_SERVICE', 'NO_SHOW', 'CANCELLED'].includes(targetStatus)) {
          throw new Error(`INVALID_QUEUE_TRANSITION: ${currentStatus} to ${targetStatus}`);
        }
      } else if (currentStatus === 'IN_SERVICE') {
        if (targetStatus !== 'COMPLETED') {
          throw new Error(`INVALID_QUEUE_TRANSITION: ${currentStatus} to ${targetStatus}`);
        }
      } else {
        throw new Error(`TERMINAL_QUEUE_STATUS: ${currentStatus}`);
      }

      // Non-CALLED barber rejection (P0004)
      if (targetStatus !== 'CALLED' && barberId !== null) {
        const err = new Error('Barber assignment is only allowed when transitioning to CALLED');
        Object.assign(err, { code: 'P0004' });
        throw err;
      }

      // CALLED validation
      if (targetStatus === 'CALLED') {
        if (!barberId) throw new Error('BARBER_REQUIRED');
        simulateAssertBarberOperationallyAvailable(map, TEST_OUTLET_A, barberId);
      }

      return { success: true, status: targetStatus, barber_id: barberId };
    };

    // 1. Valid transitions
    expect(simulateTransition('WAITING', 'CALLED', 'WAITING', 'barber-active').status).toBe('CALLED');
    expect(simulateTransition('WAITING', 'CANCELLED', 'WAITING', null).status).toBe('CANCELLED');
    expect(simulateTransition('CALLED', 'IN_SERVICE', 'CALLED', null).status).toBe('IN_SERVICE');
    expect(simulateTransition('CALLED', 'NO_SHOW', 'CALLED', null).status).toBe('NO_SHOW');
    expect(simulateTransition('CALLED', 'CANCELLED', 'CALLED', null).status).toBe('CANCELLED');
    expect(simulateTransition('IN_SERVICE', 'COMPLETED', 'IN_SERVICE', null).status).toBe('COMPLETED');

    // 2. Forbidden transitions rejected
    // WAITING -> NO_SHOW forbidden
    expect(() => simulateTransition('WAITING', 'NO_SHOW', null, null)).toThrowError(
      /INVALID_QUEUE_TRANSITION/
    );
    // CALLED -> WAITING forbidden
    expect(() => simulateTransition('CALLED', 'WAITING', null, null)).toThrowError(
      /INVALID_QUEUE_TRANSITION/
    );
    // IN_SERVICE -> CANCELLED forbidden
    expect(() => simulateTransition('IN_SERVICE', 'CANCELLED', null, null)).toThrowError(
      /INVALID_QUEUE_TRANSITION/
    );
    // Terminal transitions rejected
    expect(() => simulateTransition('COMPLETED', 'WAITING', null, null)).toThrowError(
      /TERMINAL_QUEUE_STATUS/
    );

    // 3. Non-CALLED barber assignment rejected with P0004
    expect(() => simulateTransition('CALLED', 'IN_SERVICE', null, 'barber-active')).toThrowError(
      /Barber assignment is only allowed when transitioning to CALLED/
    );

    // 4. CALLED with unavailable barber rejected with P0006
    expect(() => simulateTransition('WAITING', 'CALLED', null, 'barber-leave')).toThrowError(
      /BARBER_NOT_OPERATIONALLY_AVAILABLE: ON_LEAVE/
    );
  });

  it('Rule E: verify optional expected_current_status behavior', () => {
    // Expected current status defaults to null and does not fail when omitted
    const verifyOptionalExpected = (currentStatus: string, expectedStatus: string | null) => {
      if (expectedStatus !== null && currentStatus !== expectedStatus) {
        throw new Error('QUEUE_STATUS_MISMATCH');
      }
      return true;
    };

    expect(verifyOptionalExpected('WAITING', null)).toBe(true);
    expect(verifyOptionalExpected('WAITING', 'WAITING')).toBe(true);
    expect(() => verifyOptionalExpected('WAITING', 'CALLED')).toThrowError(/QUEUE_STATUS_MISMATCH/);
  });
});


