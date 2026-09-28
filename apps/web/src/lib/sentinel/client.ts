'use client';

import { z } from 'zod';
import { getAccessToken } from '../auth/browser';
import { publicEnv } from '../env';

/** Klijent za m-agro-v2-sentinel worker. Lekcija #14: timeout + jasna greška, nikad vječni spinner. */

/** Povećaj kad se promijeni izračun statistike u sentinel workeru. */
const STATS_VERZIJA = 2;

export const SLOJEVI = ['ndvi', 'kontrast', 'prave_boje', 'ndmi', 'ndre'] as const;
/** + interni sloj za VRA (sirovi NDVI, nije za prikaz) */
export type SlojZaDohvat = Sloj | 'ndvi_sirovo';
export type Sloj = (typeof SLOJEVI)[number];

const SnimkeSchema = z.object({ snimke: z.array(z.object({ datum: z.string(), oblacnost: z.number().nullable() })) });
export type Snimka = z.infer<typeof SnimkeSchema>['snimke'][number];

const StatsSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    izCachea: z.boolean().optional(),
    stats: z.object({
      mean: z.number(),
      min: z.number(),
      max: z.number(),
      stdev: z.number(),
      percentili: z.record(z.string(), z.number()),
      uzorak: z.number(),
      oblacnostPct: z.number(),
    }),
  }),
  z.object({ status: z.literal('oblacno'), oblacnostPct: z.number() }),
  z.object({ status: z.literal('nema_snimke') }),
]);
export type StatsIshod = z.infer<typeof StatsSchema>;

const TrendSchema = z.object({
  tocke: z.array(z.object({ datum: z.string(), oblacnostScene: z.number().nullable() }).and(StatsSchema)),
});
export type TrendTocka = z.infer<typeof TrendSchema>['tocke'][number];

export class SentinelKlijentGreska extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SentinelKlijentGreska';
  }
}

async function poziv(path: string, timeoutMs = 30_000): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new SentinelKlijentGreska('Prijava je istekla — osvježi stranicu.', 401);
  let r: Response;
  try {
    r = await fetch(`${publicEnv().NEXT_PUBLIC_SENTINEL_URL}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timeout = err instanceof DOMException && err.name === 'TimeoutError';
    throw new SentinelKlijentGreska(timeout ? `Satelitski servis ne odgovara (${timeoutMs / 1000} s).` : 'Nema veze s poslužiteljem.', 0);
  }
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { poruka?: string } | null;
    throw new SentinelKlijentGreska(body?.poruka ?? `Greška ${r.status}`, r.status);
  }
  return r;
}

export async function dohvatiSnimke(cesticaId: string): Promise<Snimka[]> {
  const r = await poziv(`/datumi?cestica=${cesticaId}`);
  return SnimkeSchema.parse(await r.json()).snimke;
}

export async function dohvatiStats(cesticaId: string, datum: string): Promise<StatsIshod> {
  // v = verzija izračuna: promjena poništava odgovore koje je preglednik zapamtio (max-age)
  const r = await poziv(`/stats?cestica=${cesticaId}&datum=${datum}&v=${STATS_VERZIJA}`);
  return StatsSchema.parse(await r.json());
}

/** Vraća object URL (blob:) — MapLibre ga učita bez potrebe za auth headerom. Pozivatelj radi revokeObjectURL. */
export async function dohvatiSliku(cesticaId: string, datum: string, sloj: SlojZaDohvat): Promise<string> {
  const r = await poziv(`/slika?cestica=${cesticaId}&datum=${datum}&sloj=${sloj}`, 45_000);
  return URL.createObjectURL(await r.blob());
}

/** NDVI kroz sezonu (svi datumi iz kataloga). Prvi put za česticu može trajati duže — jedan veliki Sentinel poziv. */
export async function dohvatiTrend(cesticaId: string): Promise<TrendTocka[]> {
  const r = await poziv(`/trend?cestica=${cesticaId}&v=${STATS_VERZIJA}`, 60_000);
  return TrendSchema.parse(await r.json()).tocke;
}
