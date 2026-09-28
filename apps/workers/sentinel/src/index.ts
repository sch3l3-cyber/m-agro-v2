/**
 * m-agro-v2-sentinel — Sentinel-2 NDVI za čestice.
 *
 *   GET /health
 *   GET /datumi?cestica=<uuid>                       dostupne snimke (zadnjih 150 dana)
 *   GET /stats?cestica=<uuid>&datum=YYYY-MM-DD        NDVI statistike (dijeljeni cache u Postgresu)
 *   GET /slika?cestica=<uuid>&datum=…&sloj=ndvi|kontrast|prave_boje|ndmi|ndre|ndvi_sirovo PNG (dijeljeni Cache API)
 *   GET /visegodisnje?cestica=<uuid>                 mjesečni max-NDVI od 2017. (Cache API 7 dana)
 *   GET /trend?cestica=<uuid>                        NDVI kroz sezonu (jedan Sentinel poziv za sve što nije u cacheu)
 *
 * Svi osim /health traže `Authorization: Bearer <Supabase JWT>`. Čestica se čita iz baze s tim
 * JWT-om, pa RLS jamči da korisnik vidi snimke samo svojih čestica.
 * Cache ključ je geom_hash (ADR-0002) → ista čestica = jedan Sentinel poziv za sve korisnike.
 */
import { z } from 'zod';
import { evalscriptZaSloj, kontrastEvalscript, SLOJEVI } from './evalscripts';
import { citajCache, citajCacheRaspon, dohvatiCesticu, KvotaIscrpljena, korisnikIzJwt, NemaPristupa, pisiCache, pisiCacheVise, potrosiKvotu, type SupabaseEnv } from './lib/supabase';
import { dostupniDatumi, getToken, SentinelError, slika, statistike, statistikeRaspon, visegodisnje, type Snimka, type StatsIshod } from './lib/sentinel';

export interface Env extends SupabaseEnv {
  ALLOWED_ORIGINS: string;
  SENTINEL_CLIENT_ID: string;
  SENTINEL_CLIENT_SECRET: string;
  /** Workers Rate Limiting binding — štiti Sentinel kvotu (samo cache promašaji se broje) */
  LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
  /** Globalni mjesečni limit jedinica (≈ Sentinel poziva). Zadano 20000 (05_ROADMAP). */
  SENTINEL_MJESECNI_LIMIT?: string;
}

const Uuid = z.uuid();
const Datum = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => d >= '2017-01-01' && d <= new Date().toISOString().slice(0, 10), 'Datum izvan raspona');
const Sloj = z.enum(SLOJEVI);

export function corsHeaders(origin: string | null, env: Pick<Env, 'ALLOWED_ORIGINS'>): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

const json = (body: unknown, status: number, h: Record<string, string>, cache = 'no-store') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache, ...h },
  });

const greska = (status: number, kod: string, poruka: string, h: Record<string, string>) => json({ greska: kod, poruka }, status, h);

function jwtIz(req: Request): string | null {
  const a = req.headers.get('authorization');
  return a?.startsWith('Bearer ') ? a.slice(7) : null;
}

/**
 * Dvije razine zaštite prije SVAKOG Sentinel poziva (cache pogoci se ne broje):
 *  1) po korisniku — Workers rate limit (false → 429 "pričekaj minutu")
 *  2) globalno po mjesecu — brojač u Postgresu (iscrpljen → KvotaIscrpljena → 503; cache i dalje radi)
 * `jedinice` ≈ trošak poziva (trend kroz sezonu troši više od jednog dana).
 */
async function smijeSentinel(env: Env, jwt: string, jedinice = 1): Promise<boolean> {
  if (env.LIMITER) {
    const { success } = await env.LIMITER.limit({ key: korisnikIzJwt(jwt) });
    if (!success) return false;
  }
  if (!(await potrosiKvotu(env, jedinice, Number(env.SENTINEL_MJESECNI_LIMIT ?? 20000)))) throw new KvotaIscrpljena();
  return true;
}

async function statsSaCacheom(env: Env, jwt: string, geomHash: string, geom: Parameters<typeof statistike>[1], datum: string, ctx: ExecutionContext) {
  const cached = await citajCache(env, jwt, geomHash, datum);
  if (cached) return { ishod: cached, izCachea: true };
  if (!(await smijeSentinel(env, jwt))) return null;
  const tok = await getToken({ clientId: env.SENTINEL_CLIENT_ID, clientSecret: env.SENTINEL_CLIENT_SECRET });
  const ishod: StatsIshod = await statistike(tok, geom, datum);
  if (ishod.status !== 'nema_snimke') ctx.waitUntil(pisiCache(env, geomHash, datum, ishod));
  return { ishod, izCachea: false };
}

/** Dostupni datumi (katalog), dijeljeni Cache API 6 h po geom_hash. null = rate limit. */
async function datumi(env: Env, jwt: string, geomHash: string, geom: Parameters<typeof statistike>[1], ctx: ExecutionContext): Promise<Snimka[] | null> {
  const kljuc = new Request(`https://cache.m-agro.internal/datumi/${geomHash}`);
  const hit = await caches.default.match(kljuc);
  if (hit) return ((await hit.json()) as { snimke: Snimka[] }).snimke;
  if (!(await smijeSentinel(env, jwt))) return null;
  const tok = await getToken({ clientId: env.SENTINEL_CLIENT_ID, clientSecret: env.SENTINEL_CLIENT_SECRET });
  const snimke = await dostupniDatumi(tok, geom);
  ctx.waitUntil(caches.default.put(kljuc, json({ snimke }, 200, {}, 'public, max-age=21600')));
  return snimke;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(req.headers.get('origin'), env);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'GET') return greska(405, 'metoda', 'Samo GET', cors);
    if (url.pathname === '/health') return json({ status: 'ok', service: 'sentinel', faza: 2 }, 200, cors);

    const jwt = jwtIz(req);
    if (!jwt) return greska(401, 'prijava', 'Potrebna je prijava', cors);

    const cid = Uuid.safeParse(url.searchParams.get('cestica'));
    if (!cid.success) return greska(400, 'validacija', 'Neispravna čestica', cors);

    try {
      const c = await dohvatiCesticu(env, jwt, cid.data);

      if (url.pathname === '/datumi') {
        const snimke = await datumi(env, jwt, c.geomHash, c.geom, ctx);
        if (!snimke) return greska(429, 'limit', 'Previše zahtjeva — pričekaj minutu', cors);
        return json({ snimke }, 200, cors, 'public, max-age=21600'); // 6 h — novi prelet je svakih 2–5 dana
      }

      if (url.pathname === '/visegodisnje') {
        const kljuc = new Request(`https://cache.m-agro.internal/visegodisnje/v1/${c.geomHash}`);
        const hit = await caches.default.match(kljuc);
        if (hit) return new Response(hit.body, { headers: { ...Object.fromEntries(hit.headers), ...cors } });
        // ~117 mjeseci u jednom pozivu — skuplje od običnog, zato veći trošak kvote
        if (!(await smijeSentinel(env, jwt, 30))) return greska(429, 'limit', 'Previše zahtjeva — pričekaj minutu', cors);
        const tok = await getToken({ clientId: env.SENTINEL_CLIENT_ID, clientSecret: env.SENTINEL_CLIENT_SECRET });
        const mjeseci = await visegodisnje(tok, c.geom, 2017);
        const res = json({ mjeseci }, 200, {}, 'private, max-age=86400');
        ctx.waitUntil(caches.default.put(kljuc, new Response(res.clone().body, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=604800' } })));
        return new Response(res.body, { headers: { ...Object.fromEntries(res.headers), ...cors } });
      }

      if (url.pathname === '/trend') {
        // Svi datumi iz kataloga: ono što nema u cacheu dohvaća se JEDNIM Statistical API pozivom (P1D kroz raspon)
        const snimke = await datumi(env, jwt, c.geomHash, c.geom, ctx);
        if (!snimke) return greska(429, 'limit', 'Previše zahtjeva — pričekaj minutu', cors);
        const svi = snimke.map((s) => s.datum).sort();
        const tocke = new Map<string, StatsIshod>();
        if (svi.length) {
          const od = svi[0] as string;
          const doD = svi[svi.length - 1] as string;
          for (const [d, i] of await citajCacheRaspon(env, jwt, c.geomHash, od, doD)) tocke.set(d, i);
          const fale = svi.filter((d) => !tocke.has(d));
          if (fale.length) {
            // trošak raste s brojem dana u rasponu (P1D intervali)
            if (!(await smijeSentinel(env, jwt, Math.max(1, Math.ceil(fale.length / 4))))) return greska(429, 'limit', 'Previše zahtjeva — pričekaj minutu', cors);
            const tok = await getToken({ clientId: env.SENTINEL_CLIENT_ID, clientSecret: env.SENTINEL_CLIENT_SECRET });
            const novo = await statistikeRaspon(tok, c.geom, fale[0] as string, fale[fale.length - 1] as string);
            const zaUpis = new Map([...novo].filter(([d]) => fale.includes(d)));
            for (const [d, i] of zaUpis) tocke.set(d, i);
            ctx.waitUntil(pisiCacheVise(env, c.geomHash, zaUpis));
          }
        }
        const oblak = new Map(snimke.map((s) => [s.datum, s.oblacnost]));
        const niz = svi.map((d) => ({ datum: d, oblacnostScene: oblak.get(d) ?? null, ...(tocke.get(d) ?? { status: 'nema_snimke' as const }) }));
        return json({ tocke: niz }, 200, cors, 'private, max-age=3600');
      }

      const datum = Datum.safeParse(url.searchParams.get('datum'));
      if (!datum.success) return greska(400, 'validacija', 'Neispravan datum', cors);

      if (url.pathname === '/stats') {
        const r = await statsSaCacheom(env, jwt, c.geomHash, c.geom, datum.data, ctx);
        if (!r) return greska(429, 'limit', 'Previše zahtjeva — pričekaj minutu', cors);
        // 'nema_snimke' se ne pamti — snimka može stići kasnije (obrada kasni za preletom)
        return json({ ...r.ishod, izCachea: r.izCachea }, 200, cors, r.ishod.status === 'nema_snimke' ? 'no-store' : 'private, max-age=86400');
      }

      if (url.pathname === '/slika') {
        const sloj = Sloj.safeParse(url.searchParams.get('sloj') ?? 'ndvi');
        if (!sloj.success) return greska(400, 'validacija', 'Nepoznat sloj', cors);
        const kljuc = new Request(`https://cache.m-agro.internal/slika/${c.geomHash}/${datum.data}/${sloj.data}.png`);
        const hit = await caches.default.match(kljuc);
        if (hit) return new Response(hit.body, { headers: { ...Object.fromEntries(hit.headers), ...cors } });

        let evalscript: string;
        if (sloj.data === 'kontrast') {
          // raspon kontrasta = p5–p95 te čestice na taj dan (sezonski kontrast iz v1)
          const r = await statsSaCacheom(env, jwt, c.geomHash, c.geom, datum.data, ctx);
          if (!r) return greska(429, 'limit', 'Previše zahtjeva — pričekaj minutu', cors);
          if (r.ishod.status !== 'ok') return greska(404, r.ishod.status, 'Nema čistih piksela za taj datum', cors);
          const p = r.ishod.stats.percentili;
          evalscript = kontrastEvalscript(p['5.0'] ?? p['5'] ?? r.ishod.stats.min, p['95.0'] ?? p['95'] ?? r.ishod.stats.max);
        } else {
          evalscript = evalscriptZaSloj(sloj.data);
        }

        if (!(await smijeSentinel(env, jwt))) return greska(429, 'limit', 'Previše zahtjeva — pričekaj minutu', cors);
        const tok = await getToken({ clientId: env.SENTINEL_CLIENT_ID, clientSecret: env.SENTINEL_CLIENT_SECRET });
        const png = await slika(tok, c.geom, datum.data, evalscript);
        // snimka za prošli datum se ne mijenja → dugi cache (30 dana)
        const res = new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=2592000, immutable' } });
        ctx.waitUntil(caches.default.put(kljuc, res.clone()));
        return new Response(res.body, { headers: { ...Object.fromEntries(res.headers), ...cors } });
      }

      return greska(404, 'nepoznato', 'Nepoznata ruta', cors);
    } catch (err) {
      if (err instanceof NemaPristupa) return greska(err.status, 'pristup', err.message, cors);
      if (err instanceof KvotaIscrpljena) {
        console.error('[sentinel] mjesečna kvota iscrpljena');
        return greska(503, 'kvota', 'Mjesečna satelitska kvota je potrošena. Već učitani podaci i dalje rade; nove snimke od 1. u mjesecu.', cors);
      }
      if (err instanceof SentinelError) {
        console.error('[sentinel]', err.message);
        return greska(502, 'sentinel', 'Satelitski servis trenutno ne odgovara. Pokušaj za minutu.', cors);
      }
      console.error('[sentinel] neočekivano', err);
      return greska(500, 'interno', 'Neočekivana greška', cors);
    }
  },
} satisfies ExportedHandler<Env>;
