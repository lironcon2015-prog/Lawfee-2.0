/**
 * sw.js — LexLedger Service Worker
 * כל פעם שמספר הגרסה ב-version.json משתנה,
 * ה-SW מוחק את הcache הישן ומוריד מחדש את כל הקבצים.
 */

const CACHE_PREFIX = 'lexledger-v';
let CACHE_NAME = CACHE_PREFIX + '1.5.0';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './db.js',
  './ui.js',
  './app.js',
  './dashboard.js',
  './clients.js',
  './invoices.js',
  './payments.js',
  './import.js',
  './settings.js',
  './version.json',
];

// ── Install ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    fetch('./version.json?_=' + Date.now())
      .then(r => r.json())
      .then(data => {
        CACHE_NAME = CACHE_PREFIX + data.version;
        return caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS));
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────
// version.json תמיד מהרשת כדי לזהות עדכונים
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('version.json')) {
    event.respondWith(
      fetch(event.request.url + '?_=' + Date.now())
        .catch(() => caches.match('./version.json'))
    );
    return;
  }

  // שאר הקבצים — cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});

// ── Message from app ───────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
