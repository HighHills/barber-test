import { describe, expect, it } from 'vitest';
import { mapEmployeeScheduleRowsToWeek } from '../lib/employee-schedule-mapping';

describe('employee schedule mapping parity', () => {
  it('keeps missing Supabase rows unconfigured without fabricated hours', () => {
    const week = mapEmployeeScheduleRowsToWeek([]);

    expect(week).toHaveLength(7);
    expect(week.every((day) => day.is_configured === false)).toBe(true);
    expect(week.every((day) => day.is_active === false)).toBe(true);
    expect(week.every((day) => day.start_time === '' && day.end_time === '')).toBe(true);
    expect(week.every((day) => !day.has_break && day.break_start === '' && day.break_end === '')).toBe(
      true
    );
  });

  it('preserves an explicit persisted day off as configured', () => {
    const week = mapEmployeeScheduleRowsToWeek([
      {
        id: 'schedule-sunday',
        day_of_week: 0,
        is_active: false,
        start_time: '09:00:00',
        end_time: '21:00:00',
        break_start: null,
        break_end: null,
      },
    ]);

    const sunday = week.find((day) => day.day_of_week === 0);
    const monday = week.find((day) => day.day_of_week === 1);

    expect(sunday).toMatchObject({
      id: 'schedule-sunday',
      is_configured: true,
      is_active: false,
      start_time: '09:00',
      end_time: '21:00',
      has_break: false,
      break_start: '',
      break_end: '',
    });
    expect(monday?.is_configured).toBe(false);
  });

  it('maps a persisted active shift and only enables break when both times exist', () => {
    const [monday] = mapEmployeeScheduleRowsToWeek([
      {
        day_of_week: 1,
        is_active: true,
        start_time: '09:00:00',
        end_time: '18:00:00',
        break_start: '12:00:00',
        break_end: '13:00:00',
      },
    ]);

    expect(monday).toMatchObject({
      is_configured: true,
      is_active: true,
      start_time: '09:00',
      end_time: '18:00',
      has_break: true,
      break_start: '12:00',
      break_end: '13:00',
    });
  });
});
