import { describe, expect, it } from 'vitest';
import { preporukaPrihrane, type DanPrognoze } from '../src/prognoza';

const dan = (datum: string, o: Partial<DanPrognoze> = {}): DanPrognoze => ({ datum, kisaMm: 0, vjetarMaxKmh: 8, tMax: 15, tMin: 3, ...o });

describe('preporuka za prihranu', () => {
  it('mirno + umjerena kiša nakon → dobro, s razlogom', () => {
    const r = preporukaPrihrane([dan('d1'), dan('d2', { kisaMm: 6 }), dan('d3'), dan('d4')]);
    expect(r[0]?.ocjena).toBe('dobro');
    expect(r[0]?.razlozi.join()).toMatch(/unijet će gnojivo/);
  });
  it('jak vjetar → loše', () => {
    expect(preporukaPrihrane([dan('d1', { vjetarMaxKmh: 32 })])[0]?.ocjena).toBe('lose');
  });
  it('jaka kiša sutra → loše (ispiranje)', () => {
    expect(preporukaPrihrane([dan('d1'), dan('d2', { kisaMm: 28 })])[0]?.ocjena).toBe('lose');
  });
  it('UREA, toplo i suho → uvjetno; KAN isti dan nije', () => {
    const d = [dan('d1', { tMax: 26 }), dan('d2', { tMax: 26 }), dan('d3', { tMax: 26 }), dan('d4'), dan('d5')];
    expect(preporukaPrihrane(d, 'UREA')[0]?.ocjena).toBe('uvjetno');
    expect(preporukaPrihrane(d, 'KAN')[0]?.ocjena).toBe('dobro');
  });
  it('smrznuto → loše', () => {
    expect(preporukaPrihrane([dan('d1', { tMin: -6 })])[0]?.ocjena).toBe('lose');
  });
});
