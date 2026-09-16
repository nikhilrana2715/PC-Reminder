const CACHE_NAME = 'neumoremind-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './assets/icons/favicon.svg'
];

// Install Event - App Shell Caching
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - Cache Cleanup
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Clearing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Cache Network Fallback
self.addEventListener('fetch', (event) => {
  // Don't cache API requests
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => caches.match('./index.html'));
    })
  );
});

// Web Push Notification Event
self.addEventListener('push', (event) => {
  console.log('[SW] Push Received:', event);

  let data = {
    title: '⏰ Reminder Due',
    body: 'You have a scheduled reminder!',
    icon: 'assets/icons/favicon.svg',
    badge: 'assets/icons/favicon.svg',
    tag: 'reminder-notification',
    data: { url: './' },
    actions: [
      { action: 'open', title: '📖 Open' },
      { action: 'complete', title: '✓ Complete' },
      { action: 'snooze_5m', title: '💤 Snooze 5m' }
    ]
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || 'assets/icons/favicon.svg',
    badge: data.badge || 'assets/icons/favicon.svg',
    tag: data.tag || 'reminder-notification',
    data: data.data || { url: './' },
    actions: data.actions || [],
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Event & Action Handlers
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification Clicked:', event.action);
  event.notification.close();

  const reminderId = event.notification.data ? event.notification.data.reminderId : null;

  if (event.action === 'complete' && reminderId) {
    event.waitUntil(
      fetch(`/api/reminders/${reminderId}/complete`, { method: 'POST' })
        .then(() => focusOrOpenApp())
        .catch(err => console.error('[SW] Complete action failed', err))
    );
  } else if (event.action === 'snooze_5m' && reminderId) {
    event.waitUntil(
      fetch(`/api/reminders/${reminderId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: 5 })
      })
      .then(() => focusOrOpenApp())
      .catch(err => console.error('[SW] Snooze action failed', err))
    );
  } else {
    event.waitUntil(focusOrOpenApp());
  }
});

function focusOrOpenApp() {
  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        return client.focus();
      }
    }
    if (clients.openWindow) {
      return clients.openWindow('./');
    }
  });
}
