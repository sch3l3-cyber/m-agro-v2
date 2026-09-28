import { z } from 'zod';

/**
 * Lekcija #3 (04_LEKCIJE.md): koordinatni sustav mora biti vidljiv u TIPU.
 *
 * RawGeometry     — bilo što što je stiglo izvana (upload, ARKOD, KML); CRS nepoznat.
 * WGS84Geometry   — provjereno u EPSG:4326 rasponu. Samo takvu geometriju smiju
 *                   primiti izračun površine, karta i baza.
 *
 * Jedini način da se dobije WGS84Geometry je `assertWGS84()` (ili reproject() u Fazi 1),
 * pa kompajler odbija `calculateArea(rawGeom)`.
 */

declare const WGS84: unique symbol;

export type Position = [number, number] | [number, number, number];
export type LinearRing = Position[];

export interface RawPolygon { type: 'Polygon'; coordinates: LinearRing[] }
export interface RawMultiPolygon { type: 'MultiPolygon'; coordinates: LinearRing[][] }
export type RawGeometry = RawPolygon | RawMultiPolygon;

export type WGS84Geometry = RawGeometry & { readonly [WGS84]: true };

const finite = z.number().refine(Number.isFinite, 'Koordinata mora biti konačan broj');
const rawPosition = z.union([z.tuple([finite, finite]), z.tuple([finite, finite, finite])]);

const ring = z
  .array(rawPosition)
  .min(4, 'Prsten poligona mora imati barem 4 točke')
  .refine((r) => {
    const a = r[0];
    const b = r[r.length - 1];
    return a !== undefined && b !== undefined && a[0] === b[0] && a[1] === b[1];
  }, 'Prsten poligona nije zatvoren');

export const RawGeometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring).min(1)).min(1) }),
]);

function* positions(g: RawGeometry): Generator<Position> {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polys) for (const r of poly) yield* r;
}

export function isWGS84Range(g: RawGeometry): boolean {
  for (const [x, y] of positions(g)) {
    if (x < -180 || x > 180 || y < -90 || y > 90) return false;
  }
  return true;
}

export class NotWGS84Error extends Error {
  constructor() {
    super('Geometrija nije u WGS84 (EPSG:4326). Reprojicirati prije korištenja (lib/proj4).');
    this.name = 'NotWGS84Error';
  }
}

/** Validira strukturu + raspon i vraća brendiranu WGS84 geometriju. Baca grešku — nikad tihi fallback. */
export function assertWGS84(input: unknown): WGS84Geometry {
  const g = RawGeometrySchema.parse(input) as RawGeometry;
  if (!isWGS84Range(g)) throw new NotWGS84Error();
  return g as WGS84Geometry;
}

/** Baza sprema MultiPolygon; normaliziramo prije slanja. */
export function toMultiPolygon(g: WGS84Geometry): WGS84Geometry & RawMultiPolygon {
  if (g.type === 'MultiPolygon') return g as WGS84Geometry & RawMultiPolygon;
  return { type: 'MultiPolygon', coordinates: [g.coordinates] } as unknown as WGS84Geometry & RawMultiPolygon;
}
