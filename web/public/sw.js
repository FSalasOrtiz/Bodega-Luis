/* Service worker mínimo: muestra los avisos de solicitudes (push de Firebase o de la propia app)
   y abre la app al tocarlos. No guarda nada en caché: la app siempre se carga desde la red. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Mensaje push de Firebase Cloud Messaging: { data: { title, body, tag } }
self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (_) { p = {}; }
  const d = p.data || p.notification || {};
  e.waitUntil(self.registration.showNotification(d.title || 'Solicitud por autorizar', {
    body: d.body || 'Un vendedor pide una autorización.',
    tag: d.tag || 'solicitudes',
    renotify: true,
    requireInteraction: true,
    icon: '/brand/favicon.png',
    badge: '/brand/favicon.png',
    vibrate: [200, 100, 200],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('/');
  }));
});
