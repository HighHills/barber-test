/**
 * Employee Leave Operation Error Sanitization Verification Suite (Web)
 *
 * Verifies:
 * 1. SQLSTATE 42501 and permission errors map to safe authorization message.
 * 2. SQLSTATE 22023 and invalid date range errors map to safe range validation message.
 * 3. Staff unassigned errors map to safe assignment validation message.
 * 4. SQLSTATE P0002 and not found errors map to safe not-found message.
 * 5. Reason required errors map to safe reason validation message.
 * 6. Internal PostgreSQL errors (relations, constraints, syntax, timeouts, cluster details)
 *    never leak internal details to the operator across load, save, and status operations.
 * 7. Static code assertions on `employee-leave-panel.tsx` and `leave-form-modal.tsx`
 *    confirm zero raw `err.message` leaks to the UI.
 * 8. Zero false success notifications on RPC failure.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  mapEmployeeLeaveOperationError,
  mapLoadLeaveError,
  mapSaveLeaveError,
  mapStatusLeaveError,
  LEAVE_PERMISSION_DENIED_MESSAGE,
  LEAVE_INVALID_RANGE_MESSAGE,
  LEAVE_STAFF_UNASSIGNED_MESSAGE,
  LEAVE_NOT_FOUND_MESSAGE,
  LEAVE_REASON_REQUIRED_MESSAGE,
  GENERIC_LOAD_LEAVE_ERROR_MESSAGE,
  GENERIC_SAVE_LEAVE_ERROR_MESSAGE,
  GENERIC_STATUS_LEAVE_ERROR_MESSAGE,
} from '../lib/employee-leave-operation-errors';

describe('Employee Leave Operation Error Sanitization (Fail-Closed Contract)', () => {
  describe('1. Authorization & Permission Denied (SQLSTATE 42501)', () => {
    it('maps SQLSTATE 42501 code to safe permission message', () => {
      const err = { code: '42501', message: 'permission denied for relation employee_leaves' };
      expect(mapEmployeeLeaveOperationError(err, 'load')).toBe(LEAVE_PERMISSION_DENIED_MESSAGE);
      expect(mapEmployeeLeaveOperationError(err, 'save')).toBe(LEAVE_PERMISSION_DENIED_MESSAGE);
      expect(mapEmployeeLeaveOperationError(err, 'status')).toBe(LEAVE_PERMISSION_DENIED_MESSAGE);
      expect(mapLoadLeaveError(err)).toBe(LEAVE_PERMISSION_DENIED_MESSAGE);
      expect(mapSaveLeaveError(err)).toBe(LEAVE_PERMISSION_DENIED_MESSAGE);
      expect(mapStatusLeaveError(err)).toBe(LEAVE_PERMISSION_DENIED_MESSAGE);
    });

    it('maps actual Supabase RPC permission exception message', () => {
      const err = {
        code: '42501',
        message: 'Akses ditolak: hanya Owner/Admin yang dapat mengelola cuti staff',
      };
      expect(mapEmployeeLeaveOperationError(err, 'save')).toBe(LEAVE_PERMISSION_DENIED_MESSAGE);
    });

    it('maps insufficient_privilege and not authorized error messages', () => {
      expect(mapEmployeeLeaveOperationError(new Error('insufficient_privilege'), 'status')).toBe(
        LEAVE_PERMISSION_DENIED_MESSAGE
      );
      expect(mapEmployeeLeaveOperationError({ message: 'User is not authorized' }, 'load')).toBe(
        LEAVE_PERMISSION_DENIED_MESSAGE
      );
      expect(mapEmployeeLeaveOperationError({ message: 'Authentication required' }, 'save')).toBe(
        LEAVE_PERMISSION_DENIED_MESSAGE
      );
    });
  });

  describe('2. Invalid Range Validation (SQLSTATE 22023)', () => {
    it('maps SQLSTATE 22023 invalid range to safe range message', () => {
      const err = { code: '22023', message: 'Rentang cuti tidak valid' };
      expect(mapEmployeeLeaveOperationError(err, 'save')).toBe(LEAVE_INVALID_RANGE_MESSAGE);
      expect(mapSaveLeaveError(err)).toBe(LEAVE_INVALID_RANGE_MESSAGE);
    });

    it('maps client-side and database timestamp inversion messages', () => {
      expect(
        mapEmployeeLeaveOperationError(
          { message: 'waktu selesai cuti harus lebih besar dari waktu mulai cuti' },
          'save'
        )
      ).toBe(LEAVE_INVALID_RANGE_MESSAGE);

      expect(
        mapEmployeeLeaveOperationError(
          { message: 'Waktu selesai cuti harus lebih lambat dari waktu mulai cuti.' },
          'save'
        )
      ).toBe(LEAVE_INVALID_RANGE_MESSAGE);

      expect(
        mapEmployeeLeaveOperationError(
          { message: 'tanggal mulai dan selesai cuti wajib diisi' },
          'save'
        )
      ).toBe(LEAVE_INVALID_RANGE_MESSAGE);
    });
  });

  describe('3. Staff Active Assignment Semantics', () => {
    it('maps staff unassigned exception from RPC to safe assignment message', () => {
      const err = {
        code: '22023',
        message: 'Staff belum ditugaskan aktif pada outlet tersebut',
      };
      expect(mapEmployeeLeaveOperationError(err, 'save')).toBe(LEAVE_STAFF_UNASSIGNED_MESSAGE);
      expect(mapSaveLeaveError(err)).toBe(LEAVE_STAFF_UNASSIGNED_MESSAGE);
    });

    it('maps historical inactive assignment and outlet mismatch messages', () => {
      expect(
        mapEmployeeLeaveOperationError(
          { message: 'Karyawan belum memiliki penugasan cabang aktif pada outlet yang dipilih.' },
          'save'
        )
      ).toBe(LEAVE_STAFF_UNASSIGNED_MESSAGE);

      expect(
        mapEmployeeLeaveOperationError(
          { message: 'Penugasan cabang karyawan untuk data cuti ini sudah tidak aktif.' },
          'save'
        )
      ).toBe(LEAVE_STAFF_UNASSIGNED_MESSAGE);
    });
  });

  describe('4. Data Not Found (SQLSTATE P0002)', () => {
    it('maps SQLSTATE P0002 to safe data not found message', () => {
      const err = { code: 'P0002', message: 'Data cuti tidak ditemukan' };
      expect(mapEmployeeLeaveOperationError(err, 'status')).toBe(LEAVE_NOT_FOUND_MESSAGE);
      expect(mapStatusLeaveError(err)).toBe(LEAVE_NOT_FOUND_MESSAGE);
      expect(mapEmployeeLeaveOperationError(err, 'save')).toBe(LEAVE_NOT_FOUND_MESSAGE);
    });

    it('maps generic leave not found message', () => {
      expect(mapEmployeeLeaveOperationError(new Error('leave not found'), 'status')).toBe(
        LEAVE_NOT_FOUND_MESSAGE
      );
    });
  });

  describe('5. Reason Required Validation', () => {
    it('maps reason required error to safe reason message', () => {
      const err = { message: 'Alasan cuti wajib diisi.' };
      expect(mapEmployeeLeaveOperationError(err, 'save')).toBe(LEAVE_REASON_REQUIRED_MESSAGE);
      expect(mapSaveLeaveError(err)).toBe(LEAVE_REASON_REQUIRED_MESSAGE);
    });
  });

  describe('6. Sanitization of Internal PostgreSQL Errors (Zero Leaks)', () => {
    const rawPostgresErrors = [
      {
        code: '42P01',
        message: 'relation "employee_leaves" does not exist',
      },
      {
        code: '23503',
        message:
          'insert or update on table "employee_leaves" violates foreign key constraint "employee_leaves_employee_id_fkey"',
      },
      {
        code: '23502',
        message:
          'null value in column "outlet_id" of relation "employee_leaves" violates not-null constraint',
      },
      {
        code: '57014',
        message: 'canceling statement due to statement timeout',
      },
      {
        code: '42601',
        message: 'syntax error at or near "SELECT" at character 1',
      },
      {
        code: '08006',
        message: 'connection failure to PostgreSQL cluster backend server 10.0.0.1:5432',
      },
      {
        code: 'XX000',
        message: 'internal error: tuple concurrently updated in block 88 offset 3',
      },
    ];

    it('sanitizes all PostgreSQL internals for load operation', () => {
      for (const err of rawPostgresErrors) {
        const result = mapEmployeeLeaveOperationError(err, 'load');
        expect(result).toBe(GENERIC_LOAD_LEAVE_ERROR_MESSAGE);
        expect(result).not.toContain(err.code);
        expect(result).not.toContain('relation');
        expect(result).not.toContain('table');
        expect(result).not.toContain('constraint');
        expect(result).not.toContain('column');
        expect(result).not.toContain('syntax');
        expect(result).not.toContain('timeout');
        expect(result).not.toContain('5432');
      }
    });

    it('sanitizes all PostgreSQL internals for save operation', () => {
      for (const err of rawPostgresErrors) {
        const result = mapEmployeeLeaveOperationError(err, 'save');
        expect(result).toBe(GENERIC_SAVE_LEAVE_ERROR_MESSAGE);
        expect(result).not.toContain(err.code);
        expect(result).not.toContain('relation');
        expect(result).not.toContain('table');
        expect(result).not.toContain('constraint');
        expect(result).not.toContain('column');
        expect(result).not.toContain('syntax');
        expect(result).not.toContain('timeout');
        expect(result).not.toContain('5432');
      }
    });

    it('sanitizes all PostgreSQL internals for status operation', () => {
      for (const err of rawPostgresErrors) {
        const result = mapEmployeeLeaveOperationError(err, 'status');
        expect(result).toBe(GENERIC_STATUS_LEAVE_ERROR_MESSAGE);
        expect(result).not.toContain(err.code);
        expect(result).not.toContain('relation');
        expect(result).not.toContain('table');
        expect(result).not.toContain('constraint');
        expect(result).not.toContain('column');
        expect(result).not.toContain('syntax');
        expect(result).not.toContain('timeout');
        expect(result).not.toContain('5432');
      }
    });

    it('handles unexpected non-object and primitive errors fail-closed', () => {
      expect(mapEmployeeLeaveOperationError(null, 'load')).toBe(GENERIC_LOAD_LEAVE_ERROR_MESSAGE);
      expect(mapEmployeeLeaveOperationError(undefined, 'save')).toBe(GENERIC_SAVE_LEAVE_ERROR_MESSAGE);
      expect(mapEmployeeLeaveOperationError(99999, 'status')).toBe(GENERIC_STATUS_LEAVE_ERROR_MESSAGE);
      expect(mapEmployeeLeaveOperationError(true, 'save')).toBe(GENERIC_SAVE_LEAVE_ERROR_MESSAGE);
      expect(mapEmployeeLeaveOperationError('unexpected network glitch', 'load')).toBe(
        GENERIC_LOAD_LEAVE_ERROR_MESSAGE
      );
    });
  });

  describe('7. Static Code Assertions on employee-leave-panel.tsx & leave-form-modal.tsx', () => {
    const panelPath = path.resolve(__dirname, '../components/settings/employee-leave-panel.tsx');
    const modalPath = path.resolve(__dirname, '../components/settings/leave-form-modal.tsx');

    const panelContent = fs.readFileSync(panelPath, 'utf8');
    const modalContent = fs.readFileSync(modalPath, 'utf8');

    it('employee-leave-panel.tsx imports mapEmployeeLeaveOperationError', () => {
      expect(panelContent).toContain('mapEmployeeLeaveOperationError');
    });

    it('employee-leave-panel.tsx never leaks raw err.message in loadData', () => {
      const startIdx = panelContent.indexOf('const loadData =');
      expect(startIdx).toBeGreaterThan(0);
      const endIdx = panelContent.indexOf('useEffect(() => {', startIdx);
      expect(endIdx).toBeGreaterThan(startIdx);
      const block = panelContent.substring(startIdx, endIdx);

      expect(block).not.toContain('err instanceof Error ? err.message');
      expect(block).not.toContain('+ err.message');
      expect(block).not.toContain('+ (err.message');
      expect(block).toContain('console.error(');
      expect(block).toContain("mapEmployeeLeaveOperationError(err, 'load')");
    });

    it('employee-leave-panel.tsx never leaks raw err.message in handleQuickStatus', () => {
      const startIdx = panelContent.indexOf('const handleQuickStatus =');
      expect(startIdx).toBeGreaterThan(0);
      const endIdx = panelContent.indexOf('const formatDisplayDate =', startIdx);
      expect(endIdx).toBeGreaterThan(startIdx);
      const block = panelContent.substring(startIdx, endIdx);

      expect(block).not.toContain('err instanceof Error ? err.message');
      expect(block).not.toContain('+ err.message');
      expect(block).not.toContain('+ (err.message');
      expect(block).toContain('console.error(');
      expect(block).toContain("mapEmployeeLeaveOperationError(err, 'status')");
    });

    it('leave-form-modal.tsx imports mapEmployeeLeaveOperationError', () => {
      expect(modalContent).toContain('mapEmployeeLeaveOperationError');
    });

    it('leave-form-modal.tsx never leaks raw err.message in handleSubmit', () => {
      const startIdx = modalContent.indexOf('const handleSubmit =');
      expect(startIdx).toBeGreaterThan(0);
      const endIdx = modalContent.indexOf('return (', startIdx);
      expect(endIdx).toBeGreaterThan(startIdx);
      const block = modalContent.substring(startIdx, endIdx);

      expect(block).not.toContain('err instanceof Error ? err.message');
      expect(block).not.toContain('+ err.message');
      expect(block).toContain('console.error(');
      expect(block).toContain("mapEmployeeLeaveOperationError(err, 'save')");
    });
  });

  describe('8. Zero False Success Notifications on RPC Failure', () => {
    const panelPath = path.resolve(__dirname, '../components/settings/employee-leave-panel.tsx');
    const panelContent = fs.readFileSync(panelPath, 'utf8');

    it('handleSaveLeave throws on RPC error before calling onNotification SUCCESS', () => {
      const startIdx = panelContent.indexOf('const handleSaveLeave =');
      const endIdx = panelContent.indexOf('const handleQuickStatus =', startIdx);
      const block = panelContent.substring(startIdx, endIdx);

      const errorCheckIdx = block.indexOf('if (error) throw error;');
      const successNotifIdx = block.indexOf("type: 'SUCCESS'");
      expect(errorCheckIdx).toBeGreaterThan(0);
      expect(successNotifIdx).toBeGreaterThan(errorCheckIdx);
    });

    it('handleQuickStatus throws on RPC error before calling onNotification SUCCESS', () => {
      const startIdx = panelContent.indexOf('const handleQuickStatus =');
      const endIdx = panelContent.indexOf('const formatDisplayDate =', startIdx);
      const block = panelContent.substring(startIdx, endIdx);

      const errorCheckIdx = block.indexOf('if (error) throw error;');
      const successNotifIdx = block.indexOf("type: 'SUCCESS'");
      expect(errorCheckIdx).toBeGreaterThan(0);
      expect(successNotifIdx).toBeGreaterThan(errorCheckIdx);
    });
  });
});
