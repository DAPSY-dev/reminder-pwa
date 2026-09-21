import { expect, it } from 'vitest';
import { validateEmail, validatePassword, validateReminder, validateUsername } from './validation';
import type { ReminderInput } from '../types/models';
const valid: ReminderInput = {
  title: 'Water plants',
  details: '',
  start_date: '2026-01-01',
  time_of_day: '09:00',
  timezone: 'Europe/Kyiv',
  recurrence_interval: 2,
  recurrence_unit: 'day',
  recurrence_end_type: 'never',
  recurrence_end_date: null,
  snooze_duration_minutes: 10,
};
it('validates auth fields', () => {
  expect(validateEmail('you@example.com')).toBeNull();
  expect(validateEmail('bad')).not.toBeNull();
  expect(validateUsername('person_123')).toBeNull();
  expect(validateUsername('x')).not.toBeNull();
  expect(validatePassword('GoodPassword123', 'GoodPassword123')).toBeNull();
  expect(validatePassword('GoodPassword123', 'Different')).not.toBeNull();
  expect(validatePassword('password', 'password')).not.toBeNull();
});
it('rejects invalid reminder input', () => {
  expect(validateReminder(valid)).toBeNull();
  for (const change of [
    { title: ' ' },
    { start_date: '2026-02-30' },
    { time_of_day: '25:00' },
    { timezone: 'Bogus/Zone' },
    { recurrence_interval: 1.5 },
    { snooze_duration_minutes: 0 },
    { recurrence_end_type: 'date' as const, recurrence_end_date: '2025-12-31' },
  ])
    expect(validateReminder({ ...valid, ...change })).not.toBeNull();
});
