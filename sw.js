// Service worker: makes the app installable and lets it open when offline.
// It always tries the network first, so people get the newest version,
// and only falls back to the saved copy when there is no connection.

const CACHE = 'event-cal-shell-v8';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    // "no-cache" makes the browser check with the server every time, so a new
    // version of the app is picked up at once instead of after the browser's
    // own cache expires (up to 10 minutes on GitHub Pages).
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((saved) => saved ?? Response.error())),
  );
});

// Phone notifications sent by the reminder sender (Sprint 4).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' ? data.title : 'plusespot';
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: typeof data.url === 'string' ? data.url : self.registration.scope },
  }));
});

// Tapping the notification opens the event, reusing an open app window if there is one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const wanted = event.notification.data?.url ?? self.registration.scope;
  // Only open addresses inside this app.
  const url = new URL(wanted, self.registration.scope);
  const target = url.href.startsWith(self.registration.scope) ? url.href : self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
        await client.navigate(target).catch(() => {});
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
