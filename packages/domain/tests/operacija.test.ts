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
