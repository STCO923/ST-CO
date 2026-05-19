// ═══════════════════════════════════════════════════════════════
// T SERVICE & CO — Service Worker v3.0
// Stratégie : HTML toujours depuis le réseau, assets statiques en cache
// ═══════════════════════════════════════════════════════════════

const CACHE_STATIC = 'ot-static-v51';
const CACHE_CDN    = 'ot-cdn-v51';

// Uniquement les assets statiques qui ne changent pas souvent
// Les fichiers HTML sont intentionnellement exclus : ils sont toujours
// récupérés depuis le réseau pour garantir la fraîcheur du contenu.
const SHELL = [
  '/lib/leaflet.js',
  '/lib/leaflet.css',
  '/fonts.css',
  '/fonts/bebas-neue-latin-400-normal.woff2',
  '/fonts/outfit-latin-300-normal.woff2',
  '/fonts/outfit-latin-400-normal.woff2',
  '/fonts/outfit-latin-500-normal.woff2',
  '/fonts/outfit-latin-600-normal.woff2',
  '/fonts/outfit-latin-700-normal.woff2',
  '/optimum_trans_demo_data.js',
  '/ot_zone.js',
  '/pwa-register.js',
  '/manifest.json',
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache =>
        Promise.allSettled(SHELL.map(url =>
          cache.add(url).catch(() => console.warn('[SW] skip:', url))
        ))
      )
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_CDN)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // 1a. Tuiles cartographiques OSM → réseau direct, jamais en cache
  if (url.hostname.endsWith('.tile.openstreetmap.org')) {
    e.respondWith(fetch(request));
    return;
  }

  // 1. Supabase → réseau uniquement (données live, jamais en cache)
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: 'Hors connexion — réessayez plus tard' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // 2. CDN externes (Leaflet, libs cartographiques) → réseau puis cache
  const isCDN = url.hostname.includes('cdnjs.cloudflare.com')
    || url.hostname.includes('cdn.jsdelivr.net')
    || url.hostname.includes('unpkg.com');

  if (isCDN) {
    e.respondWith(
      caches.open(CACHE_CDN).then(cache =>
        fetch(request)
          .then(res => { if (res.ok) cache.put(request, res.clone()); return res; })
          .catch(() => caches.match(request))
      )
    );
    return;
  }

  // 3. Pages HTML → stale-while-revalidate
  // On sert le cache instantanément (page s'ouvre tout de suite),
  // et on rafraîchit la copie en arrière-plan pour la visite suivante.
  // Si une nouvelle version arrive, pwa-register.js affiche le toast de mise à jour.
  const isHTML = request.destination === 'document'
    || url.pathname.endsWith('.html')
    || url.pathname === '/';

  if (isHTML) {
    e.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(new Request(request, { cache: 'no-store' }))
          .then(res => {
            if (res && res.ok) {
              const resClone = res.clone();
              caches.open(CACHE_STATIC).then(c => c.put(request, resClone));
            }
            return res;
          })
          .catch(() => null);
        return cached || networkFetch.then(r => r || caches.match('/index.html'));
      })
    );
    return;
  }

  // 4. Autres ressources locales (JS, images…) → stale-while-revalidate
  e.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request)
        .then(res => {
          if (res && res.ok) {
            const resClone = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(request, resClone));
          }
          return res;
        })
        .catch(() => null);
      return cached || networkFetch.then(r => r || caches.match('/index.html'));
    })
  );
});

// ── MESSAGE : forcer mise à jour ─────────────────────────────
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
