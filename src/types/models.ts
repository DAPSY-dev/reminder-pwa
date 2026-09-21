export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';
export type ReminderStatus = 'active' | 'paused';
export interface Schedule {
  start_date: string;
  time_of_day: string;
  timezone: string;
  recurrence_interval: number;
  recurrence_unit: RecurrenceUnit;
  recurrence_end_type: 'never' | 'date';
  recurrence_end_date: string | null;
}
export interface ReminderInput extends Schedule {
  title: string;
  details: string;
  snooze_duration_minutes: number;
}
export interface Reminder extends ReminderInput {
  id: string;
  user_id: string;
  status: ReminderStatus;
  next_occurrence_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface Profile {
  id: string;
  username: string;
  email: string;
  created_at: string;
  updated_at: string;
}
