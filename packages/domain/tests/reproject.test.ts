import { describe, expect, it } from 'vitest';
import proj4 from 'proj4';
import { CrsError, crsIzGeoJSON, odrediCrs, reproject } from '../src/reproject';
import type { RawPolygon } from '../src/geo';

const kvadrat = (x: number, y: number, d: number): RawPolygon => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]],
});

describe('reprojekcija (lekcija #3)', () => {
  it('referentna točka iz briefa: EPSG:3765 (641750, 5022298) → (18.308°, 45.326°)', () => {
    const g = reproject(kvadrat(641750, 5022298, 100), 'EPSG:3765');
    const p = g.type === 'Polygon' ? g.coordinates[0]?.[0] : undefined;
    expect(p?.[0]).toBeCloseTo(18.30827, 4);
    expect(p?.[1]).toBeCloseTo(45.32631, 4);
  });

  it('Gauss-Krüger zona 6 (EPSG:31276): povratna transformacija točna na < 1 m', () => {
    // WGS84 → GK6 → WGS84 mora vratiti istu točku (Đakovo)
    const [x, y] = proj4('EPSG:4326', 'EPSG:31276', [18.308265, 45.326313]);
    expect(x).toBeGreaterThan(6_300_000); // provjera da je zona 6 (x_0 = 6 500 000)
    const g = reproject(kvadrat(x, y, 10), 'EPSG:31276');
    const p = g.type === 'Polygon' ? g.coordinates[0]?.[0] : undefined;
    expect(p?.[0]).toBeCloseTo(18.308265, 5); // 5 decimala ≈ 1 m
    expect(p?.[1]).toBeCloseTo(45.326313, 5);
    expect(odrediCrs(null, kvadrat(x, y, 10))).toBe('EPSG:31276');
  });

  it('WGS84 prolazi nepromijenjen', () => {
    const g = reproject(kvadrat(18.3, 45.3, 0.01), 'EPSG:4326');
    expect(g.type).toBe('Polygon');
  });
});

describe('prepoznavanje CRS-a', () => {
  it('čita CRS84 i EPSG iz GeoJSON-a (QGIS format)', () => {
    expect(crsIzGeoJSON({ crs: { properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } } })).toBe('EPSG:4326');
    expect(crsIzGeoJSON({ crs: { properties: { name: 'urn:ogc:def:crs:EPSG::3765' } } })).toBe('EPSG:3765');
    expect(crsIzGeoJSON({})).toBeNull();
  });

  it('bez crs polja: stupnjevi → 4326, HTRS96 metri → 3765', () => {
    expect(odrediCrs(null, kvadrat(18.3, 45.3, 0.01))).toBe('EPSG:4326');
    expect(odrediCrs(null, kvadrat(641750, 5022298, 100))).toBe('EPSG:3765');
  });

  it('nepoznat CRS → greška, nikad tihi fallback', () => {
    expect(() => odrediCrs('EPSG:2154', kvadrat(1, 1, 1))).toThrow(CrsError);
    expect(() => odrediCrs(null, kvadrat(9_000_000, 9_000_000, 10))).toThrow(CrsError);
  });
});
