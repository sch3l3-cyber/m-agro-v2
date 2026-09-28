/**
 * Copernicus Data Space (Sentinel Hub API).
 * Lekcija #1 (04_LEKCIJE.md): Statistics API NIKAD ne smije dobiti resx/resy — vraća 1 piksel.
 * `StatsAggregation` tip strukturno ne dopušta ta polja; test to dodatno provjerava.
 */
import { MAX_NDVI_EVALSCRIPT, STATS_EVALSCRIPT } from '../evalscripts';

const TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const API = 'https://sh.dataspace.copernicus.eu/api/v1';
const CRS84 = 'http://www.opengis.net/def/crs/OGC/1.3/CRS84';

export interface SentinelCreds {
  clientId: string;
  clientSecret: string;
}

export type Geometrija = { type: 'MultiPolygon' | 'Polygon'; coordinates: unknown };

let token: { value: string; exp: number } | null = null;

export async function getToken(c: SentinelCreds, now = Date.now()): Promise<string> {
  if (token && now < token.exp) return token.value;
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.clientSecret }),
  });
  if (!r.ok) throw new SentinelError(`Prijava na Copernicus nije uspjela (${r.status})`, 502);
  const d = (await r.json()) as { access_token: string; expires_in: number };
  token = { value: d.access_token, exp: now + (d.expires_in - 60) * 1000 };
  return token.value;
}

export class SentinelError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SentinelError';
  }
}

export function dan(datum: string): { from: string; to: string } {
  // Cijeli UTC dan snimanja (Sentinel-2 preleti Hrvatsku oko 09:40 UTC).
  // `to` je ponoć SLJEDEĆEG dana: Statistical API vraća samo PUNE P1D intervale,
  // pa bi 23:59:59 dao 0 intervala → prazan odgovor → lažno "nema snimke" (bug 2026-09-28).
  const d = new Date(`${datum}T00:00:00Z`);
  const sutra = new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10);
  return { from: `${datum}T00:00:00Z`, to: `${sutra}T00:00:00Z` };
}

export function bbox(g: Geometrija): [number, number, number, number] {
  let [a, b, c, d] = [180, 90, -180, -90];
  const walk = (x: unknown): void => {
    if (Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'number') {
      a = Math.min(a, x[0]);
      b = Math.min(b, x[1]);
      c = Math.max(c, x[0]);
      d = Math.max(d, x[1]);
    } else if (Array.isArray(x)) x.forEach(walk);
  };
  walk(g.coordinates);
  return [a, b, c, d];
}

/**
 * Udio površine čestice u njenom bboxu (0–1]. Statistical API bez resx/resy uzorkuje CIJELI bbox
 * (~256×256), a pikseli izvan poligona broje se u noDataCount — bez ove korekcije
 * "oblačnost" bi bila samo udio praznog prostora oko kose čestice (bug 2026-09-28: stalno 48 %).
 * Planarni shoelace u stupnjevima je dovoljno točan jer se dijeli s bboxom u istim jedinicama.
 */
export function udioUBboxu(g: Geometrija): number {
  const prsten = (r: number[][]) => {
    let a = 0;
    let prev = r[r.length - 1] ?? [0, 0];
    for (const cur of r) {
      a += ((prev[0] ?? 0) + (cur[0] ?? 0)) * ((prev[1] ?? 0) - (cur[1] ?? 0));
      prev = cur;
    }
    return Math.abs(a) / 2;
  };
  const poligon = (p: number[][][]) => p.reduce((sum, r, i) => sum + (i === 0 ? prsten(r) : -prsten(r)), 0);
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][];
  const povrsina = polys.reduce((sum, p) => sum + poligon(p), 0);
  const [w, s, e, n] = bbox(g);
  const bboxPov = (e - w) * (n - s);
  if (!(bboxPov > 0) || !(povrsina > 0)) return 1;
  return Math.min(1, povrsina / bboxPov);
}

// ---------------------------------------------------------------- katalog (dostupni datumi)
export interface Snimka {
  datum: string;
  oblacnost: number | null; // % oblaka cijele scene (ne čestice)
}

export async function dostupniDatumi(tok: string, g: Geometrija, danaUnazad = 150): Promise<Snimka[]> {
  const to = new Date();
  const from = new Date(to.getTime() - danaUnazad * 86_400_000);
  const r = await fetch(`${API}/catalog/1.0.0/search`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      datetime: `${from.toISOString()}/${to.toISOString()}`,
      bbox: bbox(g),
      limit: 100,
      fields: { include: ['properties.datetime', 'properties.eo:cloud_cover'], exclude: ['assets', 'links'] },
    }),
  });
  if (!r.ok) throw new SentinelError(`Katalog snimaka nedostupan (${r.status})`, 502);
  const d = (await r.json()) as { features?: { properties: { datetime: string; 'eo:cloud_cover'?: number } }[] };
  const poDanu = new Map<string, number | null>();
  for (const f of d.features ?? []) {
    const datum = f.properties.datetime.slice(0, 10);
    const cc = f.properties['eo:cloud_cover'] ?? null;
    const prije = poDanu.get(datum);
    // više scena isti dan → uzmi najmanje oblačnu
    if (prije === undefined || (cc !== null && (prije === null || cc < prije))) poDanu.set(datum, cc);
  }
  return [...poDanu.entries()]
    .map(([datum, oblacnost]) => ({ datum, oblacnost }))
    .sort((x, y) => y.datum.localeCompare(x.datum));
}

// ---------------------------------------------------------------- statistike
/** Namjerno bez resx/resy — vidi lekciju #1. */
export interface StatsAggregation {
  timeRange: { from: string; to: string };
  aggregationInterval: { of: 'P1D' | 'P3M' };
  /** SHORTEN: nepotpun zadnji interval (npr. današnji dan) se skrati umjesto da se preskoči */
  lastIntervalBehavior: 'SHORTEN';
  evalscript: string;
}

export function statsZahtjev(g: Geometrija, datum: string) {
  return statsRasponZahtjev(g, dan(datum));
}

/** Jedan zahtjev za više dana: P1D intervali od `from` do `to` (isključivo). */
export function statsRasponZahtjev(g: Geometrija, timeRange: { from: string; to: string }) {
  const aggregation: StatsAggregation = {
    timeRange,
    aggregationInterval: { of: 'P1D' },
    lastIntervalBehavior: 'SHORTEN',
    evalscript: STATS_EVALSCRIPT,
  };
  return {
    input: { bounds: { geometry: g, properties: { crs: CRS84 } }, data: [{ type: 'sentinel-2-l2a' }] },
    aggregation,
    calculations: { ndvi: { statistics: { default: { percentiles: { k: [5, 10, 25, 50, 75, 90, 95] } } } } },
  };
}

export interface NdviStats {
  mean: number;
  min: number;
  max: number;
  stdev: number;
  percentili: Record<string, number>;
  /** broj čistih (neoblačnih) piksela */
  uzorak: number;
  /** % piksela čestice pokriven oblakom/sjenom */
  oblacnostPct: number;
}

export type StatsIshod = { status: 'ok'; stats: NdviStats } | { status: 'oblacno'; oblacnostPct: number } | { status: 'nema_snimke' };

type StatsInterval = NonNullable<StatsOdgovor['data']>[number];

interface StatsOdgovor {
  data?: {
    interval?: { from: string; to: string };
    error?: { type?: string; message?: string };
    outputs?: {
      ndvi?: {
        bands?: {
          B0?: {
            stats?: { min: number; max: number; mean: number; stDev: number; sampleCount: number; noDataCount: number; percentiles?: Record<string, number> };
          };
        };
      };
    };
  }[];
}

/**
 * Čista funkcija — testirana bez mreže.
 * `udio` = udioUBboxu(geometrija): koliki dio uzorkovanih piksela je stvarno unutar čestice.
 * Ispod 10 % čistih piksela čestice (ili < 20 piksela) statistika nije pouzdana → 'oblacno'.
 */
export function parsirajStats(d: StatsOdgovor, udio = 1): StatsIshod {
  const interval = d.data?.[0];
  if (interval?.error) throw new SentinelError(`Sentinel nije izračunao statistiku: ${interval.error.message ?? interval.error.type ?? 'nepoznato'}`, 502);
  return parsirajInterval(interval, udio);
}

function parsirajInterval(interval: StatsInterval | undefined, udio: number): StatsIshod {
  const s = interval?.outputs?.ndvi?.bands?.B0?.stats;
  if (!s || s.sampleCount === 0) return { status: 'nema_snimke' };
  const cisti = s.sampleCount - s.noDataCount;
  const uCestici = Math.max(cisti, s.sampleCount * udio);
  const oblacnostPct = Math.round(((uCestici - cisti) / uCestici) * 1000) / 10;
  if (cisti < 20 || cisti / uCestici < 0.1 || !Number.isFinite(s.mean)) return { status: 'oblacno', oblacnostPct };
  return {
    status: 'ok',
    stats: {
      mean: s.mean,
      min: s.min,
      max: s.max,
      stdev: s.stDev,
      percentili: s.percentiles ?? {},
      uzorak: cisti,
      oblacnostPct,
    },
  };
}

/**
 * Niz intervala (P1D kroz sezonu) → ishod po datumu. Intervali s greškom se preskaču
 * (logiraju), da jedan loš dan ne sruši cijeli trend.
 */
export function parsirajNiz(d: StatsOdgovor, udio = 1): Map<string, StatsIshod> {
  const out = new Map<string, StatsIshod>();
  for (const it of d.data ?? []) {
    const datum = it.interval?.from.slice(0, 10);
    if (!datum) continue;
    if (it.error) {
      console.warn('[trend] interval s greškom', datum, it.error.message ?? it.error.type);
      continue;
    }
    out.set(datum, parsirajInterval(it, udio));
  }
  return out;
}

export async function statistike(tok: string, g: Geometrija, datum: string): Promise<StatsIshod> {
  const r = await fetch(`${API}/statistics`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify(statsZahtjev(g, datum)),
  });
  if (!r.ok) throw new SentinelError(`Statistika nedostupna (${r.status})`, 502);
  const odg = (await r.json()) as StatsOdgovor;
  if (!odg.data?.length) console.warn('[stats] prazan odgovor', datum, JSON.stringify(odg).slice(0, 500));
  return parsirajStats(odg, udioUBboxu(g));
}

/** Trend: statistike za sve dane u rasponu [od, do] (datumi YYYY-MM-DD, uključivo) jednim pozivom. */
export async function statistikeRaspon(tok: string, g: Geometrija, od: string, doDatum: string): Promise<Map<string, StatsIshod>> {
  const r = await fetch(`${API}/statistics`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify(statsRasponZahtjev(g, { from: dan(od).from, to: dan(doDatum).to })),
  });
  if (!r.ok) throw new SentinelError(`Statistika nedostupna (${r.status})`, 502);
  return parsirajNiz((await r.json()) as StatsOdgovor, udioUBboxu(g));
}

// ---------------------------------------------------------------- slika
/** Dimenzije u pikselima ~10 m (izvorna rezolucija Sentinela-2), 16–1024. */
export function dimenzije(b: [number, number, number, number]): { w: number; h: number } {
  const lat = (b[1] + b[3]) / 2;
  const wM = (b[2] - b[0]) * 111_320 * Math.cos((lat * Math.PI) / 180);
  const hM = (b[3] - b[1]) * 110_574;
  const c = (m: number) => Math.min(1024, Math.max(16, Math.round(m / 10)));
  return { w: c(wM), h: c(hM) };
}

export async function slika(tok: string, g: Geometrija, datum: string, evalscript: string): Promise<ArrayBuffer> {
  const b = bbox(g);
  const { w, h } = dimenzije(b);
  const r = await fetch(`${API}/process`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json', accept: 'image/png' },
    body: JSON.stringify({
      // geometrija (ne bbox) → sve izvan čestice je prozirno
      input: { bounds: { geometry: g, properties: { crs: CRS84 } }, data: [{ type: 'sentinel-2-l2a', dataFilter: { timeRange: dan(datum) } }] },
      output: { width: w, height: h, responses: [{ identifier: 'default', format: { type: 'image/png' } }] },
      evalscript,
    }),
  });
  const ct = r.headers.get('content-type') ?? '';
  if (!r.ok || !ct.includes('image/png')) throw new SentinelError(`Snimka nedostupna (${r.status})`, 502);
  return r.arrayBuffer();
}

// ---------------------------------------------------------------- višegodišnji trend
export interface MjesecNdvi {
  /** YYYY-MM */
  mjesec: string;
  mean: number;
  p10: number | null;
  p90: number | null;
}

/**
 * Mjesečni max-NDVI od `odGodine` do danas, JEDNIM pozivom (P1M intervali).
 * Širina/visina u PIKSELIMA (~10 m) — to nije resx/resy (lekcija #1 se odnosi na stupnjeve u CRS84);
 * bez njih bi API uzorkovao 256×256 i trošio ~100× više jedinica za malu česticu.
 */
export function visegodisnjeZahtjev(g: Geometrija, odGodine: number, danas = new Date()) {
  const { w, h } = dimenzije(bbox(g));
  const doMj = new Date(Date.UTC(danas.getUTCFullYear(), danas.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  return {
    input: { bounds: { geometry: g, properties: { crs: CRS84 } }, data: [{ type: 'sentinel-2-l2a' }] },
    aggregation: {
      timeRange: { from: `${odGodine}-01-01T00:00:00Z`, to: `${doMj}T00:00:00Z` },
      aggregationInterval: { of: 'P1M' },
      lastIntervalBehavior: 'SHORTEN',
      width: w,
      height: h,
      evalscript: MAX_NDVI_EVALSCRIPT,
    },
    calculations: { ndvi: { statistics: { default: { percentiles: { k: [10, 90] } } } } },
  };
}

export function parsirajVisegodisnje(d: StatsOdgovor, udio: number): MjesecNdvi[] {
  const out: MjesecNdvi[] = [];
  for (const it of d.data ?? []) {
    const mj = it.interval?.from.slice(0, 7);
    const i = parsirajInterval(it, udio);
    if (!mj || i.status !== 'ok') continue;
    const p = i.stats.percentili;
    out.push({ mjesec: mj, mean: i.stats.mean, p10: p['10.0'] ?? p['10'] ?? null, p90: p['90.0'] ?? p['90'] ?? null });
  }
  return out;
}

export async function visegodisnje(tok: string, g: Geometrija, odGodine: number): Promise<MjesecNdvi[]> {
  const r = await fetch(`${API}/statistics`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify(visegodisnjeZahtjev(g, odGodine)),
  });
  if (!r.ok) throw new SentinelError(`Višegodišnja statistika nedostupna (${r.status}) ${(await r.text()).slice(0, 200)}`, 502);
  return parsirajVisegodisnje((await r.json()) as StatsOdgovor, udioUBboxu(g));
}
