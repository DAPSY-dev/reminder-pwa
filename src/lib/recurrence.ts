import { Temporal } from '@js-temporal/polyfill';
import type { Schedule, ReminderStatus } from '../types/models';

function dateAt(schedule: Schedule, index: number): Temporal.PlainDate {
  const anchor = Temporal.PlainDate.from(schedule.start_date);
  const count = schedule.recurrence_interval * index;
  switch (schedule.recurrence_unit) {
    case 'day':
      return anchor.add({ days: count });
    case 'week':
      return anchor.add({ weeks: count });
    case 'month':
      return anchor.add({ months: count }, { overflow: 'constrain' });
    case 'year':
      return anchor.add({ years: count }, { overflow: 'constrain' });
  }
}

/** Anchor each occurrence to the original date; Jan 31 → Feb 28 → Mar 31.
 * DST gaps shift forward, overlaps use the later instant, matching PostgreSQL. */
export function nextOccurrence(
  schedule: Schedule,
  after = new Date(),
  status: ReminderStatus = 'active',
): string | null {
  if (status === 'paused') return null;
  if (!Number.isInteger(schedule.recurrence_interval) || schedule.recurrence_interval < 1)
    throw new RangeError('Invalid recurrence interval');
  const instant = Temporal.Instant.from(after.toISOString());
  const local = instant.toZonedDateTimeISO(schedule.timezone).toPlainDate();
  const anchor = Temporal.PlainDate.from(schedule.start_date);
  const days = anchor.until(local, { largestUnit: 'days' }).days;
  const months = (local.year - anchor.year) * 12 + local.month - anchor.month;
  const distance =
    schedule.recurrence_unit === 'day'
      ? days
      : schedule.recurrence_unit === 'week'
        ? Math.floor(days / 7)
        : schedule.recurrence_unit === 'month'
          ? months
          : local.year - anchor.year;
  let index = Math.max(0, Math.floor(distance / schedule.recurrence_interval) - 1);
  for (;;) {
    const date = dateAt(schedule, index++);
    if (date.year > 9999) return null;
    if (
      schedule.recurrence_end_type === 'date' &&
      schedule.recurrence_end_date &&
      Temporal.PlainDate.compare(date, Temporal.PlainDate.from(schedule.recurrence_end_date)) > 0
    )
      return null;
    const candidate = date
      .toPlainDateTime(Temporal.PlainTime.from(schedule.time_of_day))
      .toZonedDateTime(schedule.timezone, { disambiguation: 'later' })
      .toInstant();
    if (Temporal.Instant.compare(candidate, instant) > 0) return candidate.toString();
  }
}

export function snoozedUntil(minutes: number, now = new Date()): string {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080)
    throw new RangeError('Invalid snooze duration');
  return Temporal.Instant.from(now.toISOString()).add({ minutes }).toString();
}

export function recurrenceSummary(schedule: Schedule): string {
  const n = schedule.recurrence_interval;
  return `Every ${n === 1 ? '' : `${n} `}${schedule.recurrence_unit}${n === 1 ? '' : 's'}`;
}
