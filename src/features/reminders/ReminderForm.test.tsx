// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { ReminderForm } from './ReminderForm';
import { reminderService } from '../../services/reminders';
import { store, cleared, sessionChanged } from '../../store';
import type { Reminder } from '../../types/models';

vi.mock('../../services/reminders', () => ({ reminderService: { save: vi.fn() } }));
const reminder: Reminder = {
  id: 'reminder-id',
  user_id: 'user',
  title: 'Vet appointment',
  details: 'Bring documents',
  start_date: '2027-01-01',
  time_of_day: '09:00:00',
  timezone: 'UTC',
  recurrence_interval: 3,
  recurrence_unit: 'week',
  recurrence_end_type: 'never',
  recurrence_end_date: null,
  snooze_duration_minutes: 10,
  status: 'active',
  next_occurrence_at: '2027-01-01T09:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  store.dispatch(cleared());
  store.dispatch(sessionChanged({ id: 'user', user_metadata: {} } as User));
  vi.clearAllMocks();
  vi.mocked(reminderService.save).mockResolvedValue(reminder);
});
afterEach(cleanup);
function form(existing?: Reminder) {
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ReminderForm reminder={existing} />
      </MemoryRouter>
    </Provider>,
  );
}
it('creates a configurable recurrence using server persistence', async () => {
  form();
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Vet appointment' } });
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2027-01-01' } });
  fireEvent.change(screen.getByLabelText('Recurrence interval'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Recurrence unit'), { target: { value: 'week' } });
  fireEvent.change(screen.getByLabelText('Snooze duration (minutes)'), { target: { value: '15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create reminder' }));
  await waitFor(() =>
    expect(reminderService.save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Vet appointment',
        recurrence_interval: 3,
        recurrence_unit: 'week',
        snooze_duration_minutes: 15,
      }),
      'user',
      undefined,
    ),
  );
  expect(store.getState().reminders.items).toHaveLength(1);
});
it('updates the existing record instead of creating another reminder', async () => {
  form(reminder);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Updated appointment' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(reminderService.save).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Updated appointment' }),
      'user',
      'reminder-id',
    ),
  );
});
it('rejects an end date before the start date', async () => {
  form(reminder);
  fireEvent.click(screen.getByLabelText('On a date'));
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-12-31' } });
  fireEvent.submit(screen.getByLabelText('Title').closest('form')!);
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'End date must be on or after the start date.',
  );
  expect(reminderService.save).not.toHaveBeenCalled();
});
it('surfaces a failed save without losing the user’s input', async () => {
  vi.mocked(reminderService.save).mockRejectedValue(new Error('Database error'));
  form(reminder);
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'We couldn’t complete that request. Please try again.',
  );
  expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Vet appointment');
});
