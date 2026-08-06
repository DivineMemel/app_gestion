/* Service worker — alertes NADAL SERVICES.
   Volontairement minimal : aucune mise en cache. Une quincaillerie a besoin de
   stock et de prix justes, pas d'une page servie depuis le cache d'hier. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'NADAL SERVICES', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'NADAL SERVICES';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: { url: payload.url || '/admin' },
      badge: '/icon-192.png',
      icon: '/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/admin';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Réutilise un onglet déjà ouvert sur l'app plutôt que d'en empiler un
      // nouveau à chaque notification.
      for (const client of list) {
        if (client.url.includes('/admin') && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
