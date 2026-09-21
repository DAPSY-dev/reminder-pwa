import { beforeEach, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { store, cleared, sessionChanged, upserted, loadReminders } from './index';
import type { Reminder } from '../types/models';
const user = (id: string) => ({ id, user_metadata: {} }) as User;
const reminder = { id: 'reminder-a', user_id: 'a', title: 'Private to A' } as Reminder;
beforeEach(() => {
  store.dispatch(sessionChanged(null));
  store.dispatch(cleared());
});
it('clears records on account changes and rejects a late save from the previous user', () => {
  store.dispatch(sessionChanged(user('a')));
  store.dispatch(upserted(reminder));
  expect(store.getState().reminders.items).toHaveLength(1);
  store.dispatch(sessionChanged(user('b')));
  store.dispatch(upserted(reminder));
  expect(store.getState().reminders.items).toHaveLength(0);
});
it('invalidates list responses that finish after logout', () => {
  store.dispatch(sessionChanged(user('a')));
  store.dispatch(loadReminders.pending('old-request', undefined));
  store.dispatch(sessionChanged(null));
  store.dispatch(loadReminders.fulfilled([reminder], 'old-request', undefined));
  expect(store.getState().reminders.items).toHaveLength(0);
  expect(store.getState().reminders.loaded).toBe(false);
});
