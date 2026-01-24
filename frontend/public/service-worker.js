// Nexus Server Service Worker
const CACHE_NAME = 'nexus-v1';

// Install event
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(self.clients.claim());
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon } = event.data;

    // Show notification even when app is in background
    self.registration.showNotification(title, {
      body: body,
      icon: icon || '/logo192.png',
      badge: '/logo192.png',
      tag: 'nexus-server',
      requireInteraction: false,
      silent: false,
      vibrate: [200, 100, 200]
    });
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Focus or open the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it
        for (let client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      })
  );
});

// Keep the service worker alive
self.addEventListener('fetch', (event) => {
  // Pass through all requests
  event.respondWith(fetch(event.request));
});
