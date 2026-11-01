/* =====================================================================
   DEĞERLER EĞİTİMİ: ÇINARALTI HATIRALARI - ÇEVRİMDIŞI ÖNBELLEK (SERVICE WORKER)
   Meta Quest 3 & Masaüstü Tarayıcılar için HTTP 206 Range Destekli Video Önbelleği
   ===================================================================== */

const CACHE_NAME = 'cinaralti-vr-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './aframe.min.js',
  './manifest.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(CORE_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key.indexOf('cinaralti-vr-') === 0 && key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

async function buildRangeResponse(request, cachedResponse) {
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) {
    return cachedResponse;
  }

  const match = /^bytes=(\d+)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) {
    return cachedResponse;
  }

  const buffer = await cachedResponse.arrayBuffer();
  const total = buffer.byteLength;
  const start = parseInt(match[1], 10);
  const requestedEnd = match[2] ? parseInt(match[2], 10) : total - 1;
  const end = Math.min(requestedEnd, total - 1);

  if (isNaN(start) || start >= total || start > end) {
    return new Response(null, {
      status: 416,
      statusText: 'Requested Range Not Satisfiable',
      headers: {
        'Content-Range': 'bytes */' + total
      }
    });
  }

  const sliced = buffer.slice(start, end + 1);
  return new Response(sliced, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cachedResponse.headers.get('Content-Type') || 'video/mp4',
      'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
      'Content-Length': String(sliced.byteLength),
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');

  if (isNavigation) {
    // Sayfa kabuğu: Önbellekten anında aç, internet varsa arka planda sessizce güncelle
    event.respondWith(
      caches.open(CACHE_NAME).then(async function (cache) {
        const cached = (await cache.match('./index.html', { ignoreSearch: true })) ||
                       (await cache.match('./', { ignoreSearch: true })) ||
                       (await cache.match(request, { ignoreSearch: true }));

        const networkPromise = fetch(request).then(function (networkResp) {
          if (networkResp && networkResp.ok && networkResp.status === 200) {
            cache.put('./index.html', networkResp.clone());
          }
          return networkResp;
        }).catch(function () {
          return cached;
        });

        return cached || networkPromise;
      })
    );
    return;
  }

  // Videolar (.mp4) ve aframe.min.js: Önbellekte varsa interneti hiç kullanmadan 0 ms'de (Range destekli) sun
  event.respondWith(
    caches.open(CACHE_NAME).then(async function (cache) {
      const cleanUrl = url.origin + url.pathname;
      const cached = await cache.match(cleanUrl, { ignoreSearch: true });
      if (cached) {
        return buildRangeResponse(request, cached);
      }
      return fetch(request);
    })
  );
});
