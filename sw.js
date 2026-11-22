/* Runeloom PWA Service Worker — scoped, bounded, privacy-conscious cache. */
'use strict';
const CACHE_PREFIX = 'runeloom-shell-';
const CACHE_NAME = CACHE_PREFIX + 'v4';
const SHELL = ['./', './index.html', './manifest.json', './icon.svg'];
const SHELL_PATHS = new Set(SHELL.map((p) => new URL(p, self.location.href).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Delete only this app's older caches; never clear unrelated origin caches.
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode === 'navigate') {
    if (request.mode === 'navigate' && request.method === 'GET') {
      event.respondWith((async () => {
        try {
          const response = await fetch(request);
          if (response && response.ok && response.type === 'basic' && !response.headers.has('Set-Cookie')) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('./index.html', response.clone());
          }
          return response;
        } catch (error) {
          return (await caches.match('./index.html')) || new Response('Offline — приложение не удалось загрузить.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
      })());
    }
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !SHELL_PATHS.has(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic' && !response.headers.has('Set-Cookie') && response.headers.get('Cache-Control')?.includes('no-store') !== true) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return cached || new Response('Ресурс недоступен офлайн.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
