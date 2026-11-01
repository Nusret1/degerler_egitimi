/* =====================================================================
   DEĞERLER EĞİTİMİ: ÇINARALTI HATIRALARI - UYGULAMA KABUĞU SERVICE WORKER (v2)
   Not: .mp4 video akışlarına ASLA müdahale etmez (tarayıcı doğal HTTP 206 Range
   motorunu kullanır); çevrimdışı video oynatma index.html içinde doğrudan
   Cache Storage -> disk-tabanlı Blob URL üzerinden sıfır gecikmeyle yapılır.
   ===================================================================== */

const SHELL_CACHE_NAME = 'cinaralti-vr-shell-v2';
const VIDEO_CACHE_NAME = 'cinaralti-vr-videos-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './aframe.min.js',
  './manifest.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then(function (cache) {
      return cache.addAll(CORE_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      const keys = await caches.keys();
      let hadLegacyV1 = false;

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key === 'cinaralti-vr-v1') {
          hadLegacyV1 = true;
        }
        if (
          key.indexOf('cinaralti-vr-') === 0 &&
          key !== SHELL_CACHE_NAME &&
          key !== VIDEO_CACHE_NAME
        ) {
          await caches.delete(key);
        }
      }

      await self.clients.claim();

      // Eski v1 önbelleğinden geçiş yapan sekmeleri tek seferlik otomatik yenileyerek yeni arayüze geçir
      if (hadLegacyV1) {
        const windowClients = await self.clients.matchAll({ type: 'window' });
        for (let c = 0; c < windowClients.length; c++) {
          const client = windowClients[c];
          if (client && typeof client.navigate === 'function') {
            try {
              await client.navigate(client.url);
            } catch (e) {}
          }
        }
      }
    })()
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // KRİTİK: .mp4 isteklerine ve arka plan önbellek indirmelerine müdahale etme!
  // Tarayıcının yerleşik C++ medya motoru HTTP 206 Range isteklerini doğrudan yönetir.
  if (url.pathname.toLowerCase().endsWith('.mp4') || url.searchParams.has('bgcache')) {
    return;
  }

  const isNavigation =
    request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html');

  if (isNavigation) {
    // Ağ-Öncelikli (Network-First): İnternet varken en güncel sayfayı getir, çevrimdışıysa önbellekten aç
    event.respondWith(
      caches.open(SHELL_CACHE_NAME).then(async function (cache) {
        try {
          const networkResp = await fetch(request, { cache: 'no-cache' });
          if (networkResp && networkResp.ok && networkResp.status === 200) {
            cache.put('./index.html', networkResp.clone());
          }
          return networkResp;
        } catch (err) {
          const cached =
            (await cache.match('./index.html', { ignoreSearch: true })) ||
            (await cache.match('./', { ignoreSearch: true })) ||
            (await cache.match(request, { ignoreSearch: true }));
          if (cached) return cached;
          throw err;
        }
      })
    );
    return;
  }

  // Uygulama kabuğu dosyaları (aframe.min.js, manifest.json): Önbellek-Öncelikli
  event.respondWith(
    caches.open(SHELL_CACHE_NAME).then(async function (cache) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      const networkResp = await fetch(request);
      if (networkResp && networkResp.ok && networkResp.status === 200) {
        cache.put(request, networkResp.clone());
      }
      return networkResp;
    })
  );
});
