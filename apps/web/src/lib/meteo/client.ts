'use client';

import type { DanPrognoze } from '@m-agro/domain';
import { dohvatiOpenMeteo } from './openmeteo';

/** CSP: connect-src api.open-meteo.com. Cache u memoriji 30 min po lokaciji. */
const cache = new Map<string, { t: number; dani: DanPrognoze[] }>();

export async function dohvatiPrognozu(lat: number, lon: number): Promise<DanPrognoze[]> {
  const kljuc = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(kljuc);
  if (hit && Date.now() - hit.t < 30 * 60_000) return hit.dani;
  const dani = await dohvatiOpenMeteo(lat, lon);
  cache.set(kljuc, { t: Date.now(), dani });
  return dani;
}
