/* The production build stamps this version and asset list. Never cache API/auth responses. */
const VERSION = 'reminder-dev';
const SHELL_ASSETS = ['/offline.html', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL_ASSETS)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('reminder-') && key !== VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(
        async () => (await caches.match('/index.html')) || (await caches.match('/offline.html')),
      ),
    );
  } else if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
});
self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'A little reminder', body: 'Open Reminder to see what’s next.', url: '/' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Reminder', {
      body: data.body || 'A little less to keep in mind.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: `reminder-${data.occurrenceId || 'default'}-${data.generation || 0}`,
      renotify: false,
      data,
      actions: [
        { action: 'done', title: 'Done' },
        { action: 'snooze', title: 'Snooze' },
      ],
    }),
  );
});
async function openReminder(data) {
  const target = new URL(data.url || '/', self.location.origin);
  const local = new URL(self.location.origin);
  if (
    ['localhost', '127.0.0.1'].includes(local.hostname) &&
    ['localhost', '127.0.0.1'].includes(target.hostname) &&
    target.protocol === local.protocol &&
    target.port === local.port
  )
    target.hostname = local.hostname;
  if (target.origin !== self.location.origin) return;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin === target.origin) {
      await client.navigate(target.href);
      await client.focus();
      return;
    }
  }
  await self.clients.openWindow(target.href);
}
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  event.waitUntil(
    (async () => {
      if (!['done', 'snooze'].includes(event.action) || !data.actionUrl) {
        await openReminder(data);
        return;
      }
      try {
        const response = await fetch(data.actionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(data.gatewayKey
              ? { Authorization: `Bearer ${data.gatewayKey}`, apikey: data.gatewayKey }
              : {}),
          },
          body: JSON.stringify({
            occurrenceId: data.occurrenceId,
            token: data.token,
            generation: data.generation,
            action: event.action,
          }),
        });
        if (!response.ok) throw new Error('Action failed');
      } catch {
        await self.registration.showNotification('Couldn’t update your reminder', {
          body: 'Check your connection. Tap here to reopen this notification and try again.',
          icon: '/icons/icon-192.png',
          tag: `reminder-${data.occurrenceId}-${data.generation}`,
          data,
          actions: [
            { action: 'done', title: 'Done' },
            { action: 'snooze', title: 'Snooze' },
          ],
        });
        await openReminder(data);
      }
    })(),
  );
});
