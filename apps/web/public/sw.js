/* M-AGRO service worker — rad bez signala na polju (Faza 3.2).
 *
 * Strategije:
 *  - /_next/static, /maplibre, /icons ........ cache-first (nepromjenjivi, verzionirani nazivi)
 *  - stranice (navigacija) i RSC ............. network-first s timeoutom → zadnja spremljena kopija
 *  - satelitske pločice (Esri) ................ cache-first, ograničen broj (polja koja si gledao rade offline)
 *  - API, auth, Supabase, Sentinel, POST ...... uvijek mreža (nikad iz cachea)
 * Upis operacija bez signala NE ide kroz SW nego kroz red u IndexedDB-u (lib/offline).
 */
const VERZIJA = 'v1';
const STATIC = `static-${VERZIJA}`;
const STRANICE = `stranice-${VERZIJA}`;
const PLOCICE = `plocice-${VERZIJA}`;
const MAX_PLOCICA = 3000;
const TIMEOUT_MS = 5000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(['/icons/icon-192.png', '/manifest.webmanifest']).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const zadrzi = new Set([STATIC, STRANICE, PLOCICE]);
      for (const k of await caches.keys()) if (!zadrzi.has(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

// Odjava: klijent javlja da obriše spremljene stranice (sadrže podatke korisnika)
self.addEventListener('message', (e) => {
  if (e.data === 'odjava') e.waitUntil(caches.delete(STRANICE));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'server.arcgisonline.com') {
    e.respondWith(plocica(req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/maplibre/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(cacheFirst(STATIC, req));
    return;
  }

  const jeRsc = req.headers.get('RSC') === '1' || url.searchParams.has('_rsc');
  if (req.mode === 'navigate' || jeRsc) {
    // na stranici prijave nema smisla čuvati tuđe stranice (odjava / istekla sesija)
    // (odjava je server action → redirect stiže kao RSC zahtjev, zato oba slučaja)
    if (url.pathname === '/prijava' || url.pathname === '/registracija') {
      e.waitUntil(caches.delete(STRANICE));
      return;
    }
    e.respondWith(networkFirst(req, jeRsc));
  }
});

async function cacheFirst(ime, req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(ime)).put(req, res.clone());
  return res;
}

async function networkFirst(req, jeRsc) {
  const cache = await caches.open(STRANICE);
  // RSC odgovor ovisi o stanju routera → ključ samo putanja + oznaka, bez _rsc hash parametra
  const url = new URL(req.url);
  url.searchParams.delete('_rsc');
  const kljuc = jeRsc ? `${url.pathname}${url.search}#rsc` : url.href;
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS))]);
    // samo uspješne, ne-preusmjerene odgovore (redirect na /prijava se ne pamti)
    if (res.ok && !res.redirected) cache.put(kljuc, res.clone());
    return res;
  } catch {
    const hit = await cache.match(kljuc);
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const pocetna = await cache.match(new URL('/', self.location.origin).href);
      if (pocetna) return pocetna;
      return new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bez signala</title>' +
          '<body style="font-family:system-ui;padding:24px;color:#1f2937"><h1 style="color:#2f6f2f">Bez signala</h1>' +
          '<p>Ova stranica još nije otvorena dok je bilo interneta, pa nije spremljena.</p>' +
          '<p>Otvori je jednom s internetom — nakon toga radi i na polju.</p><p><a href="/">Početna</a></p>',
        { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    }
    return Response.error();
  }
}

async function plocica(req) {
  const cache = await caches.open(PLOCICE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    // grubo ograničenje: najstarije pločice van (keys() su poredani po umetanju)
    const kljucevi = await cache.keys();
    if (kljucevi.length > MAX_PLOCICA) for (const k of kljucevi.slice(0, kljucevi.length - MAX_PLOCICA)) await cache.delete(k);
  }
  return res;
}
