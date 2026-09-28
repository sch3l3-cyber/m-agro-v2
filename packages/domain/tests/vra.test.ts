import { describe, expect, it } from 'vitest';
import { BROJ_ZONA, dekodirajNdvi, dozeZona, kodirajNdvi, planVra, postociIzBrojeva, pragoviZona } from '../src/vra';

// slučajni ali ponovljivi NDVI (0.3–0.85) + oblaci (0)
function polje(n: number, seed = 7): Uint8Array {
  let x = seed;
  const r = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  return Uint8Array.from({ length: n }, () => (r() < 0.1 ? 0 : kodirajNdvi(0.3 + r() * 0.55)));
}
const opc = { cesticaHa: 10, osnovnaDoza: 200, raspon: 0.2, strategija: 'kompenzacijska' as const };

describe('VRA zone (lekcija #12)', () => {
  it('kodiranje: dekodiraj(kodiraj(x)) ≈ x, 0 = nema podatka', () => {
    for (const v of [-0.2, 0, 0.35, 0.8, 1]) expect(dekodirajNdvi(kodirajNdvi(v))).toBeCloseTo(v, 2);
    expect(dekodirajNdvi(0)).toBeNull();
  });

  it.each(BROJ_ZONA)('%i zona: postoci = 100, pikseli zona = čisti pikseli, broj pragova n−1', (n) => {
    const p = planVra(polje(5000), { ...opc, n });
    expect(p.zone).toHaveLength(n);
    expect(p.zone.reduce((a, z) => a + z.postotak, 0)).toBe(100);
    expect(p.zone.reduce((a, z) => a + z.piksela, 0)).toBe(p.cistihPiksela);
    expect(p.zone.reduce((a, z) => a + z.ha, 0)).toBeCloseTo(10, 6);
    // pragovi rastu
    const od = p.zone.map((z) => z.od);
    expect([...od].sort((a, b) => a - b)).toEqual(od);
    expect(new Set(od).size).toBe(n);
  });

  it.each(BROJ_ZONA)('%i zona: karta = tablica (zonaPoPikselu broji isto kao postoci)', (n) => {
    const p = planVra(polje(3000, 11), { ...opc, n });
    const iz_karte = new Array(n).fill(0);
    for (const z of p.zonaPoPikselu) if (z >= 0) iz_karte[z]++;
    expect(iz_karte).toEqual(p.zone.map((z) => z.piksela));
  });

  it('ujednačena čestica → sve u srednju zonu, ostale prazne', () => {
    const p = planVra(new Uint8Array(1000).fill(kodirajNdvi(0.5)), { ...opc, n: 5 });
    expect(p.ujednaceno).toBe(true);
    expect(p.zone.map((z) => z.postotak)).toEqual([0, 0, 100, 0, 0]);
  });

  it('sve pod oblakom → nula piksela, bez dijeljenja s nulom', () => {
    const p = planVra(new Uint8Array(500), { ...opc, n: 3 });
    expect(p.cistihPiksela).toBe(0);
    expect(p.zone.every((z) => z.postotak === 0 && Number.isFinite(z.ha))).toBe(true);
  });

  it('postoci uvijek 100 i kod nezgodnih omjera', () => {
    expect(postociIzBrojeva([1, 1, 1])).toEqual([34, 33, 33]);
    expect(postociIzBrojeva([1, 1, 1, 1, 1, 1, 1]).reduce((a, b) => a + b)).toBe(100);
  });

  it('doze: kompenzacijska daje više slabijim zonama, ±raspon', () => {
    expect(dozeZona(200, 3, 0.2, 'kompenzacijska')).toEqual([240, 200, 160]);
    expect(dozeZona(200, 3, 0.2, 'produktivna')).toEqual([160, 200, 240]);
    expect(dozeZona(100, 5, 0.1, 'kompenzacijska')).toEqual([110, 105, 100, 95, 90]);
  });

  it('pragovi: 5 zona dijeli p5–p95 na jednake dijelove', () => {
    const v = Array.from({ length: 101 }, (_, i) => i / 100); // 0..1
    const t = pragoviZona(v, 5);
    expect(t).toHaveLength(4);
    expect(t[0]).toBeCloseTo(0.05 + 0.9 / 5, 5);
  });
});
