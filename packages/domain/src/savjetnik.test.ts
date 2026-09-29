import { describe, expect, it } from 'vitest';
import { PitanjeSchema, ndviTrend, sastaviKontekst, srediste } from './savjetnik';

const baza = {
  danas: '2026-09-29',
  naziv: 'BEDEM',
  kultura: 'pšenica',
  povrsinaHa: 12.345,
  lat: 45.31,
  lon: 18.41,
  ndvi: [],
  operacije: [],
  prognoza: null,
};

describe('savjetnik kontekst', () => {
  it('bez podataka jasno kaže što nedostaje', () => {
    const t = sastaviKontekst(baza);
    expect(t).toContain('BEDEM');
    expect(t).toContain('12.35 ha');
    expect(t).toContain('nema spremljenih čistih snimki');
    expect(t).toContain('ništa upisano');
    expect(t).toContain('Prognoza: nedostupna');
  });

  it('NDVI, operacije i prognoza ulaze u kontekst', () => {
    const t = sastaviKontekst({
      ...baza,
      ndvi: [
        { datum: '2026-09-01', mean: 0.4, p10: 0.3, p90: 0.5 },
        { datum: '2026-09-20', mean: 0.62, p10: null, p90: null },
      ],
      operacije: [{ datum: '2026-09-10', tip: 'prihrana', kultura: null, fert: 'KAN', product: null, amount: 150, unit: 'kg/ha', note: null }],
      prognoza: [{ datum: '2026-09-30', kisaMm: 0, vjetarMaxKmh: 10, tMax: 20, tMin: 8 }],
    });
    expect(t).toContain('trend: raste');
    expect(t).toContain('2026-09-01: 0.40 (p10–p90: 0.30–0.50)');
    expect(t).toContain('prihrana, KAN, 150 kg/ha');
    expect(t).toMatch(/2026-09-30: 8–20 °C.*rasipanje: /);
  });

  it('trend', () => {
    expect(ndviTrend([])).toBeNull();
    expect(ndviTrend([{ datum: 'a', mean: 0.7, p10: null, p90: null }, { datum: 'b', mean: 0.5, p10: null, p90: null }])).toBe('pada');
    expect(ndviTrend([{ datum: 'a', mean: 0.5, p10: null, p90: null }, { datum: 'b', mean: 0.52, p10: null, p90: null }])).toBe('stabilno');
  });

  it('središte', () => {
    expect(srediste([[[[18, 45], [19, 45], [19, 46], [18, 46]]]])).toEqual({ lat: 45.5, lon: 18.5 });
    expect(srediste([])).toEqual({ lat: 45.3, lon: 18.4 });
  });

  it('validacija pitanja', () => {
    expect(PitanjeSchema.safeParse({ cesticaId: 'x', pitanje: 'ok?' }).success).toBe(false);
    const ok = PitanjeSchema.parse({ cesticaId: '51d60e3d-8dc3-41d7-80b3-6319db275a0b', pitanje: '  Kad prihraniti? ' });
    expect(ok.pitanje).toBe('Kad prihraniti?');
    expect(ok.povijest).toEqual([]);
    expect(PitanjeSchema.safeParse({ cesticaId: '51d60e3d-8dc3-41d7-80b3-6319db275a0b', pitanje: 'x'.repeat(1001) }).success).toBe(false);
  });
});
