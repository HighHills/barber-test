import type { ScheduleDayItem } from '../types/settings';

export interface EmployeeScheduleRowForMapping {
  id?: string;
  day_of_week: number;
  is_active: boolean | null;
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
}

export const EMPLOYEE_SCHEDULE_WEEK_DAYS: ReadonlyArray<{
  day_of_week: number;
  day_name: string;
}> = [
  { day_of_week: 1, day_name: 'Senin' },
  { day_of_week: 2, day_name: 'Selasa' },
  { day_of_week: 3, day_name: 'Rabu' },
  { day_of_week: 4, day_name: 'Kamis' },
  { day_of_week: 5, day_name: 'Jumat' },
  { day_of_week: 6, day_name: 'Sabtu' },
  { day_of_week: 0, day_name: 'Minggu' },
];

function formatScheduleTime(value: string | null): string {
  return value ? value.slice(0, 5) : '';
}

/**
 * Maps persisted rows without inventing a schedule for missing days.
 * A missing row is intentionally distinct from an explicit day off.
 */
export function mapEmployeeScheduleRowsToWeek(
  rows: readonly EmployeeScheduleRowForMapping[]
): ScheduleDayItem[] {
  return EMPLOYEE_SCHEDULE_WEEK_DAYS.map((day) => {
    const found = rows.find((row) => row.day_of_week === day.day_of_week);

    if (!found) {
      return {
        day_of_week: day.day_of_week,
        day_name: day.day_name,
        is_configured: false,
        is_active: false,
        start_time: '',
        end_time: '',
        has_break: false,
        break_start: '',
        break_end: '',
      };
    }

    const breakStart = formatScheduleTime(found.break_start);
    const breakEnd = formatScheduleTime(found.break_end);

    return {
      id: found.id,
      day_of_week: day.day_of_week,
      day_name: day.day_name,
      is_configured: true,
      is_active: Boolean(found.is_active),
      start_time: formatScheduleTime(found.start_time),
      end_time: formatScheduleTime(found.end_time),
      has_break: Boolean(breakStart && breakEnd),
      break_start: breakStart,
      break_end: breakEnd,
    };
  });
}
