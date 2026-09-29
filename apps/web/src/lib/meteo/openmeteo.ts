import { z } from 'zod';
import type { DanPrognoze } from '@m-agro/domain';

/** Open-Meteo (besplatno, bez ključa). Dijele ga preglednik (client.ts) i server (AI savjetnik). */
const Odgovor = z.object({
  daily: z.object({
    time: z.array(z.string()),
    precipitation_sum: z.array(z.number().nullable()),
    wind_speed_10m_max: z.array(z.number().nullable()),
    temperature_2m_max: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
  }),
});

export async function dohvatiOpenMeteo(lat: number, lon: number, timeoutMs = 15_000): Promise<DanPrognoze[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    '&daily=precipitation_sum,wind_speed_10m_max,temperature_2m_max,temperature_2m_min&timezone=Europe%2FZagreb&forecast_days=7';
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`Prognoza nedostupna (${r.status})`);
  const d = Odgovor.parse(await r.json()).daily;
  return d.time.map((datum, i) => ({
    datum,
    kisaMm: d.precipitation_sum[i] ?? 0,
    vjetarMaxKmh: d.wind_speed_10m_max[i] ?? 0,
    tMax: d.temperature_2m_max[i] ?? 0,
    tMin: d.temperature_2m_min[i] ?? 0,
  }));
}
