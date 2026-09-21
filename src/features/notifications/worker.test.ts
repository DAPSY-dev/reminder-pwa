import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

type WorkerEvent = {
  waitUntil(promise: Promise<unknown>): void;
  data?: { json(): unknown };
  action?: string;
  notification?: { data: unknown; close(): void };
};
const listeners = new Map<string, (event: WorkerEvent) => void>();
const showNotification = vi.fn().mockResolvedValue(undefined);
const openWindow = vi.fn().mockResolvedValue(undefined);
const fetch = vi.fn().mockResolvedValue({ ok: true });
const workerLocation = { origin: 'https://app.example.com' };
const payload = {
  title: 'Water plants',
  body: 'A little water',
  url: 'https://app.example.com/reminders/id/edit',
  occurrenceId: 'occurrence',
  generation: 2,
  token: 'secret',
  actionUrl: 'https://db.example.com/functions/v1/notification-action',
  gatewayKey: 'public-anon-jwt',
};
beforeEach(async () => {
  listeners.clear();
  vi.clearAllMocks();
  fetch.mockResolvedValue({ ok: true });
  workerLocation.origin = 'https://app.example.com';
  runInNewContext(await readFile('public/sw.js', 'utf8'), {
    self: {
      location: workerLocation,
      addEventListener: (name: string, listener: (event: WorkerEvent) => void) =>
        listeners.set(name, listener),
      registration: { showNotification },
      clients: { matchAll: vi.fn().mockResolvedValue([]), openWindow },
    },
    fetch,
    URL,
  });
});
async function emit(name: string, event: Omit<WorkerEvent, 'waitUntil'>) {
  let work: Promise<unknown> = Promise.resolve();
  listeners.get(name)!({
    ...event,
    waitUntil: (promise) => {
      work = promise;
    },
  });
  await work;
}
describe('service worker notification behavior', () => {
  it('uses an occurrence/generation tag to collapse display duplicates', async () => {
    await emit('push', { data: { json: () => payload } });
    expect(showNotification).toHaveBeenCalledWith(
      'Water plants',
      expect.objectContaining({ tag: 'reminder-occurrence-2', data: payload, renotify: false }),
    );
  });
  it('opens the reminder when the notification body is tapped', async () => {
    await emit('notificationclick', {
      action: '',
      notification: { data: payload, close: vi.fn() },
    });
    expect(openWindow).toHaveBeenCalledWith(payload.url);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('applies Done using only the occurrence capability', async () => {
    await emit('notificationclick', {
      action: 'done',
      notification: { data: payload, close: vi.fn() },
    });
    expect(fetch).toHaveBeenCalledWith(
      payload.actionUrl,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer public-anon-jwt',
          apikey: 'public-anon-jwt',
        }),
        body: JSON.stringify({
          occurrenceId: 'occurrence',
          token: 'secret',
          generation: 2,
          action: 'done',
        }),
      }),
    );
    expect(openWindow).not.toHaveBeenCalled();
  });
  it('reports a failed Snooze and keeps retry actions available', async () => {
    fetch.mockRejectedValue(new Error('offline'));
    await emit('notificationclick', {
      action: 'snooze',
      notification: { data: payload, close: vi.fn() },
    });
    expect(showNotification).toHaveBeenCalledWith(
      'Couldn’t update your reminder',
      expect.objectContaining({
        data: payload,
        actions: expect.arrayContaining([{ action: 'snooze', title: 'Snooze' }]),
      }),
    );
    expect(openWindow).toHaveBeenCalledWith(payload.url);
  });
  it('never opens a foreign origin from a notification payload', async () => {
    await emit('notificationclick', {
      action: '',
      notification: { data: { ...payload, url: 'https://foreign.example.com/' }, close: vi.fn() },
    });
    expect(openWindow).not.toHaveBeenCalled();
  });
  it('opens a loopback notification on the subscribing worker hostname', async () => {
    workerLocation.origin = 'http://localhost:5173';
    await emit('notificationclick', {
      action: '',
      notification: {
        data: { ...payload, url: 'http://127.0.0.1:5173/reminders/id/edit' },
        close: vi.fn(),
      },
    });
    expect(openWindow).toHaveBeenCalledWith('http://localhost:5173/reminders/id/edit');
  });
  it('opens relative notification links on the hosted subscription origin', async () => {
    workerLocation.origin = 'https://reminder.free.bg';
    await emit('notificationclick', {
      action: '',
      notification: { data: { ...payload, url: '/reminders/id/edit' }, close: vi.fn() },
    });
    expect(openWindow).toHaveBeenCalledWith('https://reminder.free.bg/reminders/id/edit');
  });
  it('does not translate a loopback URL on a different port', async () => {
    workerLocation.origin = 'http://localhost:5173';
    await emit('notificationclick', {
      action: '',
      notification: { data: { ...payload, url: 'http://127.0.0.1:5174/' }, close: vi.fn() },
    });
    expect(openWindow).not.toHaveBeenCalled();
  });
});
