import { describe, expect, it } from 'vitest';
import { assertWGS84, isWGS84Range, NotWGS84Error, toMultiPolygon, type RawPolygon } from '../src/geo';

const square = (x: number, y: number, d: number): RawPolygon => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]],
});

describe('WGS84 granica (lekcija #3)', () => {
  it('prihvaća česticu kod Satnice Đakovačke', () => {
    const g = assertWGS84(square(18.3, 45.32, 0.01));
    expect(g.type).toBe('Polygon');
  });

  it('odbija neprojicirane EPSG:3765 metre', () => {
    expect(() => assertWGS84(square(641750, 5022298, 100))).toThrow(NotWGS84Error);
    expect(isWGS84Range(square(641750, 5022298, 100))).toBe(false);
  });

  it('odbija nezatvoren prsten', () => {
    expect(() =>
      assertWGS84({ type: 'Polygon', coordinates: [[[18, 45], [18.1, 45], [18.1, 45.1], [18, 45.1]]] }),
    ).toThrow(/nije zatvoren/);
  });

  it('odbija NaN/Infinity', () => {
    expect(() => assertWGS84(square(Number.NaN, 45, 0.01))).toThrow();
    expect(() => assertWGS84(square(Number.POSITIVE_INFINITY, 45, 0.01))).toThrow();
  });

  it('odbija Point i ostale tipove', () => {
    expect(() => assertWGS84({ type: 'Point', coordinates: [18, 45] })).toThrow();
  });

  it('normalizira Polygon u MultiPolygon', () => {
    const mp = toMultiPolygon(assertWGS84(square(18.3, 45.32, 0.01)));
    expect(mp.type).toBe('MultiPolygon');
    expect(mp.coordinates).toHaveLength(1);
  });
});
