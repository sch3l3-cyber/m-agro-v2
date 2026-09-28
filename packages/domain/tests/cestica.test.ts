import { describe, expect, it } from 'vitest';
import { UrediCesticuSchema } from '../src/cestica';

describe('UrediCesticuSchema', () => {
  it('trima i sažima razmake', () => {
    expect(UrediCesticuSchema.parse({ naziv: '  NUMERA   istok ', kultura: ' Pšenica ' })).toEqual({ naziv: 'NUMERA istok', kultura: 'Pšenica' });
  });
  it('prazna kultura = null', () => {
    expect(UrediCesticuSchema.parse({ naziv: 'A', kultura: '   ' }).kultura).toBeNull();
  });
  it('prazan naziv je greška', () => {
    expect(UrediCesticuSchema.safeParse({ naziv: '   ', kultura: '' }).success).toBe(false);
  });
  it('predug naziv je greška', () => {
    expect(UrediCesticuSchema.safeParse({ naziv: 'x'.repeat(201), kultura: '' }).success).toBe(false);
  });
});
