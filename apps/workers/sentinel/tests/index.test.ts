import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';
import { dimenzije, parsirajStats, statsZahtjev } from '../src/lib/sentinel';

const CID = '20000000-0000-4000-8000-00000000000a';
const env: Env = {
  ALLOWED_ORIGINS: 'http://localhost:3000, https://m-agro.hr',
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_PUBLISHABLE_KEY: 'pub',
  SUPABASE_SECRET_KEY: 'secret',
  SENTINEL_CLIENT_ID: 'id',
  SENTINEL_CLIENT_SECRET: 'sec',
};
const JWT = `x.${btoa(JSON.stringify({ sub: 'user-a' }))}.y`;
const GEOM = { type: 'MultiPolygon', coordinates: [[[[18.3, 45.32], [18.31, 45.32], [18.31, 45.33], [18.3, 45.32]]]] };

const waitUntil: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => waitUntil.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://w.test${path}`, init), env, ctx);
const auth = { headers: { authorization: `Bearer ${JWT}` } };

type Poziv = { url: string; init?: RequestInit };
let pozivi: Poziv[] = [];
function mockFetch(handler: (url: string, init?: RequestInit) => Response | undefined) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    pozivi.push({ url, ...(init && { init }) });
    const r = handler(url, init);
    if (!r) throw new Error(`neočekivan fetch: ${url}`);
    return r;
  });
}
const J = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  pozivi = [];
  waitUntil.length = 0;
  const store = new Map<string, Response>();
  vi.stubGlobal('caches', {
    default: {
      match: async (r: Request) => store.get(r.url)?.clone(),
      put: async (r: Request, res: Response) => void store.set(r.url, res.clone()),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('lekcija #1 — Statistics API bez resx/resy', () => {
  it('zahtjev ne sadrži resx ni resy', () => {
    const z = statsZahtjev(GEOM as never, '2026-05-15');
    expect(JSON.stringify(z)).not.toMatch(/resx|resy/);
    expect(z.aggregation.timeRange).toEqual({ from: '2026-05-15T00:00:00Z', to: '2026-05-15T23:59:59Z' });
  });
});

describe('parsiranje statistike', () => {
  const s = (sampleCount: number, noDataCount: number) => ({
    data: [{ outputs: { ndvi: { bands: { B0: { stats: { min: 0.2, max: 0.9, mean: 0.71, stDev: 0.05, sampleCount, noDataCount, percentiles: { '5.0': 0.6, '95.0': 0.8 } } } } } } }],
  });
  it('čisti pikseli → ok s % oblačnosti', () => {
    const r = parsirajStats(s(1000, 100));
    expect(r).toMatchObject({ status: 'ok', stats: { mean: 0.71, uzorak: 900, oblacnostPct: 10 } });
  });
  it('premalo čistih piksela → oblačno (ne lažna statistika)', () => {
    expect(parsirajStats(s(1000, 990))).toEqual({ status: 'oblacno', oblacnostPct: 99 });
  });
  it('prazan odgovor → nema snimke', () => {
    expect(parsirajStats({ data: [] })).toEqual({ status: 'nema_snimke' });
  });
});

describe('dimenzije slike', () => {
  it('~10 m po pikselu, unutar 16–1024', () => {
    expect(dimenzije([18.3, 45.32, 18.31, 45.33])).toEqual({ w: 78, h: 111 });
    expect(dimenzije([18.3, 45.32, 18.3001, 45.3201]).w).toBe(16);
    expect(dimenzije([15, 43, 19, 46]).w).toBe(1024);
  });
});

describe('rute i autorizacija', () => {
  it('/health bez prijave', async () => {
    expect((await call('/health')).status).toBe(200);
  });
  it('bez JWT-a → 401', async () => {
    expect((await call(`/stats?cestica=${CID}&datum=2026-05-15`)).status).toBe(401);
  });
  it('neispravan UUID → 400', async () => {
    expect((await call('/stats?cestica=abc&datum=2026-05-15', auth)).status).toBe(400);
  });
  it('datum u budućnosti → 400', async () => {
    mockFetch((u) => (u.includes('/rest/v1/cestice') ? J([{ id: CID, geom_hash: 'h1', geom_arkod: GEOM }]) : undefined));
    expect((await call(`/stats?cestica=${CID}&datum=2999-01-01`, auth)).status).toBe(400);
  });
  it('tuđa čestica (RLS vrati prazno) → 404, Sentinel se NE zove', async () => {
    mockFetch((u) => (u.includes('/rest/v1/cestice') ? J([]) : undefined));
    expect((await call(`/stats?cestica=${CID}&datum=2026-05-15`, auth)).status).toBe(404);
    expect(pozivi.some((p) => p.url.includes('dataspace'))).toBe(false);
  });
  it('čestica se čita s KORISNIKOVIM JWT-om (RLS), ne sa secret ključem', async () => {
    mockFetch((u) => (u.includes('/rest/v1/cestice') ? J([]) : undefined));
    await call(`/stats?cestica=${CID}&datum=2026-05-15`, auth);
    const h = pozivi[0]?.init?.headers as Record<string, string>;
    expect(h.authorization).toBe(`Bearer ${JWT}`);
    expect(h.apikey).toBe('pub');
  });
});

describe('dijeljeni cache (07_FREE_TIER_STRATEGY)', () => {
  it('cache pogodak → nema Sentinel poziva', async () => {
    mockFetch((u) => {
      if (u.includes('/rest/v1/cestice')) return J([{ id: CID, geom_hash: 'h1', geom_arkod: GEOM }]);
      if (u.includes('/rest/v1/ndvi_cache')) return J([{ status: 'ok', mean: 0.7, min: 0.5, max: 0.8, stdev: 0.04, percentiles: {}, sample_count: 800, cloud_pct: 2 }]);
      return undefined;
    });
    const r = await call(`/stats?cestica=${CID}&datum=2026-05-15`, auth);
    expect(await r.json()).toMatchObject({ status: 'ok', izCachea: true, stats: { mean: 0.7 } });
    expect(pozivi.some((p) => p.url.includes('dataspace'))).toBe(false);
  });

  it('promašaj → Sentinel + upis u cache sa secret ključem, ključ = geom_hash', async () => {
    mockFetch((u, init) => {
      if (u.includes('/rest/v1/cestice')) return J([{ id: CID, geom_hash: 'h1', geom_arkod: GEOM }]);
      if (u.includes('/rest/v1/ndvi_cache') && (!init?.method || init.method === 'GET')) return J([]);
      if (u.includes('/rest/v1/ndvi_cache') && init?.method === 'POST') return new Response(null, { status: 201 });
      if (u.includes('openid-connect/token')) return J({ access_token: 't', expires_in: 600 });
      if (u.includes('/api/v1/statistics')) {
        expect(String(init?.body)).not.toMatch(/resx|resy/);
        return J({ data: [{ outputs: { ndvi: { bands: { B0: { stats: { min: 0.3, max: 0.9, mean: 0.66, stDev: 0.1, sampleCount: 500, noDataCount: 0 } } } } } }] });
      }
      return undefined;
    });
    const r = await call(`/stats?cestica=${CID}&datum=2026-05-15`, auth);
    expect(await r.json()).toMatchObject({ status: 'ok', izCachea: false });
    await Promise.all(waitUntil);
    const upis = pozivi.find((p) => p.init?.method === 'POST' && p.url.includes('ndvi_cache'));
    expect((upis?.init?.headers as Record<string, string>).apikey).toBe('secret');
    expect(JSON.parse(String(upis?.init?.body))).toMatchObject({ geom_hash: 'h1', datum: '2026-05-15', status: 'ok' });
  });

  it('rate limit iscrpljen → 429 prije Sentinel poziva', async () => {
    mockFetch((u) => {
      if (u.includes('/rest/v1/cestice')) return J([{ id: CID, geom_hash: 'h1', geom_arkod: GEOM }]);
      if (u.includes('/rest/v1/ndvi_cache')) return J([]);
      return undefined;
    });
    const envLimit = { ...env, LIMITER: { limit: async () => ({ success: false }) } };
    const r = await worker.fetch(new Request(`https://w.test/stats?cestica=${CID}&datum=2026-05-15`, auth), envLimit, ctx);
    expect(r.status).toBe(429);
  });
});

describe('CORS', () => {
  it('samo dozvoljeni origin', async () => {
    const ok = await call('/health', { headers: { origin: 'https://m-agro.hr' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://m-agro.hr');
    const bad = await call('/health', { headers: { origin: 'https://evil.com' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('preflight dopušta Authorization header', async () => {
    const r = await call('/stats', { method: 'OPTIONS', headers: { origin: 'http://localhost:3000' } });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-headers')).toContain('authorization');
  });
});
