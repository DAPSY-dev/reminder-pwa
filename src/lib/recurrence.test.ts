import { describe, expect, it } from 'vitest';
import { nextOccurrence, snoozedUntil } from './recurrence';
import type { Schedule } from '../types/models';

const base: Schedule = {
  start_date: '2026-01-01',
  time_of_day: '09:00',
  timezone: 'UTC',
  recurrence_interval: 1,
  recurrence_unit: 'day',
  recurrence_end_type: 'never',
  recurrence_end_date: null,
};
const next = (schedule: Partial<Schedule>, after: string) =>
  nextOccurrence({ ...base, ...schedule }, new Date(after));
describe('calendar recurrence', () => {
  it('schedules daily and moves strictly beyond the current instant', () => {
    expect(next({}, '2026-01-01T08:59:00Z')).toBe('2026-01-01T09:00:00Z');
    expect(next({}, '2026-01-01T09:00:00Z')).toBe('2026-01-02T09:00:00Z');
  });
  it('anchors every two days to the original start', () => {
    expect(next({ recurrence_interval: 2 }, '2026-01-04T12:00:00Z')).toBe('2026-01-05T09:00:00Z');
  });
  it('supports every three weeks across a year boundary', () => {
    expect(
      next(
        { start_date: '2025-12-20', recurrence_unit: 'week', recurrence_interval: 3 },
        '2026-01-01T12:00:00Z',
      ),
    ).toBe('2026-01-10T09:00:00Z');
  });
  it('supports every six months and recovers the original day after a clamp', () => {
    expect(
      next(
        { start_date: '2025-08-31', recurrence_unit: 'month', recurrence_interval: 6 },
        '2026-02-01T12:00:00Z',
      ),
    ).toBe('2026-02-28T09:00:00Z');
    expect(
      next(
        { start_date: '2025-08-31', recurrence_unit: 'month', recurrence_interval: 6 },
        '2026-02-28T09:00:00Z',
      ),
    ).toBe('2026-08-31T09:00:00Z');
  });
  it('clamps month boundaries without drifting', () => {
    const schedule = { start_date: '2026-01-31', recurrence_unit: 'month' as const };
    expect(next(schedule, '2026-01-31T09:00:00Z')).toBe('2026-02-28T09:00:00Z');
    expect(next(schedule, '2026-02-28T09:00:00Z')).toBe('2026-03-31T09:00:00Z');
  });
  it('supports yearly leap day anchoring', () => {
    const schedule = { start_date: '2024-02-29', recurrence_unit: 'year' as const };
    expect(next(schedule, '2025-01-01T00:00:00Z')).toBe('2025-02-28T09:00:00Z');
    expect(next(schedule, '2027-03-01T00:00:00Z')).toBe('2028-02-29T09:00:00Z');
  });
  it('includes an end date, then exhausts', () => {
    const schedule = { recurrence_end_type: 'date' as const, recurrence_end_date: '2026-01-02' };
    expect(next(schedule, '2026-01-01T09:00:00Z')).toBe('2026-01-02T09:00:00Z');
    expect(next(schedule, '2026-01-02T09:00:00Z')).toBeNull();
  });
  it('pauses and resumes without backfilling', () => {
    const now = new Date('2026-01-06T10:00:00Z');
    expect(nextOccurrence(base, now, 'paused')).toBeNull();
    expect(nextOccurrence(base, now, 'active')).toBe('2026-01-07T09:00:00Z');
  });
  it('snoozes independently of the base rule', () => {
    const before = { ...base };
    expect(snoozedUntil(10, new Date('2026-01-01T09:00:00Z'))).toBe('2026-01-01T09:10:00Z');
    expect(nextOccurrence(base, new Date('2026-01-01T09:10:00Z'))).toBe('2026-01-02T09:00:00Z');
    expect(base).toEqual(before);
  });
  it('preserves 09:00 local through spring DST', () => {
    expect(next({ timezone: 'America/New_York' }, '2026-03-07T15:00:00Z')).toBe(
      '2026-03-08T13:00:00Z',
    );
  });
  it('moves nonexistent times forward and selects the later ambiguous instant', () => {
    expect(
      next({ timezone: 'America/New_York', time_of_day: '02:30' }, '2026-03-08T05:00:00Z'),
    ).toBe('2026-03-08T07:30:00Z');
    expect(
      next({ timezone: 'America/New_York', time_of_day: '01:30' }, '2026-11-01T04:00:00Z'),
    ).toBe('2026-11-01T06:30:00Z');
  });
  it('handles old anchors without iterating every historical occurrence', () => {
    expect(next({ start_date: '1900-01-01' }, '2026-09-16T12:00:00Z')).toBe('2026-09-17T09:00:00Z');
  });
  it('rejects invalid intervals and snooze durations', () => {
    expect(() => next({ recurrence_interval: 0 }, '2026-01-01T00:00:00Z')).toThrow();
    expect(() => snoozedUntil(-1)).toThrow();
  });
  it('exhausts schedules beyond the supported calendar range', () => {
    expect(
      next({ start_date: '9999-12-31', recurrence_unit: 'year' }, '9999-12-31T09:00:00Z'),
    ).toBeNull();
  });
});
