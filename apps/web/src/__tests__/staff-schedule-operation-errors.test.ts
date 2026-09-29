import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GENERIC_SCHEDULE_LOAD_MESSAGE,
  GENERIC_SCHEDULE_SAVE_MESSAGE,
  GENERIC_STAFF_LOAD_MESSAGE,
  GENERIC_STAFF_SAVE_MESSAGE,
  OUTLET_NOT_FOUND_MESSAGE,
  SCHEDULE_PERMISSION_DENIED_MESSAGE,
  SCHEDULE_STAFF_REQUIRED_MESSAGE,
  SCHEDULE_UNASSIGNED_MESSAGE,
  SCHEDULE_VALIDATION_MESSAGE,
  STAFF_DUPLICATE_CODE_MESSAGE,
  STAFF_NOT_FOUND_MESSAGE,
  STAFF_PERMISSION_DENIED_MESSAGE,
  STAFF_REQUIRED_MESSAGE,
  mapScheduleOperationError,
  mapStaffOperationError,
} from '../lib/staff-schedule-operation-errors';

describe('staff and schedule operation error mapping', () => {
  it('maps staff permission errors safely', () => {
    expect(mapStaffOperationError({ code: '42501', message: 'internal role detail' }, 'load')).toBe(
      STAFF_PERMISSION_DENIED_MESSAGE
    );
    expect(mapStaffOperationError(new Error('permission denied for relation employees'), 'status')).toBe(
      STAFF_PERMISSION_DENIED_MESSAGE
    );
  });

  it('maps staff business errors', () => {
    expect(mapStaffOperationError({ code: '22023', message: 'Kode staff dan nama staff wajib diisi' }, 'save')).toBe(
      STAFF_REQUIRED_MESSAGE
    );
    expect(mapStaffOperationError({ code: '23505', message: 'duplicate key constraint staff_code' }, 'save')).toBe(
      STAFF_DUPLICATE_CODE_MESSAGE
    );
    expect(mapStaffOperationError({ code: 'P0002', message: 'Staff tidak ditemukan' }, 'status')).toBe(
      STAFF_NOT_FOUND_MESSAGE
    );
    expect(mapStaffOperationError(new Error('Outlet tidak ditemukan'), 'assignment')).toBe(
      OUTLET_NOT_FOUND_MESSAGE
    );
  });

  it('fails closed for internal staff database errors', () => {
    for (const code of ['42P01', '23502', '23503', '42601', '57014', '08006', 'XX000']) {
      const result = mapStaffOperationError(
        { code, message: `internal employee_table constraint ${code}` },
        'load'
      );
      expect(result).toBe(GENERIC_STAFF_LOAD_MESSAGE);
      expect(result).not.toContain(code);
      expect(result).not.toContain('employee_table');
    }
  });

  it('maps schedule business validation errors', () => {
    expect(mapScheduleOperationError({ code: '42501', message: 'role denied' }, 'load')).toBe(
      SCHEDULE_PERMISSION_DENIED_MESSAGE
    );
    expect(mapScheduleOperationError(new Error('Staff dan outlet wajib dipilih'), 'save')).toBe(
      SCHEDULE_STAFF_REQUIRED_MESSAGE
    );
    expect(mapScheduleOperationError(new Error('Staff belum ditugaskan aktif pada outlet tersebut'), 'save')).toBe(
      SCHEDULE_UNASSIGNED_MESSAGE
    );
    expect(mapScheduleOperationError(new Error('Jam istirahat tidak valid untuk hari 1'), 'save')).toBe(
      SCHEDULE_VALIDATION_MESSAGE
    );
  });

  it('fails closed for schedule database errors', () => {
    expect(mapScheduleOperationError({ code: '42P01', message: 'relation employee_schedules does not exist' }, 'load')).toBe(
      GENERIC_SCHEDULE_LOAD_MESSAGE
    );
    expect(mapScheduleOperationError({ code: '57014', message: 'statement timeout employee_schedules' }, 'save')).toBe(
      GENERIC_SCHEDULE_SAVE_MESSAGE
    );
  });

  it('fails closed for unknown primitive errors', () => {
    expect(mapStaffOperationError(null, 'save')).toBe(GENERIC_STAFF_SAVE_MESSAGE);
    expect(mapScheduleOperationError(undefined, 'save')).toBe(GENERIC_SCHEDULE_SAVE_MESSAGE);
    expect(mapStaffOperationError('unexpected internal SQL statement', 'load')).toBe(
      GENERIC_STAFF_LOAD_MESSAGE
    );
  });

  it('does not expose raw database messages from staff and schedule UI handlers', () => {
    const componentFiles = [
      'staff-settings-panel.tsx',
      'employee-form-modal.tsx',
      'employee-outlet-assignment-modal.tsx',
      'employee-schedule-panel.tsx',
    ];

    for (const fileName of componentFiles) {
      const source = readFileSync(
        resolve(process.cwd(), 'src/components/settings', fileName),
        'utf8'
      );
      expect(source).not.toContain('err instanceof Error ? err.message');
      expect(source).not.toContain('const msg = err.message');
    }
  });
});
