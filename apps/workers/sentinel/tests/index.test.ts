import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';
import { dan, dimenzije, parsirajStats, SentinelError, statsZahtjev, udioUBboxu } from '../src/lib/sentinel';

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
    expect(z.aggregation.timeRange).toEqual({ from: '2026-05-15T00:00:00Z', to: '2026-05-16T00:00:00Z' });
  });
});

describe('vremenski raspon (bug 2026-09-28)', () => {
  it('dan pokriva PUNI P1D interval — inače Statistical API vrati prazno', () => {
    const r = dan('2026-09-27');
    expect(r).toEqual({ from: '2026-09-27T00:00:00Z', to: '2026-09-28T00:00:00Z' });
    expect(Date.parse(r.to) - Date.parse(r.from)).toBe(86_400_000);
    expect(dan('2026-12-31').to).toBe('2027-01-01T00:00:00Z');
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
  it('pikseli izvan poligona NISU oblak (bug: stalno 48 %)', () => {
    // bbox 65536 px, čestica zauzima 52 % → 34079 px; 33915 čistih → ~0,5 % oblaka, ne 48 %
    const r = parsirajStats(s(65536, 31621), 0.52);
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.stats.oblacnostPct).toBeLessThan(1);
  });
  it('pola čestice pod oblakom uz udio', () => {
    const r = parsirajStats(s(1000, 750), 0.5); // 500 px čestice, 250 čistih
    expect(r).toMatchObject({ status: 'ok', stats: { oblacnostPct: 50 } });
  });
  it('greška intervala → SentinelError s porukom (ne tiho "nema snimke")', () => {
    expect(() => parsirajStats({ data: [{ error: { type: 'EXECUTION_ERROR', message: 'x' } }] })).toThrow(SentinelError);
  });
  it('udio kvadrata = 1, trokuta = 0,5', () => {
    const kv = { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
    const tr = { type: 'MultiPolygon' as const, coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] };
    expect(udioUBboxu(kv)).toBeCloseTo(1);
    expect(udioUBboxu(tr)).toBeCloseTo(0.5);
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

  it("'nema_snimke' iz cachea se ignorira i ne zapisuje (snimka može stići naknadno)", async () => {
    mockFetch((u, init) => {
      if (u.includes('/rest/v1/cestice')) return J([{ id: CID, geom_hash: 'h1', geom_arkod: GEOM }]);
      if (u.includes('/rest/v1/ndvi_cache') && (!init?.method || init.method === 'GET')) return J([{ status: 'nema_snimke', mean: null, min: null, max: null, stdev: null, percentiles: null, sample_count: null, cloud_pct: null }]);
      if (u.includes('openid-connect/token')) return J({ access_token: 't', expires_in: 600 });
      if (u.includes('/api/v1/statistics')) return J({ data: [] });
      return undefined;
    });
    const r = await call(`/stats?cestica=${CID}&datum=2026-05-15`, auth);
    expect(await r.json()).toMatchObject({ status: 'nema_snimke', izCachea: false });
    await Promise.all(waitUntil);
    expect(pozivi.some((p) => p.url.includes('/api/v1/statistics'))).toBe(true);
    expect(pozivi.some((p) => p.init?.method === 'POST' && p.url.includes('ndvi_cache'))).toBe(false);
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

describe('trend kroz sezonu', () => {
  const statsInt = (datum: string, mean: number) => ({
    interval: { from: `${datum}T00:00:00Z`, to: 'x' },
    outputs: { ndvi: { bands: { B0: { stats: { min: 0.1, max: 0.9, mean, stDev: 0.1, sampleCount: 1000, noDataCount: 0, percentiles: { '10.0': mean - 0.1, '90.0': mean + 0.1 } } } } } },
  });

  it('cache djelomičan → JEDAN Sentinel poziv samo za raspon koji fali, skupni upis s istim ključevima', async () => {
    let statsBody = '';
    mockFetch((u, init) => {
      if (u.includes('/rest/v1/cestice')) return J([{ id: CID, geom_hash: 'h1', geom_arkod: GEOM }]);
      if (u.includes('openid-connect/token')) return J({ access_token: 't', expires_in: 600 });
      if (u.includes('/catalog/')) {
        return J({ features: ['2026-06-01', '2026-06-06', '2026-06-11'].map((d) => ({ properties: { datetime: `${d}T09:50:00Z`, 'eo:cloud_cover': 3 } })) });
      }
      if (u.includes('/rest/v1/ndvi_cache') && init?.method === 'POST') return new Response(null, { status: 201 });
      if (u.includes('/rest/v1/ndvi_cache')) {
        return J([{ datum: '2026-06-01', status: 'ok', mean: 0.5, min: 0.4, max: 0.6, stdev: 0.02, percentiles: {}, sample_count: 900, cloud_pct: 0 }]);
      }
      if (u.includes('/api/v1/statistics')) {
        statsBody = String(init?.body);
        return J({ data: [statsInt('2026-06-06', 0.6), { interval: { from: '2026-06-11T00:00:00Z', to: 'x' }, outputs: { ndvi: { bands: { B0: { stats: { min: 0, max: 0, mean: 0, stDev: 0, sampleCount: 1000, noDataCount: 1000 } } } } } }] });
      }
      return undefined;
    });
    const r = await call(`/trend?cestica=${CID}`, auth);
    const body = (await r.json()) as { tocke: { datum: string; status: string; oblacnostScene: number }[] };
    expect(body.tocke.map((t) => [t.datum, t.status])).toEqual([
      ['2026-06-01', 'ok'],
      ['2026-06-06', 'ok'],
      ['2026-06-11', 'oblacno'],
    ]);
    expect(body.tocke[0]?.oblacnostScene).toBe(3);
    expect(pozivi.filter((p) => p.url.includes('/api/v1/statistics'))).toHaveLength(1);
    expect(JSON.parse(statsBody).aggregation.timeRange).toEqual({ from: '2026-06-06T00:00:00Z', to: '2026-06-12T00:00:00Z' });
    expect(statsBody).not.toMatch(/resx|resy/);
    await Promise.all(waitUntil);
    const upis = pozivi.find((p) => p.init?.method === 'POST' && p.url.includes('ndvi_cache'));
    const redovi = JSON.parse(String(upis?.init?.body)) as Record<string, unknown>[];
    expect(redovi).toHaveLength(2);
    expect(new Set(redovi.map((x) => Object.keys(x).sort().join(','))).size).toBe(1);
    expect((upis?.init?.headers as Record<string, string>).apikey).toBe('secret');
  });

  it('sve u cacheu → nula Sentinel statistika poziva', async () => {
    mockFetch((u) => {
      if (u.includes('/rest/v1/cestice')) return J([{ id: CID, geom_hash: 'h1', geom_arkod: GEOM }]);
      if (u.includes('openid-connect/token')) return J({ access_token: 't', expires_in: 600 });
      if (u.includes('/catalog/')) return J({ features: [{ properties: { datetime: '2026-06-01T09:50:00Z', 'eo:cloud_cover': 1 } }] });
      if (u.includes('/rest/v1/ndvi_cache')) return J([{ datum: '2026-06-01', status: 'ok', mean: 0.5, min: 0.4, max: 0.6, stdev: 0.02, percentiles: {}, sample_count: 900, cloud_pct: 0 }]);
      return undefined;
    });
    const r = await call(`/trend?cestica=${CID}`, auth);
    expect(r.status).toBe(200);
    expect(pozivi.some((p) => p.url.includes('/api/v1/statistics'))).toBe(false);
  });
});

describe('globalna mjesečna kvota', () => {
  it('kvota iscrpljena → 503 s porukom, BEZ Sentinel poziva; cache pogodak i dalje radi', async () => {
    mockFetch((u) => {
      if (u.includes('/rest/v1/cestice')) return J([{ id: CID, geom_hash: 'h1', geom_arkod: GEOM }]);
      if (u.includes('/rpc/sentinel_potrosi')) return J(false);
      if (u.includes('/rest/v1/ndvi_cache') && u.includes('2026-05-16')) return J([{ status: 'ok', mean: 0.7, min: 0.5, max: 0.8, stdev: 0.04, percentiles: {}, sample_count: 800, cloud_pct: 2 }]);
      if (u.includes('/rest/v1/ndvi_cache')) return J([]);
      return undefined;
    });
    const r = await call(`/stats?cestica=${CID}&datum=2026-05-15`, auth);
    expect(r.status).toBe(503);
    expect(((await r.json()) as { greska: string }).greska).toBe('kvota');
    expect(pozivi.some((p) => p.url.includes('dataspace'))).toBe(false);

    const hit = await call(`/stats?cestica=${CID}&datum=2026-05-16`, auth);
    expect(hit.status).toBe(200);
  });

  it('worker troši kvotu secret ključem, trend s više dana troši više jedinica', async () => {
    const potrosnja: number[] = [];
    mockFetch((u, init) => {
      if (u.includes('/rest/v1/cestice')) return J([{ id: CID, geom_hash: 'h1', geom_arkod: GEOM }]);
      if (u.includes('/rpc/sentinel_potrosi')) {
        expect((init?.headers as Record<string, string>).apikey).toBe('secret');
        potrosnja.push((JSON.parse(String(init?.body)) as { p_jedinice: number }).p_jedinice);
        return J(true);
      }
      if (u.includes('openid-connect/token')) return J({ access_token: 't', expires_in: 600 });
      if (u.includes('/catalog/')) return J({ features: Array.from({ length: 10 }, (_, i) => ({ properties: { datetime: `2026-06-${String(i + 1).padStart(2, '0')}T09:50:00Z`, 'eo:cloud_cover': 1 } })) });
      if (u.includes('/rest/v1/ndvi_cache') && init?.method === 'POST') return new Response(null, { status: 201 });
      if (u.includes('/rest/v1/ndvi_cache')) return J([]);
      if (u.includes('/api/v1/statistics')) return J({ data: [] });
      return undefined;
    });
    const r = await call(`/trend?cestica=${CID}`, auth);
    expect(r.status).toBe(200);
    expect(potrosnja).toEqual([1, 3]); // katalog = 1, trend za 10 dana = ceil(10/4)
  });
});

describe('slojevi NDMI / NDRE', () => {
  it('evalscripti koriste prave kanale i SCL masku', async () => {
    const { evalscriptZaSloj } = await import('../src/evalscripts');
    expect(evalscriptZaSloj('ndmi')).toMatch(/B08.*B11/s);
    expect(evalscriptZaSloj('ndre')).toMatch(/B05.*B08/s);
    for (const s of ['ndmi', 'ndre'] as const) expect(evalscriptZaSloj(s)).toContain('cist(s)');
  });
});

describe('sirovi NDVI za VRA', () => {
  it('kodiranje u evalscriptu = kodirajNdvi iz domene (0.5 → 149, −0.2 → 1, 1.0 → 255, oblak → 0)', async () => {
    const { evalscriptZaSloj } = await import('../src/evalscripts');
    const src = evalscriptZaSloj('ndvi_sirovo');
    // izvrši evaluatePixel kao Sentinel (bez mreže)
    const evaluatePixel = new Function(`${src.replace('//VERSION=3', '')}; return evaluatePixel;`)() as (s: Record<string, number>) => number[];
    const px = (b4: number, b8: number, scl = 4) => evaluatePixel({ B04: b4, B08: b8, SCL: scl, dataMask: 1 })[0];
    expect(px(0.1, 0.3)).toBe(149); // NDVI 0.5
    expect(px(0.3, 0.2)).toBe(1); // NDVI −0.2 (i niže → 1)
    expect(px(0, 0.4)).toBe(255); // NDVI 1.0
    expect(px(0.1, 0.3, 9)).toBe(0); // oblak
  });
});

describe('višegodišnji trend', () => {
  it('jedan poziv, P1M, ORBIT max-NDVI, širina/visina u pikselima (NE resx/resy), cache drugi put', async () => {
    let tijelo = '';
    let poziva = 0;
    mockFetch((u, init) => {
      if (u.includes('/rest/v1/cestice')) return J([{ id: CID, geom_hash: 'h1', geom_arkod: GEOM }]);
      if (u.includes('/rpc/sentinel_potrosi')) return J(true);
      if (u.includes('openid-connect/token')) return J({ access_token: 't', expires_in: 600 });
      if (u.includes('/api/v1/statistics')) {
        poziva++;
        tijelo = String(init?.body);
        const st = (mean: number) => ({ outputs: { ndvi: { bands: { B0: { stats: { min: 0, max: 1, mean, stDev: 0.1, sampleCount: 100, noDataCount: 0, percentiles: { '10.0': mean - 0.1, '90.0': mean + 0.1 } } } } } } });
        return J({ data: [{ interval: { from: '2017-05-01T00:00:00Z', to: 'x' }, ...st(0.8) }, { interval: { from: '2017-06-01T00:00:00Z', to: 'x' }, outputs: { ndvi: { bands: { B0: { stats: { min: 0, max: 0, mean: 0, stDev: 0, sampleCount: 100, noDataCount: 100 } } } } } }] });
      }
      return undefined;
    });
    const r = await call(`/visegodisnje?cestica=${CID}`, auth);
    const b = (await r.json()) as { mjeseci: { mjesec: string; mean: number }[] };
    expect(b.mjeseci).toEqual([{ mjesec: '2017-05', mean: 0.8, p10: expect.closeTo(0.7, 5), p90: expect.closeTo(0.9, 5) }]);
    const z = JSON.parse(tijelo);
    expect(z.aggregation.aggregationInterval.of).toBe('P1M');
    expect(z.aggregation.evalscript).toContain('mosaicking:"ORBIT"');
    expect(z.aggregation.width).toBeGreaterThan(0);
    expect(tijelo).not.toMatch(/resx|resy/);
    await Promise.all(waitUntil);
    await call(`/visegodisnje?cestica=${CID}`, auth);
    expect(poziva).toBe(1);
  });
});
