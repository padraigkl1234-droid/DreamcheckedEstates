// PWA shell caching + Firebase Cloud Messaging, in ONE service worker at the
// root scope ('/'). They used to be two separate workers — this one, and a
// second `firebase-messaging-sw.js` registered at a narrow sub-scope so it
// wouldn't fight this one for control of '/'. That narrow scope was the bug:
// Firebase's foreground relay (the thing that turns a push into an in-app
// toast while the tab is open, instead of a system notification) works by
// having the service worker find the open tab via `clients.matchAll()` — and
// a service worker can only ever see clients that fall under ITS OWN scope.
// No real page in this app is ever navigated to under that sub-scope, so the
// old messaging worker could never see the app open and the in-app toast
// path was structurally dead — every push landed as if the app were always
// backgrounded. Registering the SAME worker that already controls every page
// (this one) for messaging fixes that: `clients.matchAll()` from here
// actually finds the open tab.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Public web app config — safe to expose, it only identifies the project.
// Keep in sync with firebase-applet-config.json.
firebase.initializeApp({
  projectId: 'dream-check-estates-1441-91c82',
  appId: '1:443160194338:web:f6b2f0509333700882897b',
  apiKey: 'AIzaSyAWCQqVZs-p4-k8qJCHnof4L7BHe4osLmU',
  authDomain: 'dream-check-estates-1441-91c82.firebaseapp.com',
  storageBucket: 'dream-check-estates-1441-91c82.firebasestorage.app',
  messagingSenderId: '443160194338',
});
const messaging = firebase.messaging();

// Only reached when Firebase's own foreground-relay check finds no visible
// tab (i.e. genuinely backgrounded/closed) — see the comment above. Data-only
// messages only; one with a `notification` block is shown by the browser
// automatically, so handling both here would double up.
messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;
  const data = payload.data || {};
  const title = data.title || 'INVICTUS';
  self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  });
});

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

const CACHE_NAME = 'invictus-shell-v1';
const PRECACHE_URLS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Network-first for everything same-origin; never touch API routes or
// cross-origin calls (Firebase, fonts, etc.) so live/auth data stays fresh.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
