/**
 * Phase 4E — Web Appointment Check-In Barber Availability Parity Verification Suite
 *
 * Validates the 24 authoritative requirements (A through X) and static source assertions:
 * A. ON_LEAVE maps correctly
 * B. ON_BREAK maps correctly
 * C. OUTSIDE_SHIFT maps correctly
 * D. DAY_OFF maps correctly
 * E. UNCONFIGURED maps correctly
 * F. INACTIVE maps correctly
 * G. unknown availability status maps to generic safe message
 * H. RPC error produces failure state, never success
 * I. missing queue_id fails closed
 * J. empty queue_id fails closed
 * K. invalid queue_number fails closed
 * L. zero queue_number fails closed
 * M. negative queue_number fails closed
 * N. floating queue_number fails closed
 * O. malformed joined_at fails closed
 * P. missing joined_at fails closed
 * Q. non-WAITING status fails closed
 * R. appointment_id mismatch fails closed
 * S. malformed appointment_id fails closed
 * T. successful response preserves authoritative joined_at
 * U. successful response preserves authoritative queue number
 * V. successful response preserves authoritative queue id
 * W. raw BARBER_NOT_OPERATIONALLY_AVAILABLE never reaches UI feedback
 * X. service prefill only occurs after successful validation
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  parseBarberOperationalError,
  formatBarberOperationalErrorMessage,
} from '../lib/barber-operation-errors';
import {
  validateCheckInResponse,
  mapAppointmentCheckInError,
  type ValidatedCheckInData,
} from '../lib/appointment-checkin-validator';

describe('Phase 4E — Web Appointment Check-In Barber Availability Parity (Requirements A-X)', () => {
  // A. ON_LEAVE maps correctly
  it('A. ON_LEAVE maps correctly — contextual message indicating barber is on leave', () => {
    const rawError = 'BARBER_NOT_OPERATIONALLY_AVAILABLE: ON_LEAVE';
    const parsed = parseBarberOperationalError(rawError);
    expect(parsed).not.toBeNull();
    expect(parsed?.status).toBe('ON_LEAVE');

    const msgWithBarber = formatBarberOperationalErrorMessage(parsed?.status ?? null, 'called', 'Budi');
    expect(msgWithBarber).toContain('Budi');
    expect(msgWithBarber).toContain('cuti');
    expect(msgWithBarber).not.toContain('BARBER_NOT_OPERATIONALLY_AVAILABLE');

    const msgWithoutBarber = formatBarberOperationalErrorMessage(parsed?.status ?? null, 'called', null);
    expect(msgWithoutBarber).toContain('cuti');
  });

  // B. ON_BREAK maps correctly
  it('B. ON_BREAK maps correctly — contextual message indicating barber is on break', () => {
    const rawError = 'BARBER_NOT_OPERATIONALLY_AVAILABLE: ON_BREAK';
    const parsed = parseBarberOperationalError(rawError);
    expect(parsed).not.toBeNull();
    expect(parsed?.status).toBe('ON_BREAK');

    const msgWithBarber = formatBarberOperationalErrorMessage(parsed?.status ?? null, 'called', 'Rian');
    expect(msgWithBarber).toContain('Rian');
    expect(msgWithBarber).toContain('istirahat');
    expect(msgWithBarber).not.toContain('BARBER_NOT_OPERATIONALLY_AVAILABLE');
  });

  // C. OUTSIDE_SHIFT maps correctly
  it('C. OUTSIDE_SHIFT maps correctly — contextual message indicating barber is outside shift', () => {
    const rawError = 'BARBER_NOT_OPERATIONALLY_AVAILABLE: OUTSIDE_SHIFT';
    const parsed = parseBarberOperationalError(rawError);
    expect(parsed).not.toBeNull();
    expect(parsed?.status).toBe('OUTSIDE_SHIFT');

    const msgWithBarber = formatBarberOperationalErrorMessage(parsed?.status ?? null, 'called', 'Budi');
    expect(msgWithBarber).toContain('di luar shift');
    expect(msgWithBarber).not.toContain('BARBER_NOT_OPERATIONALLY_AVAILABLE');
  });

  // D. DAY_OFF maps correctly
  it('D. DAY_OFF maps correctly — contextual message indicating barber is on day off', () => {
    const rawError = 'BARBER_NOT_OPERATIONALLY_AVAILABLE: DAY_OFF';
    const parsed = parseBarberOperationalError(rawError);
    expect(parsed).not.toBeNull();
    expect(parsed?.status).toBe('DAY_OFF');

    const msgWithBarber = formatBarberOperationalErrorMessage(parsed?.status ?? null, 'called', 'Budi');
    expect(msgWithBarber).toContain('hari libur');
    expect(msgWithBarber).not.toContain('BARBER_NOT_OPERATIONALLY_AVAILABLE');
  });

  // E. UNCONFIGURED maps correctly
  it('E. UNCONFIGURED maps correctly — contextual message indicating barber schedule is not configured', () => {
    const rawError = 'BARBER_NOT_OPERATIONALLY_AVAILABLE: UNCONFIGURED';
    const parsed = parseBarberOperationalError(rawError);
    expect(parsed).not.toBeNull();
    expect(parsed?.status).toBe('UNCONFIGURED');

    const msgWithBarber = formatBarberOperationalErrorMessage(parsed?.status ?? null, 'called', 'Budi');
    expect(msgWithBarber).toContain('belum diatur');
    expect(msgWithBarber).not.toContain('BARBER_NOT_OPERATIONALLY_AVAILABLE');
  });

  // F. INACTIVE maps correctly
  it('F. INACTIVE maps correctly — contextual message indicating barber is inactive', () => {
    const rawError = 'BARBER_NOT_OPERATIONALLY_AVAILABLE: INACTIVE';
    const parsed = parseBarberOperationalError(rawError);
    expect(parsed).not.toBeNull();
    expect(parsed?.status).toBe('INACTIVE');

    const msgWithBarber = formatBarberOperationalErrorMessage(parsed?.status ?? null, 'called', 'Budi');
    expect(msgWithBarber).toContain('nonaktif');
    expect(msgWithBarber).not.toContain('BARBER_NOT_OPERATIONALLY_AVAILABLE');
  });

  // G. unknown availability status maps to generic safe message
  it('G. unknown availability status maps to generic safe message', () => {
    const rawError = 'BARBER_NOT_OPERATIONALLY_AVAILABLE: SUSPENDED';
    const parsed = parseBarberOperationalError(rawError);
    expect(parsed).not.toBeNull();
    expect(parsed?.status).toBeNull(); // Fails closed for unknown status

    const msg = formatBarberOperationalErrorMessage(parsed?.status ?? null, 'called', 'Budi');
    expect(msg).toContain('tidak tersedia secara operasional');
    expect(msg).not.toContain('SUSPENDED');
    expect(msg).not.toContain('BARBER_NOT_OPERATIONALLY_AVAILABLE');

    const genericCheckInMapped = mapAppointmentCheckInError('BARBER_NOT_OPERATIONALLY_AVAILABLE: UNKNOWN');
    expect(genericCheckInMapped).toBe('Kapster tidak tersedia secara operasional saat ini.');
  });

  // H. RPC error produces failure state, never success
  it('H. RPC error produces failure state, never success — static and structural assertion', () => {
    const pageContent = fs.readFileSync(
      path.resolve(__dirname, '../app/queue/page.tsx'),
      'utf8'
    );

    // Verify handleCheckInToQueue handles error branch before any success state
    expect(pageContent).toContain("supabase.rpc('check_in_appointment_to_queue'");
    expect(pageContent).toContain('if (error) {');

    // Verify that inside if (error), return is always called after setting error feedback
    const checkInFnMatch = pageContent.match(
      /const handleCheckInToQueue = async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {2}\};/
    );
    expect(checkInFnMatch).not.toBeNull();
    const fnBody = checkInFnMatch![1]!;

    expect(fnBody).toContain('if (error) {');
    // Ensure success feedback is NOT inside the error block
    const errorBlock = fnBody.slice(fnBody.indexOf('if (error) {'), fnBody.indexOf('let parsedPayload'));
    expect(errorBlock).toContain("type: 'error'");
    expect(errorBlock).not.toContain("type: 'success'");
    expect(errorBlock).toContain('return;');
  });

  // Base valid payload fixture
  const baseValidPayload = {
    queue_id: 'q-uuid-001',
    queue_number: 15,
    appointment_id: 'apt-uuid-001',
    appointment_number: 'APT-001',
    status: 'WAITING',
    joined_at: '2026-09-28T10:15:30.000Z',
  };

  // I. missing queue_id fails closed
  it('I. missing queue_id fails closed', () => {
    const res = validateCheckInResponse(
      { ...baseValidPayload, queue_id: undefined },
      'apt-uuid-001'
    );
    expect(res.valid).toBe(false);
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/ID antrean/i);
  });

  // J. empty queue_id fails closed
  it('J. empty queue_id fails closed', () => {
    const resEmpty = validateCheckInResponse(
      { ...baseValidPayload, queue_id: '' },
      'apt-uuid-001'
    );
    expect(resEmpty.valid).toBe(false);
    expect(resEmpty.data).toBeNull();

    const resWhitespace = validateCheckInResponse(
      { ...baseValidPayload, queue_id: '   ' },
      'apt-uuid-001'
    );
    expect(resWhitespace.valid).toBe(false);
    expect(resWhitespace.data).toBeNull();
  });

  // K. invalid queue_number fails closed
  it('K. invalid queue_number fails closed', () => {
    const resUndefined = validateCheckInResponse(
      { ...baseValidPayload, queue_number: undefined },
      'apt-uuid-001'
    );
    expect(resUndefined.valid).toBe(false);
    expect(resUndefined.data).toBeNull();

    const resNull = validateCheckInResponse(
      { ...baseValidPayload, queue_number: null },
      'apt-uuid-001'
    );
    expect(resNull.valid).toBe(false);
    expect(resNull.data).toBeNull();

    const resString = validateCheckInResponse(
      { ...baseValidPayload, queue_number: '15' },
      'apt-uuid-001'
    );
    expect(resString.valid).toBe(false);
    expect(resString.data).toBeNull();

    const resNaN = validateCheckInResponse(
      { ...baseValidPayload, queue_number: NaN },
      'apt-uuid-001'
    );
    expect(resNaN.valid).toBe(false);
    expect(resNaN.data).toBeNull();
  });

  // L. zero queue_number fails closed
  it('L. zero queue_number fails closed', () => {
    const res = validateCheckInResponse(
      { ...baseValidPayload, queue_number: 0 },
      'apt-uuid-001'
    );
    expect(res.valid).toBe(false);
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/nomor antrean/i);
  });

  // M. negative queue_number fails closed
  it('M. negative queue_number fails closed', () => {
    const res = validateCheckInResponse(
      { ...baseValidPayload, queue_number: -3 },
      'apt-uuid-001'
    );
    expect(res.valid).toBe(false);
    expect(res.data).toBeNull();
  });

  // N. floating queue_number fails closed
  it('N. floating queue_number fails closed', () => {
    const res = validateCheckInResponse(
      { ...baseValidPayload, queue_number: 15.5 },
      'apt-uuid-001'
    );
    expect(res.valid).toBe(false);
    expect(res.data).toBeNull();
  });

  // O. malformed joined_at fails closed
  it('O. malformed joined_at fails closed', () => {
    const res = validateCheckInResponse(
      { ...baseValidPayload, joined_at: 'not-a-valid-date' },
      'apt-uuid-001'
    );
    expect(res.valid).toBe(false);
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/waktu bergabung/i);
  });

  // P. missing joined_at fails closed
  it('P. missing joined_at fails closed', () => {
    const resUndefined = validateCheckInResponse(
      { ...baseValidPayload, joined_at: undefined },
      'apt-uuid-001'
    );
    expect(resUndefined.valid).toBe(false);
    expect(resUndefined.data).toBeNull();

    const resEmpty = validateCheckInResponse(
      { ...baseValidPayload, joined_at: '' },
      'apt-uuid-001'
    );
    expect(resEmpty.valid).toBe(false);
    expect(resEmpty.data).toBeNull();

    const resWhitespace = validateCheckInResponse(
      { ...baseValidPayload, joined_at: '   ' },
      'apt-uuid-001'
    );
    expect(resWhitespace.valid).toBe(false);
    expect(resWhitespace.data).toBeNull();
  });

  // Q. non-WAITING status fails closed
  it('Q. non-WAITING status fails closed', () => {
    const invalidStatuses = ['CALLED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'PENDING', '', null, 123];

    for (const status of invalidStatuses) {
      const res = validateCheckInResponse(
        { ...baseValidPayload, status },
        'apt-uuid-001'
      );
      expect(res.valid).toBe(false);
      expect(res.data).toBeNull();
      expect(res.error).toMatch(/WAITING/);
    }
  });

  // R. appointment_id mismatch fails closed
  it('R. appointment_id mismatch fails closed', () => {
    const res = validateCheckInResponse(
      { ...baseValidPayload, appointment_id: 'apt-other-uuid' },
      'apt-uuid-001'
    );
    expect(res.valid).toBe(false);
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/tidak cocok/i);
  });

  // S. malformed appointment_id fails closed
  it('S. malformed appointment_id fails closed', () => {
    const resEmpty = validateCheckInResponse(
      { ...baseValidPayload, appointment_id: '' },
      'apt-uuid-001'
    );
    expect(resEmpty.valid).toBe(false);
    expect(resEmpty.data).toBeNull();

    const resWhitespace = validateCheckInResponse(
      { ...baseValidPayload, appointment_id: '   ' },
      'apt-uuid-001'
    );
    expect(resWhitespace.valid).toBe(false);
    expect(resWhitespace.data).toBeNull();

    const resNumber = validateCheckInResponse(
      { ...baseValidPayload, appointment_id: 12345 },
      'apt-uuid-001'
    );
    expect(resNumber.valid).toBe(false);
    expect(resNumber.data).toBeNull();
  });

  // T. successful response preserves authoritative joined_at
  it('T. successful response preserves authoritative joined_at', () => {
    const authoritativeJoinedAt = '2026-09-28T14:45:00.123Z';
    const res = validateCheckInResponse(
      { ...baseValidPayload, joined_at: authoritativeJoinedAt },
      'apt-uuid-001'
    );
    expect(res.valid).toBe(true);
    expect(res.data?.joinedAt).toBe(authoritativeJoinedAt);
  });

  // U. successful response preserves authoritative queue number
  it('U. successful response preserves authoritative queue number', () => {
    const authoritativeQueueNumber = 99;
    const res = validateCheckInResponse(
      { ...baseValidPayload, queue_number: authoritativeQueueNumber },
      'apt-uuid-001'
    );
    expect(res.valid).toBe(true);
    expect(res.data?.queueNumber).toBe(authoritativeQueueNumber);
  });

  // V. successful response preserves authoritative queue id
  it('V. successful response preserves authoritative queue id', () => {
    const authoritativeQueueId = 'queue-authoritative-uuid-777';
    const res = validateCheckInResponse(
      { ...baseValidPayload, queue_id: authoritativeQueueId },
      'apt-uuid-001'
    );
    expect(res.valid).toBe(true);
    const validatedData: ValidatedCheckInData = res.data!;
    expect(validatedData.queueId).toBe(authoritativeQueueId);
  });

  // W. raw BARBER_NOT_OPERATIONALLY_AVAILABLE never reaches UI feedback
  it('W. raw BARBER_NOT_OPERATIONALLY_AVAILABLE never reaches UI feedback', () => {
    const errorInputs = [
      'BARBER_NOT_OPERATIONALLY_AVAILABLE: ON_LEAVE',
      'BARBER_NOT_OPERATIONALLY_AVAILABLE: ON_BREAK',
      'BARBER_NOT_OPERATIONALLY_AVAILABLE: OUTSIDE_SHIFT',
      'BARBER_NOT_OPERATIONALLY_AVAILABLE: DAY_OFF',
      'BARBER_NOT_OPERATIONALLY_AVAILABLE: UNCONFIGURED',
      'BARBER_NOT_OPERATIONALLY_AVAILABLE: INACTIVE',
      'BARBER_NOT_OPERATIONALLY_AVAILABLE: UNKNOWN_STATUS',
      'P0006: BARBER_NOT_OPERATIONALLY_AVAILABLE: ON_LEAVE (SQLSTATE P0006)',
    ];

    for (const raw of errorInputs) {
      const parsed = parseBarberOperationalError(raw);
      if (parsed) {
        const msg = formatBarberOperationalErrorMessage(parsed.status, 'called', 'Budi');
        expect(msg).not.toContain('BARBER_NOT_OPERATIONALLY_AVAILABLE');
        expect(msg).not.toContain('SQLSTATE');
        expect(msg).not.toContain('P0006');
      }

      const checkInMsg = mapAppointmentCheckInError(raw);
      expect(checkInMsg).not.toContain('BARBER_NOT_OPERATIONALLY_AVAILABLE');
      expect(checkInMsg).not.toContain('SQLSTATE');
    }
  });

  // X. service prefill only occurs after successful validation
  it('X. service prefill only occurs after successful validation — structural assertion', () => {
    const pageContent = fs.readFileSync(
      path.resolve(__dirname, '../app/queue/page.tsx'),
      'utf8'
    );

    const checkInFnMatch = pageContent.match(
      /const handleCheckInToQueue = async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {2}\};/
    );
    expect(checkInFnMatch).not.toBeNull();
    const fnBody = checkInFnMatch![1]!;

    // Find position of validateCheckInResponse
    const validationIndex = fnBody.indexOf('validateCheckInResponse');
    expect(validationIndex).toBeGreaterThan(-1);

    // Find position of check for validation.valid / validation.data
    const validationCheckIndex = fnBody.indexOf('if (!validation.valid || !validation.data)');
    expect(validationCheckIndex).toBeGreaterThan(validationIndex);

    // Find position of service prefill logic
    const prefillIndex = fnBody.indexOf("localStorage.setItem('barber_queue_services'");
    expect(prefillIndex).toBeGreaterThan(validationCheckIndex);

    // Prefill must use validated.queueId, NOT createdQueueId or fallback
    expect(fnBody).toContain('validated.queueId');
    expect(fnBody).toContain('queueServices[validated.queueId]');
  });

  // Static Assertions on page.tsx
  describe('Static Assertions on apps/web/src/app/queue/page.tsx', () => {
    const pageContent = fs.readFileSync(
      path.resolve(__dirname, '../app/queue/page.tsx'),
      'utf8'
    );

    it('page.tsx uses parseBarberOperationalError()', () => {
      expect(pageContent).toContain('parseBarberOperationalError');
      const checkInFnMatch = pageContent.match(
        /const handleCheckInToQueue = async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {2}\};/
      );
      expect(checkInFnMatch![1]!).toContain('parseBarberOperationalError');
    });

    it('page.tsx uses the strict validator validateCheckInResponse()', () => {
      expect(pageContent).toContain('validateCheckInResponse');
      const checkInFnMatch = pageContent.match(
        /const handleCheckInToQueue = async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {2}\};/
      );
      expect(checkInFnMatch![1]!).toContain('validateCheckInResponse(');
    });

    it('no queue_number ?? 0 in check-in handler', () => {
      const checkInFnMatch = pageContent.match(
        /const handleCheckInToQueue = async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {2}\};/
      );
      expect(checkInFnMatch![1]!).not.toContain('queue_number ?? 0');
      expect(checkInFnMatch![1]!).not.toContain('queue_number || 0');
    });

    it('no fallback status || "WAITING" in check-in handler', () => {
      const checkInFnMatch = pageContent.match(
        /const handleCheckInToQueue = async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {2}\};/
      );
      expect(checkInFnMatch![1]!).not.toContain("status || 'WAITING'");
      expect(checkInFnMatch![1]!).not.toContain('status || "WAITING"');
      expect(checkInFnMatch![1]!).not.toContain("status ?? 'WAITING'");
      expect(checkInFnMatch![1]!).not.toContain('status ?? "WAITING"');
    });

    it('no generated Date for joined_at in check-in handler', () => {
      const checkInFnMatch = pageContent.match(
        /const handleCheckInToQueue = async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {2}\};/
      );
      expect(checkInFnMatch![1]!).not.toContain('new Date().toISOString()');
    });

    it('no generated queue ID in check-in handler', () => {
      const checkInFnMatch = pageContent.match(
        /const handleCheckInToQueue = async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {2}\};/
      );
      expect(checkInFnMatch![1]!).not.toContain('randomUUID');
    });

    it('no raw BARBER_NOT_OPERATIONALLY_AVAILABLE passed directly to setFeedback()', () => {
      const checkInFnMatch = pageContent.match(
        /const handleCheckInToQueue = async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {2}\};/
      );
      const fn = checkInFnMatch![1]!;
      expect(fn).not.toContain("message: 'BARBER_NOT_OPERATIONALLY_AVAILABLE'");
      expect(fn).not.toContain('message: "BARBER_NOT_OPERATIONALLY_AVAILABLE"');
    });
  });
});
