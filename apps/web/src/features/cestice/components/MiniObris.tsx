import { memo } from 'react';
import type { RawMultiPolygon } from '@m-agro/domain';

/** Mala SVG kontura čestice u listi (v1 feature). Memoizirano — računa se jednom. */
export const MiniObris = memo(function MiniObris({ geom, boja }: { geom: RawMultiPolygon; boja: string }) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of geom.coordinates)
    for (const [x, y] of poly[0] ?? []) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  // korekcija za geografsku širinu da oblik ne bude razvučen
  const kx = Math.cos(((minY + maxY) / 2) * (Math.PI / 180));
  const w = (maxX - minX) * kx || 1e-9;
  const h = maxY - minY || 1e-9;
  const s = 36 / Math.max(w, h);
  const d = geom.coordinates
    .map((poly) =>
      (poly[0] ?? [])
        .map(([x, y], i) => `${i ? 'L' : 'M'}${(((x - minX) * kx * s) + (40 - w * s) / 2).toFixed(1)},${((maxY - y) * s + (40 - h * s) / 2).toFixed(1)}`)
        .join('') + 'Z',
    )
    .join('');
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 flex-shrink-0" aria-hidden>
      <path d={d} fill={boja} fillOpacity={0.5} stroke={boja} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
});
