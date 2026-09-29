import { describe, expect, it } from 'vitest';
import { arkodBrojeviIzTeksta, arkodUpitUrl, parsirajArkod, uHtrs96 } from './arkod';

describe('ARKOD', () => {
  it('točka u HTRS96/TM', () => {
    const [x, y] = uHtrs96(18.3425, 45.3607);
    expect(Math.round(x)).toBe(644346);
    expect(Math.round(y)).toBe(5026180);
  });

  it('URL traži EPSG:3765 i JSON, ±10 m', () => {
    const u = new URL(arkodUpitUrl(18.3425, 45.3607));
    expect(u.searchParams.get('SRS')).toBe('EPSG:3765');
    expect(u.searchParams.get('INFO_FORMAT')).toBe('application/json');
    const [x1, , x2] = (u.searchParams.get('BBOX') ?? '').split(',').map(Number);
    expect((x2 ?? 0) - (x1 ?? 0)).toBeCloseTo(20, 5);
  });

  it('parsira česticu, reprojicira i NE vraća jpaid', () => {
    const r = parsirajArkod({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[644460.81, 5026495.883], [644456.61, 5026496.163], [644409.29, 5026472.363], [644460.81, 5026495.883]]] },
          properties: { id: 1438398, home_name: ' PTC32 ', land_use_id: 200, area: 216920.32, slope: 1.5, z_avg: 112.1, water_protect_zone: 'Vz3', natura2000: 0, irrigation: 0, jpaid: '1234567890123' },
        },
      ],
    });
    expect(r).not.toBeNull();
    expect(r?.arkodId).toBe('1438398');
    expect(r?.naziv).toBe('PTC32');
    expect(r?.povrsinaHa).toBe(21.69);
    expect(r?.atributi).toEqual({ nagib: 1.5, visina: 112.1, vodozastita: 'Vz3', sanitarnaZona: null, natura2000: false, navodnjavanje: false });
    const [lon, lat] = r?.geom.coordinates[0]?.[0]?.[0] ?? [];
    expect(lon).toBeGreaterThan(18.3);
    expect(lat).toBeGreaterThan(45.3);
    expect(JSON.stringify(r)).not.toContain('1234567890123');
  });

  it('prazan odgovor → null; neočekivan oblik → greška', () => {
    expect(parsirajArkod({ type: 'FeatureCollection', features: [] })).toBeNull();
    expect(() => parsirajArkod({ nesto: 1 })).toThrow();
  });
});

describe('ARKOD brojevi iz teksta', () => {
  it('tablica iz preglednika', () => {
    const t = `ARKOD ID\tMIPRA\tUPORABA\tDOMAĆE IME\tPOVRŠINA
1437819\t200\tOranica\tCIGLANA MIROVIĆ-ERO\t0.62 ha
1438088\t200\tOranica\tORIŠJE PINTERIĆ MATIJA\t0.3 ha
1438397\t200\tOranica\tTABLA CIGLANA\t18.1 ha
1437819 duplikat`;
    expect(arkodBrojeviIzTeksta(t)).toEqual([1437819, 1438088, 1438397]);
  });
  it('popis odvojen zarezima, bez decimala i MIBPG-a od 6 znamenki kao dijela decimala', () => {
    expect(arkodBrojeviIzTeksta('2242292, 2242376;3218547\n12.5 ha 1234 200')).toEqual([2242292, 2242376, 3218547]);
  });
});
