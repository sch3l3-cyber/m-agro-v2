import { describe, expect, it } from 'vitest';
import { ndviSemafor, sazetakKultura } from './semafor';

const D = '2026-09-29';

describe('NDVI semafor', () => {
  it('bez snimki ili stare snimke → sivo', () => {
    expect(ndviSemafor([], D).boja).toBe('sivo');
    expect(ndviSemafor([{ datum: '2026-08-01', mean: 0.7 }], D).boja).toBe('sivo');
  });
  it('jedna snimka → zeleno bez trenda', () => {
    const s = ndviSemafor([{ datum: '2026-09-25', mean: 0.61 }], D);
    expect(s.boja).toBe('zeleno');
    expect(s.naslov).toBe('NDVI 0,61');
  });
  it('stabilno, raste, pad, nagli pad', () => {
    const baza = [
      { datum: '2026-09-05', mean: 0.6 },
      { datum: '2026-09-10', mean: 0.62 },
      { datum: '2026-09-15', mean: 0.61 },
    ];
    expect(ndviSemafor([...baza, { datum: '2026-09-25', mean: 0.62 }], D).naslov).toBe('Stabilno');
    expect(ndviSemafor([...baza, { datum: '2026-09-25', mean: 0.7 }], D).naslov).toBe('Raste');
    expect(ndviSemafor([...baza, { datum: '2026-09-25', mean: 0.52 }], D)).toMatchObject({ boja: 'zuto', naslov: 'Pad' });
    const n = ndviSemafor([...baza, { datum: '2026-09-25', mean: 0.4 }], D);
    expect(n).toMatchObject({ boja: 'crveno', naslov: 'Nagli pad' });
    expect(n.razlog).toContain('0,40 prema 0,61');
  });
  it('pad nakon žetve nije alarm', () => {
    const s = ndviSemafor(
      [
        { datum: '2026-09-05', mean: 0.7 },
        { datum: '2026-09-10', mean: 0.7 },
        { datum: '2026-09-25', mean: 0.2 },
      ],
      D,
      '2026-09-15',
    );
    expect(s.boja).toBe('sivo');
    expect(s.naslov).toBe('Požnjeveno / obrađeno');
  });
  it('redoslijed ulaza nije bitan', () => {
    const a = ndviSemafor([{ datum: '2026-09-25', mean: 0.4 }, { datum: '2026-09-10', mean: 0.62 }], D);
    expect(a.boja).toBe('crveno');
  });
});

describe('sažetak kultura', () => {
  it('grupira i sortira po ha, bez kulture na kraju', () => {
    const r = sazetakKultura([
      { kultura: 'Pšenica', povrsinaHa: 10 },
      { kultura: null, povrsinaHa: 50 },
      { kultura: 'Kukuruz', povrsinaHa: 20 },
      { kultura: 'Pšenica ', povrsinaHa: 15 },
    ]);
    expect(r).toEqual([
      { kultura: 'Pšenica', broj: 2, ha: 25 },
      { kultura: 'Kukuruz', broj: 1, ha: 20 },
      { kultura: null, broj: 1, ha: 50 },
    ]);
  });
});
