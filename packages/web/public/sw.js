/// <reference lib="webworker" />

// Service Worker pour les notifications push SourceKuizz

declare const self: ServiceWorkerGlobalScope;

// Installation du service worker
self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  self.skipWaiting();
});

// Activation
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(self.clients.claim());
});

// Réception d'une notification push
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');

  if (!event.data) {
    console.log('[SW] No data in push event');
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'SourceKuizz',
      body: event.data.text(),
    };
  }

  const options: NotificationOptions = {
    body: payload.body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/badge-72.png',
    data: payload.data || {},
    actions: payload.actions || [],
    tag: payload.data?.type || 'default',
    renotify: true,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// Clic sur une notification
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action);
  
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = '/';

  // Déterminer l'URL en fonction du type de notification
  switch (data.type) {
    case 'game-invite':
      if (event.action === 'join' && data.sessionCode) {
        targetUrl = `/play/${data.sessionCode}`;
      }
      break;
    case 'game-start':
      if (data.sessionCode) {
        targetUrl = `/play/${data.sessionCode}`;
      }
      break;
    default:
      targetUrl = '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Chercher si une fenêtre est déjà ouverte
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return;
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Fermeture de notification
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed');
});

export {};
