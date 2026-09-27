/**
 * Verification Test Suite for Web Barber Operational Availability (Phase 4A)
 * Covers:
 * - Contract & Enum Validation
 * - Scenario A: Budi & Rian = UNCONFIGURED
 * - Scenario B: All 7 Availability Statuses (A through G)
 * - Scenario C: Fail-Closed Enforcement (H through L)
 * - Scenario D: Outlet Isolation & Switching
 * - Scenario E: Zero Device Clock Dependency
 * - Scenario F: Static Codebase Audit (No duplicate queries, non-blocking picker)
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
} from '../apps/web/src/types/barber-availability';
import { parseAuthoritativeBarbers } from '../apps/web/src/lib/barber-parser';

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
    is_primary_outlet: true,
    schedule_configured: true,
    today_schedule_active: true,
    shift_start: '09:00:00',
    shift_end: '18:00:00',
    break_start: '12:00:00',
    break_end: '13:00:00',
    is_on_leave: false,
    leave_type: null,
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
        is_on_leave: false,
        leave_type: null,
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
        is_on_leave: false,
        leave_type: null,
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
        is_on_leave: true,
        leave_type: 'ANNUAL',
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

describe('Scenario C: Fail Closed Rules (H through L)', () => {
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
    const raw = [
      createMockRow({ availability_status: 'UNKNOWN_STATUS' as any }),
    ];
    const result = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    expect(result.barbers).toEqual([]);
    expect(result.error).toContain('di luar kontrak');
  });

  it('Rule M: fails closed on missing operational metadata (observed_at, local_date, etc.)', () => {
    const missingMetadata1 = [createMockRow({ observed_at: null as any })];
    expect(parseAuthoritativeBarbers(missingMetadata1, TEST_OUTLET_A).barbers).toEqual([]);
    expect(parseAuthoritativeBarbers(missingMetadata1, TEST_OUTLET_A).error).toContain('metadata');

    const missingMetadata2 = [createMockRow({ local_date: null as any })];
    expect(parseAuthoritativeBarbers(missingMetadata2, TEST_OUTLET_A).barbers).toEqual([]);

    const missingMetadata3 = [createMockRow({ outlet_timezone: null as any })];
    expect(parseAuthoritativeBarbers(missingMetadata3, TEST_OUTLET_A).barbers).toEqual([]);
  });

  it('Rule N: fails closed on missing employee_id', () => {
    const raw = [createMockRow({ employee_id: '' as any })];
    const result = parseAuthoritativeBarbers(raw, TEST_OUTLET_A);
    expect(result.barbers).toEqual([]);
    expect(result.error).toContain('employee_id wajib ada');
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
});

describe('Scenario F: Static Codebase Audit (No Duplicate Queries & Single Source of Truth)', () => {
  const webSrcDir = path.resolve(__dirname, '../apps/web/src');

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

  it('verifies UI pickers render availability badges and maintain non-blocking selection', () => {
    const barberModalContent = fs.readFileSync(
      path.join(webSrcDir, 'components/pos/barber-select-modal.tsx'),
      'utf-8'
    );
    expect(barberModalContent).toMatch(/BARBER_AVAILABILITY_LABELS/);
    expect(barberModalContent).toMatch(/BARBER_AVAILABILITY_BADGE_CLASSES/);
    // Non-blocking: should not disable barber selection buttons based on availability
    expect(barberModalContent).not.toMatch(/disabled=\{!barber\.is_available_now\}/);

    const walkinModalContent = fs.readFileSync(
      path.join(webSrcDir, 'components/queue/walkin-modal.tsx'),
      'utf-8'
    );
    expect(walkinModalContent).toMatch(/BARBER_AVAILABILITY_LABELS/);

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
