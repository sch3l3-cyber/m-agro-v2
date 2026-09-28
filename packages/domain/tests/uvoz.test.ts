import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsirajUvoz, UvozError } from '../src/uvoz';

const poly = (x: number, y: number, d = 0.005) => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]],
});
const fc = (features: unknown[], crs?: string) => ({
  type: 'FeatureCollection',
  ...(crs && { crs: { type: 'name', properties: { name: crs } } }),
  features,
});
const f = (properties: Record<string, unknown> | null, geometry: unknown) => ({ type: 'Feature', properties, geometry });

describe('ARKOD izvoz (QGIS generator)', () => {
  const arkod = fc(
    [
      f({ ID_PARCEL: '2145678', home_name: 'Kod Ciglane', land_use_id: 200, is_active: true }, poly(18.3, 45.32)),
      f({ id_parcel: 2145679, HOME_NAME: 'Dolac', LAND_USE_ID: '310' }, poly(18.31, 45.32)),
      f({ ID_PARCEL: '2145680', home_name: 'Stara', land_use_id: 200, is_active: false }, poly(18.32, 45.32)),
    ],
    'urn:ogc:def:crs:OGC:1.3:CRS84',
  );

  it('čita naziv, ARKOD broj i kulturu (lekcija #5)', () => {
    const r = parsirajUvoz(arkod);
    expect(r.format).toBe('arkod');
    expect(r.cestice).toHaveLength(2);
    expect(r.cestice[0]).toMatchObject({ naziv: 'Kod Ciglane', arkodId: '2145678', landUseId: 200, kultura: 'Oranice' });
    expect(r.cestice[1]).toMatchObject({ naziv: 'Dolac', arkodId: '2145679', landUseId: 310, kultura: 'Livade' });
  });

  it('neaktivne čestice preskače uz upozorenje', () => {
    const r = parsirajUvoz(arkod);
    expect(r.upozorenja.some((u) => u.includes('neaktivna'))).toBe(true);
  });

  it('duplikat ARKOD broja je greška', () => {
    const r = parsirajUvoz(fc([f({ ID_PARCEL: '1', home_name: 'A' }, poly(18.3, 45.3)), f({ ID_PARCEL: '1', home_name: 'B' }, poly(18.31, 45.3))]));
    expect(r.cestice).toHaveLength(1);
    expect(r.greske[0]?.poruka).toMatch(/ponavlja/);
  });
});

describe('KML / Google Earth izvoz', () => {
  it('uzima naziv iz Name', () => {
    const r = parsirajUvoz(fc([f({ Name: 'CIGLANA', tessellate: -1, altitudeMode: null }, poly(18.36, 45.36))]));
    expect(r.format).toBe('kml');
    expect(r.cestice[0]?.naziv).toBe('CIGLANA');
    expect(r.cestice[0]?.arkodId).toBeNull();
  });

  it('isti naziv dvaput (bez ARKOD-a) → drugi dobiva sufiks i upozorenje, ništa se ne gubi', () => {
    const r = parsirajUvoz(fc([f({ Name: 'NUMERA' }, poly(18.3, 45.3)), f({ Name: 'NUMERA' }, poly(18.31, 45.3))]));
    expect(r.cestice.map((c) => c.naziv)).toEqual(['NUMERA', 'NUMERA (2)']);
    expect(r.upozorenja.join(' ')).toMatch(/ponavlja/);
  });

  it('bez naziva: privremeni naziv + VIDLJIVO upozorenje (nema tihog "Čestica")', () => {
    const r = parsirajUvoz(fc([f({}, poly(18.36, 45.36))]));
    expect(r.cestice[0]?.naziv).toBe('Čestica 1');
    expect(r.upozorenja.join(' ')).toMatch(/nema naziv/);
  });
});

describe('koordinate i geometrija', () => {
  it('HTRS96/TM bez crs polja se automatski pretvara', () => {
    const d = 200;
    const r = parsirajUvoz(fc([f({ Name: 'M' }, poly(641750, 5022298, d))]));
    expect(r.crs).toBe('EPSG:3765');
    expect(r.cestice[0]?.povrsinaHa).toBeCloseTo(4, 1); // 200 m × 200 m = 4 ha
    expect(r.upozorenja[0]).toMatch(/EPSG:3765/);
  });

  it('točke i linije su greške po retku, ostatak se uvozi', () => {
    const r = parsirajUvoz(fc([f({ Name: 'A' }, { type: 'Point', coordinates: [18, 45] }), f({ Name: 'B' }, poly(18.3, 45.3))]));
    expect(r.cestice).toHaveLength(1);
    expect(r.greske).toEqual([{ redak: 1, poruka: expect.stringMatching(/Point/) }]);
  });

  it('prazna ili kriva datoteka baca jasnu grešku', () => {
    expect(() => parsirajUvoz({ type: 'FeatureCollection', features: [] })).toThrow(UvozError);
    expect(() => parsirajUvoz({ hello: 1 })).toThrow(/FeatureCollection/);
  });
});

// Ivanova prava datoteka (86 čestica, KML izvoz). NIJE u repou (privatni podaci) —
// test se izvršava samo kad je datoteka lokalno prisutna.
const PRAVA = process.env.MAGRO_PARCELE ?? '/mnt/user-data/uploads/ndvi cowork/parcele/parcele.geojson';
describe.runIf(existsSync(PRAVA))('prava datoteka parcele.geojson', () => {
  it('uvozi svih 86 čestica s nazivima', () => {
    const r = parsirajUvoz(JSON.parse(readFileSync(PRAVA, 'utf8')));
    expect(r.greske).toEqual([]);
    expect(r.cestice).toHaveLength(86);
    expect(r.cestice.every((c) => c.naziv && !c.naziv.startsWith('Čestica '))).toBe(true);
    expect(new Set(r.cestice.map((c) => c.naziv)).size).toBe(86); // svi nazivi jedinstveni
    console.log(`  ${r.cestice.length} čestica, ${r.ukupnoHa} ha, format ${r.format}`);
  });
});
