import { describe, expect, it } from 'vitest';
import { NovaOperacijaSchema, opisOperacije } from '../src/operacija';

const baza = { datum: '2026-10-05', note: '', localId: 'abcdefgh-1' };

describe('NovaOperacijaSchema', () => {
  it('prihrana: decimalni zarez, prazno → null', () => {
    const o = NovaOperacijaSchema.parse({ ...baza, tip: 'prihrana', fert: ' KAN ', amount: '187,5', unit: 'kg/ha' });
    expect(o).toMatchObject({ tip: 'prihrana', fert: 'KAN', amount: 187.5, unit: 'kg/ha', note: null });
  });
  it('sjetva bez kulture je greška s porukom', () => {
    const r = NovaOperacijaSchema.safeParse({ ...baza, tip: 'sjetva', kultura: '', sorta: '', amount: '', unit: '', dubina: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Upiši kulturu');
  });
  it('vlaga preko 100 % je greška', () => {
    expect(NovaOperacijaSchema.safeParse({ ...baza, tip: 'zetva', kultura: '', amount: '7,2', unit: 't/ha', vlaga: '140', hektolitarska: '' }).success).toBe(false);
  });
  it('tekst umjesto broja je greška', () => {
    expect(NovaOperacijaSchema.safeParse({ ...baza, tip: 'prihrana', fert: 'KAN', amount: 'puno', unit: '' }).success).toBe(false);
  });
  it('datum predaleko u budućnosti je greška', () => {
    expect(NovaOperacijaSchema.safeParse({ ...baza, datum: '2099-01-01', tip: 'ostalo', note: 'x' }).success).toBe(false);
  });
});

describe('opisOperacije', () => {
  it('sjetva i žetva', () => {
    expect(opisOperacije({ tip: 'sjetva', kultura: 'Pšenica', sorta: 'Kraljica', amount: 250, unit: 'kg/ha' })).toBe('Pšenica · Kraljica · 250 kg/ha');
    expect(opisOperacije({ tip: 'zetva', kultura: 'Pšenica', amount: 7.2, unit: 't/ha', vlaga: 13.5 })).toBe('Pšenica · 7,2 t/ha · vlaga 13,5 %');
  });
});

import { operacijeCsv, ukupnoInputa } from '../src/operacija';

describe('ukupnoInputa', () => {
  const b = { datum: '2026-03-01', cesticaNaziv: 'A', cesticaHa: 2 };
  it('doza × površina, grupirano po nazivu (bez obzira na velika/mala slova)', () => {
    const r = ukupnoInputa([
      { ...b, tip: 'prihrana', fert: 'KAN', amount: 200, unit: 'kg/ha' },
      { ...b, tip: 'prihrana', fert: 'kan', amount: 150, unit: 'kg/ha', cesticaHa: 1.5 },
      { ...b, tip: 'zastita', product: 'Herbicid X', amount: 1.2, unit: 'l/ha' },
      { ...b, tip: 'prihrana', fert: 'UREA', amount: null, unit: 'kg/ha' },
      { ...b, tip: 'sjetva', kultura: 'Pšenica', amount: 250, unit: 'kg/ha' },
    ]);
    expect(r).toEqual([
      { tip: 'prihrana', naziv: 'KAN', jedinica: 'kg', ukupno: 625, ha: 3.5, primjena: 2 },
      { tip: 'zastita', naziv: 'Herbicid X', jedinica: 'l', ukupno: 2.4, ha: 2, primjena: 1 },
    ]);
  });
});

describe('operacijeCsv', () => {
  it('BOM, točka-zarez, decimalni zarez, navodnici', () => {
    const csv = operacijeCsv([{ datum: '2026-03-01', cesticaNaziv: 'NUMERA; istok', cesticaHa: 1.25, tip: 'prihrana', fert: 'KAN', amount: 187.5, unit: 'kg/ha', note: 'rekao "dosta"' }]);
    expect(csv.startsWith('﻿Datum;Čestica')).toBe(true);
    expect(csv).toContain('2026-03-01;"NUMERA; istok";1,25;Prihrana;;;KAN;187,5;kg/ha;;;;"rekao ""dosta"""');
  });
});
