'use client';

import { z } from 'zod';
import type { DanPrognoze } from '@m-agro/domain';

/** Open-Meteo (besplatno, bez ključa; CSP: connect-src api.open-meteo.com). Cache u memoriji 30 min po lokaciji. */
const Odgovor = z.object({
  daily: z.object({
    time: z.array(z.string()),
    precipitation_sum: z.array(z.number().nullable()),
    wind_speed_10m_max: z.array(z.number().nullable()),
    temperature_2m_max: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
  }),
});

const cache = new Map<string, { t: number; dani: DanPrognoze[] }>();

export async function dohvatiPrognozu(lat: number, lon: number): Promise<DanPrognoze[]> {
  const kljuc = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(kljuc);
  if (hit && Date.now() - hit.t < 30 * 60_000) return hit.dani;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    '&daily=precipitation_sum,wind_speed_10m_max,temperature_2m_max,temperature_2m_min&timezone=Europe%2FZagreb&forecast_days=7';
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Prognoza nedostupna (${r.status})`);
  const d = Odgovor.parse(await r.json()).daily;
  const dani = d.time.map((datum, i) => ({
    datum,
    kisaMm: d.precipitation_sum[i] ?? 0,
    vjetarMaxKmh: d.wind_speed_10m_max[i] ?? 0,
    tMax: d.temperature_2m_max[i] ?? 0,
    tMin: d.temperature_2m_min[i] ?? 0,
  }));
  cache.set(kljuc, { t: Date.now(), dani });
  return dani;
}
