// Stub service worker — désenregistre les anciens SW s'il y en a, puis se retire.
// Sert à silencer le 404 /sw.js dû à un ancien essai PWA dans le navigateur.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const regs = await self.registration?.unregister?.();
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach((c) => c.navigate(c.url));
      return regs;
    })(),
  );
});
