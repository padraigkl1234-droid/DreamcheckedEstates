/* Firebase Cloud Messaging background service worker.
 *
 * This runs even when the app tab is closed, so it delivers push
 * notifications for task assignments, urgent compliance, and the daily
 * summary. It uses the compat SDK loaded from Google's CDN because service
 * workers can't use ES module imports here.
 *
 * The config below is the public web app config (safe to expose — it only
 * identifies the project; it is not a secret). Keep it in sync with
 * firebase-applet-config.json.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  projectId: 'dream-check-estates-1441-91c82',
  appId: '1:443160194338:web:f6b2f0509333700882897b',
  apiKey: 'AIzaSyAWCQqVZs-p4-k8qJCHnof4L7BHe4osLmU',
  authDomain: 'dream-check-estates-1441-91c82.firebaseapp.com',
  storageBucket: 'dream-check-estates-1441-91c82.firebasestorage.app',
  messagingSenderId: '443160194338',
});

const messaging = firebase.messaging();

// Show a notification for data-only messages that arrive in the background.
// (Messages with a `notification` payload are shown by the browser
// automatically, so we only handle the data-only case to avoid duplicates.)
messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return; // browser already shows it
  const data = payload.data || {};
  const title = data.title || 'INVICTUS';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  };
  self.registration.showNotification(title, options);
});

// Focus (or open) the app when a notification is clicked.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
