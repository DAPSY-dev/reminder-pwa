import { Temporal } from '@js-temporal/polyfill';
import type { ReminderInput } from '../types/models';

export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'Enter a valid email address.';
}
export function validateUsername(username: string): string | null {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username.trim())
    ? null
    : 'Use 3–30 letters, numbers, or underscores for your username.';
}
export function validatePassword(password: string, repeat: string): string | null {
  if (
    password.length < 12 ||
    password.length > 128 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password)
  )
    return 'Use 12–128 characters, including uppercase, lowercase, and a number.';
  return password === repeat ? null : 'Passwords do not match.';
}
export function validateReminder(value: ReminderInput): string | null {
  if (!value.title.trim() || value.title.trim().length > 120)
    return 'Enter a title of 1–120 characters.';
  if (value.details.length > 2000) return 'Keep details under 2,000 characters.';
  if (
    !Number.isInteger(value.recurrence_interval) ||
    value.recurrence_interval < 1 ||
    value.recurrence_interval > 1000
  )
    return 'Repeat interval must be a whole number from 1 to 1,000.';
  if (!['day', 'week', 'month', 'year'].includes(value.recurrence_unit))
    return 'Choose a recurrence unit.';
  if (
    !Number.isInteger(value.snooze_duration_minutes) ||
    value.snooze_duration_minutes < 1 ||
    value.snooze_duration_minutes > 10080
  )
    return 'Snooze must be 1–10,080 whole minutes.';
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value.start_date) ||
    value.start_date < '1900-01-01' ||
    value.start_date > '9999-12-31'
  )
    return 'Start date must be between 1900 and 9999.';
  if (value.timezone !== 'UTC' && !value.timezone.includes('/'))
    return 'Use an IANA time zone such as Europe/Kyiv or UTC.';
  try {
    Temporal.PlainDate.from(value.start_date, { overflow: 'reject' });
    Temporal.PlainTime.from(value.time_of_day, { overflow: 'reject' });
    Temporal.Now.zonedDateTimeISO(value.timezone);
    if (value.recurrence_end_type === 'date') {
      if (!value.recurrence_end_date) return 'Choose an end date.';
      const end = Temporal.PlainDate.from(value.recurrence_end_date, { overflow: 'reject' });
      if (Temporal.PlainDate.compare(end, Temporal.PlainDate.from(value.start_date)) < 0)
        return 'End date must be on or after the start date.';
    }
  } catch {
    return 'Check the date, time, and time zone.';
  }
  return null;
}
