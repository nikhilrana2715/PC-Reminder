const CACHE_NAME = 'neumoremind-v6-icons-ui';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-192.png',
  './assets/icons/icon-maskable-512.png'
];

// Install Event - App Shell Caching
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching fresh app shell');
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

// Fetch Event - Network-First Strategy for Instant Live Updates
self.addEventListener('fetch', (event) => {
  // Don't cache API requests
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request) || caches.match('./index.html'))
  );
});

// Web Push Notification Event (fires even when UI is closed)
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
      { action: 'complete', title: '✓ Complete' },
      { action: 'snooze_10m', title: '💤 Snooze 10m' },
      { action: 'open', title: '📖 Open App' }
    ]
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const reminderId = data.data && data.data.reminderId ? data.data.reminderId : (data.tag || 'reminder');

  const options = {
    body: data.body,
    icon: data.icon || 'assets/icons/favicon.svg',
    badge: data.badge || 'assets/icons/favicon.svg',
    tag: reminderId, // Disambiguation: tag with task ID so each reminder has its own OS notification
    data: data.data || { reminderId, url: './' },
    actions: data.actions && data.actions.length > 0 ? data.actions : [
      { action: 'complete', title: '✓ Complete' },
      { action: 'snooze_10m', title: '💤 Snooze 10m' },
      { action: 'open', title: '📖 Open App' }
    ],
    requireInteraction: true,
    vibrate: [250, 150, 250, 150, 350]
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
  const action = event.action;

  if (action === 'complete' && reminderId) {
    event.waitUntil(
      Promise.all([
        broadcastToClients({ type: 'NOTIFICATION_ACTION', action: 'complete', reminderId }),
        fetch(`/api/reminders/${reminderId}/complete`, { method: 'POST' }).catch(() => {}),
        updateIndexedDBTask(reminderId, { completed: 1, completionStatus: 'completed', reminderStatus: 'completed' })
      ]).then(() => focusOrOpenApp())
    );
  } else if (action && action.startsWith('snooze') && reminderId) {
    const match = action.match(/^snooze_(\d+)m$/);
    const minutes = match ? parseInt(match[1], 10) : 10;

    event.waitUntil(
      Promise.all([
        broadcastToClients({ type: 'NOTIFICATION_ACTION', action: 'snooze', reminderId, minutes }),
        fetch(`/api/reminders/${reminderId}/snooze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minutes })
        }).catch(() => {}),
        snoozeIndexedDBTask(reminderId, minutes)
      ]).then(() => focusOrOpenApp())
    );
  } else {
    event.waitUntil(focusOrOpenApp());
  }
});

// Message Event from foreground clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION' && event.data.task) {
    const task = event.data.task;
    const options = {
      body: task.body || task.description || 'Reminder scheduled time reached',
      icon: 'assets/icons/favicon.svg',
      badge: 'assets/icons/favicon.svg',
      tag: task.id,
      data: { reminderId: task.id, url: './' },
      actions: [
        { action: 'complete', title: '✓ Complete' },
        { action: 'snooze_10m', title: '💤 Snooze 10m' },
        { action: 'open', title: '📖 Open App' }
      ],
      requireInteraction: true,
      vibrate: [250, 150, 250, 150, 350]
    };
    self.registration.showNotification(`⏰ ${task.title}`, options);
  }
});

// Helper: Open or focus active browser window
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

// Helper: Broadcast message to all open tabs/PWA windows
async function broadcastToClients(message) {
  try {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      client.postMessage(message);
    }
  } catch (e) {
    console.warn('[SW] Broadcast to clients failed:', e);
  }
}

// Helper: Open IndexedDB directly from Service Worker
function openLocalDB() {
  return new Promise((resolve) => {
    if (!('indexedDB' in self)) return resolve(null);
    const req = indexedDB.open('neumoremind_idb_v2', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

// Helper: Update task directly in IndexedDB from Service Worker action
async function updateIndexedDBTask(id, updates) {
  try {
    const db = await openLocalDB();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction('reminders', 'readwrite');
      const store = tx.objectStore('reminders');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (item) {
          const updated = {
            ...item,
            ...updates,
            updatedAt: Date.now(),
            updated_at: Date.now()
          };
          store.put(updated);
        }
        resolve(true);
      };
      getReq.onerror = () => resolve(false);
    });
  } catch (e) {
    console.warn('[SW] IndexedDB update task error:', e);
  }
}

// Helper: Snooze task directly in IndexedDB from Service Worker action
async function snoozeIndexedDBTask(id, minutes = 10) {
  try {
    const db = await openLocalDB();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction('reminders', 'readwrite');
      const store = tx.objectStore('reminders');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (item) {
          const now = new Date();
          now.setMinutes(now.getMinutes() + minutes);
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, '0');
          const d = String(now.getDate()).padStart(2, '0');
          const hh = String(now.getHours()).padStart(2, '0');
          const mm = String(now.getMinutes()).padStart(2, '0');
          const updated = {
            ...item,
            date: `${y}-${m}-${d}`,
            time: `${hh}:${mm}`,
            scheduled_at: `${y}-${m}-${d}T${hh}:${mm}:00`,
            reminderStatus: 'snoozed',
            snoozed_until: now.toISOString(),
            updatedAt: Date.now(),
            updated_at: Date.now()
          };
          store.put(updated);
        }
        resolve(true);
      };
      getReq.onerror = () => resolve(false);
    });
  } catch (e) {
    console.warn('[SW] IndexedDB snooze task error:', e);
  }
}
