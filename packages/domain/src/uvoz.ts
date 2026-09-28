import area from '@turf/area';
import { z } from 'zod';
import { RawGeometrySchema, toMultiPolygon, type RawGeometry, type RawMultiPolygon, type WGS84Geometry } from './geo';
import { lpisNaziv } from './lpis';
import { CrsError, crsIzGeoJSON, odrediCrs, reproject, type Crs } from './reproject';
import { MAX_CESTICA_PO_UVOZU } from './uvoz-dto';

/**
 * Uvoz čestica iz GeoJSON-a. Lekcija #5: naziv NIKAD ne pada tiho na "Čestica" —
 * svaka zamjena ili preskakanje ide u `upozorenja`/`greske` koje korisnik vidi prije spremanja.
 *
 * Podržani izvori:
 *   - ARKOD (QGIS generator iz ARKOD .gpkg): ID_PARCEL / home_name / land_use_id
 *   - KML / Google Earth / generički GeoJSON: Name / name / naziv
 */

export type IzvorFormat = 'arkod' | 'kml' | 'genericki';

export interface UvozCestica {
  /** redni broj featurea u datoteci (1-based) — za poruke korisniku */
  redak: number;
  naziv: string;
  arkodId: string | null;
  landUseId: number | null;
  kultura: string | null;
  geom: WGS84Geometry & RawMultiPolygon;
  povrsinaHa: number;
}

export interface UvozGreska {
  redak: number;
  poruka: string;
}

export interface UvozRezultat {
  format: IzvorFormat;
  crs: Crs;
  cestice: UvozCestica[];
  upozorenja: string[];
  greske: UvozGreska[];
  ukupnoHa: number;
}

const FeatureSchema = z.object({
  type: z.literal('Feature'),
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
  geometry: z.unknown(),
});
const FcSchema = z.object({ type: z.literal('FeatureCollection'), features: z.array(z.unknown()) });

export class UvozError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UvozError';
  }
}

/** Case-insensitive dohvat atributa (QGIS/ARKOD mijenjaju velika/mala slova između verzija). */
function prop(props: Record<string, unknown>, ...kljucevi: string[]): unknown {
  const lower = new Map(Object.entries(props).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of kljucevi) {
    const v = lower.get(k.toLowerCase());
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function tekst(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function broj(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : Number.NaN;
  return Number.isInteger(n) ? n : null;
}

const ARKOD_ID = ['ID_PARCEL', 'id_parcel', 'arkod_id', 'ARKOD_ID', 'gerk_pid'];
const NAZIV_ARKOD = ['home_name', 'HOME_NAME', 'naziv', 'NAZIV'];
const NAZIV_OPCI = ['naziv', 'Name', 'name', 'NAZIV', 'NAME', 'FIELD_NAME', 'home_name'];
const LAND_USE = ['land_use_id', 'LAND_USE_ID', 'vrsta_uporabe'];

function prepoznajFormat(svojstva: Record<string, unknown>[]): IzvorFormat {
  const ima = (keys: string[]) => svojstva.some((p) => prop(p, ...keys) !== undefined);
  if (ima(ARKOD_ID) || ima(LAND_USE) || ima(['home_name'])) return 'arkod';
  if (svojstva.some((p) => 'altitudeMode' in p || 'tessellate' in p || 'drawOrder' in p)) return 'kml';
  return 'genericki';
}

export function parsirajUvoz(input: unknown): UvozRezultat {
  const fc = FcSchema.safeParse(input);
  if (!fc.success) throw new UvozError('Datoteka nije GeoJSON FeatureCollection.');
  if (fc.data.features.length === 0) throw new UvozError('Datoteka ne sadrži nijednu česticu.');
  if (fc.data.features.length > MAX_CESTICA_PO_UVOZU) {
    throw new UvozError(`Najviše ${MAX_CESTICA_PO_UVOZU} čestica po uvozu (datoteka ima ${fc.data.features.length}).`);
  }

  const greske: UvozGreska[] = [];
  const upozorenja: string[] = [];

  // 1) struktura + geometrija
  const featuri: { redak: number; props: Record<string, unknown>; geom: RawGeometry }[] = [];
  fc.data.features.forEach((raw, i) => {
    const redak = i + 1;
    const f = FeatureSchema.safeParse(raw);
    if (!f.success) return greske.push({ redak, poruka: 'Neispravan zapis (nije GeoJSON Feature).' });
    const g = RawGeometrySchema.safeParse(f.data.geometry);
    if (!g.success) {
      const tip = (f.data.geometry as { type?: unknown } | null)?.type;
      return greske.push({ redak, poruka: tip ? `Geometrija tipa ${String(tip)} nije poligon ili je neispravna.` : 'Nema geometrije.' });
    }
    featuri.push({ redak, props: f.data.properties ?? {}, geom: g.data as RawGeometry });
  });
  if (featuri.length === 0) throw new UvozError('Nijedna čestica nema ispravnu poligonsku geometriju.');

  // 2) koordinatni sustav — jedan za cijelu datoteku
  const crs = odrediCrs(crsIzGeoJSON(input), featuri[0]?.geom);
  if (crs !== 'EPSG:4326') upozorenja.push(`Koordinate su u ${crs} — automatski pretvorene u WGS84.`);

  const format = prepoznajFormat(featuri.map((f) => f.props));
  const cestice: UvozCestica[] = [];
  const vidjeniArkod = new Map<string, number>();
  const bezNaziva: number[] = [];
  const vidjeniNazivi = new Map<string, number>();

  for (const { redak, props, geom } of featuri) {
    if (prop(props, 'is_active') === false) {
      upozorenja.push(`Redak ${redak}: neaktivna ARKOD čestica — preskočena.`);
      continue;
    }
    let wgs: WGS84Geometry;
    try {
      wgs = reproject(geom, crs);
    } catch (err) {
      greske.push({ redak, poruka: err instanceof CrsError ? err.message : 'Koordinate izvan dopuštenog raspona.' });
      continue;
    }

    const arkodId = tekst(prop(props, ...ARKOD_ID));
    if (arkodId) {
      const prije = vidjeniArkod.get(arkodId);
      if (prije) {
        greske.push({ redak, poruka: `ARKOD ${arkodId} se ponavlja (već u retku ${prije}).` });
        continue;
      }
      vidjeniArkod.set(arkodId, redak);
    }

    let naziv = tekst(prop(props, ...(format === 'arkod' ? NAZIV_ARKOD : NAZIV_OPCI)))?.slice(0, 200) ?? null;
    if (!naziv) {
      naziv = arkodId ? `ARKOD ${arkodId}` : `Čestica ${redak}`;
      bezNaziva.push(redak);
    }

    // Bez ARKOD broja čestica se u bazi prepoznaje po nazivu — dva ista naziva u datoteci
    // bi se "spojila" (druga bi bila preskočena). Razlikujemo ih sufiksom i JAVLJAMO to.
    if (!arkodId) {
      const n = (vidjeniNazivi.get(naziv) ?? 0) + 1;
      vidjeniNazivi.set(naziv, n);
      if (n > 1) {
        upozorenja.push(`Redak ${redak}: naziv "${naziv}" se ponavlja — spremljeno kao "${naziv} (${n})".`);
        naziv = `${naziv} (${n})`;
      }
    }

    const landUseId = broj(prop(props, ...LAND_USE));
    const mp = toMultiPolygon(wgs);
    const ha = area(mp) / 10_000;
    if (ha < 0.001) {
      greske.push({ redak, poruka: `"${naziv}": površina je praktički 0 (${ha.toFixed(4)} ha).` });
      continue;
    }
    if (ha > 5000) upozorenja.push(`"${naziv}": neobično velika površina (${ha.toFixed(0)} ha) — provjeri datoteku.`);

    cestice.push({
      redak,
      naziv,
      arkodId,
      landUseId,
      kultura: lpisNaziv(landUseId),
      geom: mp,
      povrsinaHa: Math.round(ha * 10_000) / 10_000,
    });
  }

  if (bezNaziva.length) {
    upozorenja.push(
      `${bezNaziva.length} čestic${bezNaziva.length === 1 ? 'a nema' : 'a nemaju'} naziv — dobile su privremeni naziv (retci ${bezNaziva.slice(0, 10).join(', ')}${bezNaziva.length > 10 ? '…' : ''}). Možeš ih preimenovati nakon uvoza.`,
    );
  }

  return {
    format,
    crs,
    cestice,
    upozorenja,
    greske,
    ukupnoHa: Math.round(cestice.reduce((s, c) => s + c.povrsinaHa, 0) * 100) / 100,
  };
}

