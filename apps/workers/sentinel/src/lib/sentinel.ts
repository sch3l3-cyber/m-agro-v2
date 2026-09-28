/**
 * Copernicus Data Space (Sentinel Hub API).
 * Lekcija #1 (04_LEKCIJE.md): Statistics API NIKAD ne smije dobiti resx/resy — vraća 1 piksel.
 * `StatsAggregation` tip strukturno ne dopušta ta polja; test to dodatno provjerava.
 */
import { STATS_EVALSCRIPT } from '../evalscripts';

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
  evalscript: string;
}

export function statsZahtjev(g: Geometrija, datum: string) {
  const aggregation: StatsAggregation = {
    timeRange: dan(datum),
    aggregationInterval: { of: 'P1D' },
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

interface StatsOdgovor {
  data?: {
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

/** Čista funkcija — testirana bez mreže. Ispod 20 čistih piksela (~0.2 ha) statistika nije pouzdana. */
export function parsirajStats(d: StatsOdgovor): StatsIshod {
  const s = d.data?.[0]?.outputs?.ndvi?.bands?.B0?.stats;
  if (!s || s.sampleCount === 0) return { status: 'nema_snimke' };
  const cisti = s.sampleCount - s.noDataCount;
  const oblacnostPct = Math.round((s.noDataCount / s.sampleCount) * 1000) / 10;
  if (cisti < 20 || !Number.isFinite(s.mean)) return { status: 'oblacno', oblacnostPct };
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

export async function statistike(tok: string, g: Geometrija, datum: string): Promise<StatsIshod> {
  const r = await fetch(`${API}/statistics`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify(statsZahtjev(g, datum)),
  });
  if (!r.ok) throw new SentinelError(`Statistika nedostupna (${r.status})`, 502);
  return parsirajStats((await r.json()) as StatsOdgovor);
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
