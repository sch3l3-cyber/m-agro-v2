import proj4 from 'proj4';
import { assertWGS84, type Position, type RawGeometry, type WGS84Geometry } from './geo';

/**
 * Reprojekcija u WGS84 (portano iz v1 `reprojectGeoJSON`, lekcija #3).
 * Razlike od v1:
 *   - nepoznat CRS ili greška transformacije BACA grešku (v1 je tiho vraćao original)
 *   - EPSG:31276 ima towgs84 parametre (bez njih Bessel → WGS84 odstupa ~100 m)
 *   - rezultat je brendirani WGS84Geometry (kompajler ne pušta neprojicirano dalje)
 */
const DEFS: Record<string, string> = {
  // HTRS96/TM — službeni hrvatski projekcijski sustav, ARKOD
  'EPSG:3765': '+proj=tmerc +lat_0=0 +lon_0=16.5 +k=0.9999 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  // HTRS96/LCC
  'EPSG:3766': '+proj=lcc +lat_1=43.08333333333334 +lat_2=45.91666666666666 +lat_0=0 +lon_0=16.5 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  // MGI / Balkans zone 6 (stari Gauss-Krüger, istočna HR) — 7-parametarska transformacija za RH
  'EPSG:31276': '+proj=tmerc +lat_0=0 +lon_0=18 +k=0.9999 +x_0=6500000 +y_0=0 +ellps=bessel +towgs84=550.499,164.116,475.142,5.80967,2.07902,-11.62386,0.99999445824 +units=m +no_defs',
  // MGI / Balkans zone 5 (zapadna HR)
  'EPSG:31275': '+proj=tmerc +lat_0=0 +lon_0=15 +k=0.9999 +x_0=5500000 +y_0=0 +ellps=bessel +towgs84=550.499,164.116,475.142,5.80967,2.07902,-11.62386,0.99999445824 +units=m +no_defs',
  'EPSG:32633': '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs',
  'EPSG:32634': '+proj=utm +zone=34 +datum=WGS84 +units=m +no_defs',
};
for (const [code, def] of Object.entries(DEFS)) proj4.defs(code, def);

export const PODRZANI_CRS = ['EPSG:4326', ...Object.keys(DEFS)] as const;
export type Crs = (typeof PODRZANI_CRS)[number];

export class CrsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrsError';
  }
}

/** Čita `crs` iz GeoJSON-a (stari GeoJSON 2008 format koji QGIS i dalje piše). */
export function crsIzGeoJSON(fc: unknown): string | null {
  const name = (fc as { crs?: { properties?: { name?: unknown } } })?.crs?.properties?.name;
  if (typeof name !== 'string') return null;
  if (/CRS84|EPSG:+4326\b/i.test(name)) return 'EPSG:4326';
  const m = name.match(/EPSG:+(\d+)/i);
  return m ? `EPSG:${m[1]}` : name;
}

function prvaTocka(g: RawGeometry): Position | undefined {
  return g.type === 'Polygon' ? g.coordinates[0]?.[0] : g.coordinates[0]?.[0]?.[0];
}

/**
 * Određuje CRS: 1) iz `crs` polja, 2) po rasponu koordinata.
 * Heuristika (samo kad `crs` nedostaje): metri u rasponu HTRS96/TM za Hrvatsku → EPSG:3765,
 * Gauss-Krüger (x ≈ 5.3M–6.7M) → 31275/31276. Sve ostalo → greška, nikad nagađanje.
 */
export function odrediCrs(deklarirani: string | null, uzorak: RawGeometry | undefined): Crs {
  if (deklarirani) {
    if ((PODRZANI_CRS as readonly string[]).includes(deklarirani)) return deklarirani as Crs;
    throw new CrsError(`Koordinatni sustav ${deklarirani} nije podržan. Izvezi u EPSG:4326 ili EPSG:3765 (HTRS96/TM).`);
  }
  const p = uzorak && prvaTocka(uzorak);
  if (!p) throw new CrsError('Datoteka nema geometrije.');
  const [x, y] = p;
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return 'EPSG:4326';
  if (x > 150_000 && x < 850_000 && y > 4_600_000 && y < 5_200_000) return 'EPSG:3765';
  if (x > 6_300_000 && x < 6_700_000 && y > 4_600_000 && y < 5_200_000) return 'EPSG:31276';
  if (x > 5_300_000 && x < 5_700_000 && y > 4_600_000 && y < 5_200_000) return 'EPSG:31275';
  throw new CrsError(`Ne mogu prepoznati koordinatni sustav (prva točka ${x.toFixed(0)}, ${y.toFixed(0)}). Izvezi u EPSG:4326.`);
}

export function reproject(g: RawGeometry, crs: Crs): WGS84Geometry {
  if (crs === 'EPSG:4326') return assertWGS84(g);
  const conv = proj4(crs, 'EPSG:4326');
  const t = (p: Position): Position => {
    const [lng, lat] = conv.forward([p[0], p[1]]);
    if (lng === undefined || lat === undefined || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      throw new CrsError(`Transformacija točke (${p[0]}, ${p[1]}) iz ${crs} nije uspjela.`);
    }
    // 7 decimala ≈ 1 cm — dovoljno i za RTK, a smanjuje veličinu zapisa
    return [Math.round(lng * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
  };
  const out: RawGeometry =
    g.type === 'Polygon'
      ? { type: 'Polygon', coordinates: g.coordinates.map((r) => r.map(t)) }
      : { type: 'MultiPolygon', coordinates: g.coordinates.map((poly) => poly.map((r) => r.map(t))) };
  return assertWGS84(out);
}
