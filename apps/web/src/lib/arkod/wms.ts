import 'server-only';
import { arkodUpitUrl, parsirajArkod, type ArkodCestica } from '@m-agro/domain';

/** Javni ARKOD WMS u točki (EPSG:3765, ADR-0010). null = nema čestice; baca kod greške servisa. */
export async function arkodUTocki(lon: number, lat: number): Promise<ArkodCestica | null> {
  const r = await fetch(arkodUpitUrl(lon, lat), { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`ARKOD ${r.status}`);
  return parsirajArkod(await r.json());
}
