import proj4 from 'proj4';
import { describe, expect, it } from 'vitest';
import './reproject'; // registrira EPSG:3765 u proj4
import { htrs96UWgs84, wgs84UHtrs96 } from './htrs96';

const tocke: [number, number][] = [
  [18.3425, 45.3607], // Đakovo
  [13.5, 45.2], // Istra
  [19.4, 45.2], // Ilok
  [18.1, 42.6], // Dubrovnik
  [16.0, 46.4], // Čakovec
];

describe('HTRS96/TM bez proj4', () => {
  it('naprijed: isto kao proj4 (< 1 mm)', () => {
    for (const [lon, lat] of tocke) {
      const [x, y] = wgs84UHtrs96(lon, lat);
      const [px, py] = proj4('EPSG:4326', 'EPSG:3765', [lon, lat]) as [number, number];
      expect(Math.abs(x - px)).toBeLessThan(0.001);
      expect(Math.abs(y - py)).toBeLessThan(0.001);
    }
  });
  it('natrag: isto kao proj4 (< 1e-8° ≈ 1 mm)', () => {
    for (const [lon, lat] of tocke) {
      const [x, y] = proj4('EPSG:4326', 'EPSG:3765', [lon, lat]) as [number, number];
      const [l2, b2] = htrs96UWgs84(x, y);
      expect(Math.abs(l2 - lon)).toBeLessThan(1e-8);
      expect(Math.abs(b2 - lat)).toBeLessThan(1e-8);
    }
  });
});
