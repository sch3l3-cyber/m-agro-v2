/**
 * Pristup Supabase REST-u iz Workera.
 *  - Čitanje čestice ide s KORISNIKOVIM JWT-om → RLS odlučuje smije li je vidjeti.
 *    Worker nikad ne vjeruje geometriji koju pošalje klijent.
 *  - Upis u dijeljeni ndvi_cache ide sa secret ključem (klijent ne smije pisati statistike).
 */
import type { Geometrija, NdviStats, StatsIshod } from './sentinel';

export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
}

export interface CesticaZaSnimke {
  id: string;
  geomHash: string;
  geom: Geometrija;
}

export class NemaPristupa extends Error {
  constructor(readonly status: 401 | 404) {
    super(status === 401 ? 'Prijava je istekla' : 'Čestica ne postoji ili nemaš pristup');
    this.name = 'NemaPristupa';
  }
}

export async function dohvatiCesticu(env: SupabaseEnv, jwt: string, id: string): Promise<CesticaZaSnimke> {
  const url = `${env.SUPABASE_URL}/rest/v1/cestice?id=eq.${encodeURIComponent(id)}&select=id,geom_hash,geom_arkod`;
  const r = await fetch(url, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${jwt}` } });
  if (r.status === 401 || r.status === 403) throw new NemaPristupa(401);
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  const rows = (await r.json()) as { id: string; geom_hash: string; geom_arkod: Geometrija }[];
  const c = rows[0];
  if (!c) throw new NemaPristupa(404);
  return { id: c.id, geomHash: c.geom_hash, geom: c.geom_arkod };
}

interface CacheRed {
  status: 'ok' | 'oblacno' | 'nema_snimke';
  mean: number | null;
  min: number | null;
  max: number | null;
  stdev: number | null;
  percentiles: Record<string, number> | null;
  sample_count: number | null;
  cloud_pct: number | null;
}

export function izCachea(r: CacheRed): StatsIshod {
  if (r.status === 'nema_snimke') return { status: 'nema_snimke' };
  if (r.status === 'oblacno' || r.mean === null) return { status: 'oblacno', oblacnostPct: r.cloud_pct ?? 100 };
  const stats: NdviStats = {
    mean: r.mean,
    min: r.min ?? r.mean,
    max: r.max ?? r.mean,
    stdev: r.stdev ?? 0,
    percentili: r.percentiles ?? {},
    uzorak: r.sample_count ?? 0,
    oblacnostPct: r.cloud_pct ?? 0,
  };
  return { status: 'ok', stats };
}

export function uCache(geomHash: string, datum: string, i: StatsIshod): Record<string, unknown> {
  const base = { geom_hash: geomHash, datum, status: i.status };
  if (i.status === 'ok') {
    const s = i.stats;
    return { ...base, mean: s.mean, min: s.min, max: s.max, stdev: s.stdev, percentiles: s.percentili, sample_count: s.uzorak, cloud_pct: s.oblacnostPct };
  }
  return { ...base, cloud_pct: i.status === 'oblacno' ? i.oblacnostPct : null, sample_count: 0 };
}

export async function citajCache(env: SupabaseEnv, jwt: string, geomHash: string, datum: string): Promise<StatsIshod | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/ndvi_cache?geom_hash=eq.${geomHash}&datum=eq.${datum}&select=status,mean,min,max,stdev,percentiles,sample_count,cloud_pct`;
  const r = await fetch(url, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${jwt}` } });
  if (!r.ok) return null; // cache je optimizacija — greška čitanja nije fatalna, ali se logira
  const rows = (await r.json()) as CacheRed[];
  return rows[0] ? izCachea(rows[0]) : null;
}

export async function pisiCache(env: SupabaseEnv, geomHash: string, datum: string, i: StatsIshod): Promise<void> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/ndvi_cache`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(uCache(geomHash, datum, i)),
  });
  if (!r.ok) console.error('[ndvi_cache] upis nije uspio', r.status, (await r.text()).slice(0, 200));
}

/** `sub` iz JWT-a — koristi se SAMO za rate limit, nakon što je PostgREST već prihvatio token. */
export function korisnikIzJwt(jwt: string): string {
  try {
    const payload = jwt.split('.')[1] ?? '';
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string };
    return json.sub ?? 'nepoznat';
  } catch {
    return 'nepoznat';
  }
}
