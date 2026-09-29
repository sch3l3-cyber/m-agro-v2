import { z } from 'zod';
import { assertWGS84, type RawMultiPolygon } from './geo';
import { htrs96UWgs84, wgs84UHtrs96 } from './htrs96';

/**
 * Javni ARKOD WMS APPRRR-a (ADR-0010). Upit UVIJEK u EPSG:3765 — u 4326 servis zaokružuje koordinate na ~10 m.
 * `jpaid` (pseudonim nositelja, ADR-0011) se namjerno NE čita ni ne vraća.
 */
export const ARKOD_WMS = 'https://servisi.apprrr.hr/NIPP/wms';

export function uHtrs96(lon: number, lat: number): [number, number] {
  const [x, y] = wgs84UHtrs96(lon, lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Transformacija točke nije uspjela');
  return [x, y];
}

// 7 decimala ≈ 1 cm (isto kao reproject.ts)
const uWgs = ([x, y]: number[]): [number, number] => {
  const [lon, lat] = htrs96UWgs84(x ?? NaN, y ?? NaN);
  return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
};

/** GetFeatureInfo za jednu točku: okvir ±10 m, 21×21 px (1 m/px), središnji piksel. */
export function arkodUpitUrl(lon: number, lat: number): string {
  const [x, y] = uHtrs96(lon, lat);
  const b = [x - 10, y - 10, x + 10, y + 10].map((v) => v.toFixed(2)).join(',');
  const p = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetFeatureInfo',
    LAYERS: 'hr.land_parcels',
    QUERY_LAYERS: 'hr.land_parcels',
    SRS: 'EPSG:3765',
    BBOX: b,
    WIDTH: '21',
    HEIGHT: '21',
    X: '10',
    Y: '10',
    FEATURE_COUNT: '1',
    INFO_FORMAT: 'application/json',
  });
  return `${ARKOD_WMS}?${p.toString()}`;
}

const broj = z.number().nullable().optional();
const Odgovor = z.object({
  features: z.array(
    z.object({
      geometry: z.discriminatedUnion('type', [
        z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.array(z.number()))) }),
        z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(z.array(z.number())))) }),
      ]),
      properties: z.object({
        id: z.union([z.number(), z.string()]),
        home_name: z.string().nullable().optional(),
        land_use_id: broj,
        area: broj,
        slope: broj,
        z_avg: broj,
        water_protect_zone: z.string().nullable().optional(),
        sanitary_protection_zone: z.string().nullable().optional(),
        natura2000: broj,
        irrigation: broj,
      }),
    }),
  ),
});

export interface ArkodAtributi {
  nagib: number | null;
  visina: number | null;
  vodozastita: string | null;
  sanitarnaZona: string | null;
  natura2000: boolean;
  navodnjavanje: boolean;
}

export interface ArkodCestica {
  arkodId: string;
  naziv: string | null;
  landUseId: number | null;
  povrsinaHa: number | null;
  atributi: ArkodAtributi;
  geom: RawMultiPolygon; // WGS84
}

/** null = na toj točki nema ARKOD čestice. Baca ako odgovor nije očekivanog oblika. */
export function parsirajArkod(json: unknown): ArkodCestica | null {
  const f = Odgovor.parse(json).features[0];
  if (!f) return null;
  const p = f.properties;
  const poligoni = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const geom: RawMultiPolygon = { type: 'MultiPolygon', coordinates: poligoni.map((poly) => poly.map((ring) => ring.map(uWgs))) };
  assertWGS84(geom);
  const prazno = (s: string | null | undefined) => (s && s.trim() && !/^(null|-|0)$/i.test(s.trim()) ? s.trim() : null);
  return {
    arkodId: String(p.id),
    naziv: p.home_name?.trim() || null,
    landUseId: p.land_use_id ?? null,
    povrsinaHa: p.area != null ? Math.round(p.area / 100) / 100 : null,
    atributi: {
      nagib: p.slope ?? null,
      visina: p.z_avg ?? null,
      vodozastita: prazno(p.water_protect_zone),
      sanitarnaZona: prazno(p.sanitary_protection_zone),
      natura2000: (p.natura2000 ?? 0) > 0,
      navodnjavanje: (p.irrigation ?? 0) > 0,
    },
    geom,
  };
}
