'use client';

import { useMemo, useState } from 'react';
import type { TrendTocka } from '@/lib/sentinel/client';
import { razred } from '../kategorije';

// Koordinatni sustav SVG-a (skalira se na širinu kartice; tekst ostaje proporcionalan)
const W = 320;
const H = 150;
const P = { l: 26, r: 8, t: 8, b: 20 };
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

const fmtDan = new Intl.DateTimeFormat('hr-HR', { day: 'numeric', month: 'short' });
const fmtMj = new Intl.DateTimeFormat('hr-HR', { month: 'short' });
const n2 = (x: number) => x.toFixed(2).replace('.', ',');
const t = (d: string) => Date.parse(`${d}T12:00:00Z`);

type Ok = Extract<TrendTocka, { status: 'ok' }>;
const p = (s: Ok['stats'], k: string) => s.percentili[`${k}.0`] ?? s.percentili[k];

/**
 * NDVI kroz sezonu: linija srednje vrijednosti, pojas 10–90 % (raznolikost unutar čestice),
 * točke u bojama NDVI legende. Oblačni dani = šuplji sivi kružić na dnu (nisu "pad" NDVI-ja).
 * Klik/tap na točku bira taj datum u panelu.
 */
export function TrendGraf({ tocke, odabrani, onOdaberi }: { tocke: TrendTocka[]; odabrani: string | null; onOdaberi: (datum: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);

  const g = useMemo(() => {
    const t0 = t(tocke[0]?.datum ?? '2026-01-01');
    const t1 = Math.max(t(tocke[tocke.length - 1]?.datum ?? '2026-01-02'), t0 + 86_400_000);
    const x = (d: string) => P.l + ((t(d) - t0) / (t1 - t0)) * (W - P.l - P.r);
    const y = (v: number) => P.t + (1 - Math.max(0, Math.min(1, v))) * (H - P.t - P.b);
    const ok = tocke.filter((q): q is Ok => q.status === 'ok');
    const linija = ok.map((q, i) => `${i ? 'L' : 'M'}${x(q.datum).toFixed(1)},${y(q.stats.mean).toFixed(1)}`).join('');
    const imaPojas = ok.length > 1 && ok.every((q) => p(q.stats, '10') !== undefined && p(q.stats, '90') !== undefined);
    const pojas = imaPojas
      ? [...ok.map((q) => `${x(q.datum).toFixed(1)},${y(p(q.stats, '90') ?? q.stats.mean).toFixed(1)}`), ...[...ok].reverse().map((q) => `${x(q.datum).toFixed(1)},${y(p(q.stats, '10') ?? q.stats.mean).toFixed(1)}`)].join(' ')
      : null;
    // mjesečne oznake: 1. u mjesecu unutar raspona
    const mjeseci: { x: number; label: string }[] = [];
    const d = new Date(t0);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.getTime() <= t1) {
      const iso = d.toISOString().slice(0, 10);
      mjeseci.push({ x: x(iso), label: fmtMj.format(d) });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return { x, y, ok, linija, pojas, mjeseci };
  }, [tocke]);

  const aktivni = tocke.find((q) => q.datum === (hover ?? odabrani));
  const brojOk = g.ok.length;

  // najbliža točka po x — veća meta od samog kružića (prst na mobitelu)
  function najbliza(evt: React.PointerEvent<SVGRectElement>) {
    const box = evt.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box) return null;
    const px = ((evt.clientX - box.left) / box.width) * W;
    let best: TrendTocka | null = null;
    for (const q of tocke) if (!best || Math.abs(g.x(q.datum) - px) < Math.abs(g.x(best.datum) - px)) best = q;
    return best?.datum ?? null;
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="min-h-5 text-xs text-zinc-700" aria-live="polite">
        {aktivni ? (
          <>
            <span className="font-semibold">{fmtDan.format(new Date(aktivni.datum))}</span>
            {' · '}
            {aktivni.status === 'ok'
              ? `NDVI ${n2(aktivni.stats.mean)} · ${razred(aktivni.stats.mean).naziv}`
              : aktivni.status === 'oblacno'
                ? 'pod oblacima'
                : 'nema snimke'}
          </>
        ) : (
          <span className="text-zinc-500">
            {brojOk} čistih snimaka od {tocke.length} — dodirni točku za taj datum
          </span>
        )}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label={`NDVI kroz sezonu, ${brojOk} čistih snimaka`}
      >
        {/* mreža i os Y — recesivno */}
        {Y_TICKS.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={g.y(v)} y2={g.y(v)} stroke="#e4e4e7" strokeWidth={1} />
            <text x={P.l - 4} y={g.y(v) + 3} textAnchor="end" fontSize={9} fill="#71717a">
              {v === 0 || v === 1 ? v : n2(v).replace(/0$/, '')}
            </text>
          </g>
        ))}
        {g.mjeseci.map((m) => (
          <g key={m.label + m.x}>
            <line x1={m.x} x2={m.x} y1={H - P.b} y2={H - P.b + 3} stroke="#a1a1aa" />
            <text x={m.x} y={H - 6} textAnchor="middle" fontSize={9} fill="#71717a">
              {m.label}
            </text>
          </g>
        ))}

        {/* odabrani datum */}
        {odabrani && tocke.some((q) => q.datum === odabrani) && (
          <line x1={g.x(odabrani)} x2={g.x(odabrani)} y1={P.t} y2={H - P.b} stroke="#3f3f46" strokeWidth={1} strokeDasharray="3 3" />
        )}

        {g.pojas && <polygon points={g.pojas} fill="#3f8f3f" fillOpacity={0.14} />}
        {g.linija && <path d={g.linija} fill="none" stroke="#2f6f2f" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}

        {tocke.map((q) =>
          q.status === 'ok' ? (
            <circle
              key={q.datum}
              cx={g.x(q.datum)}
              cy={g.y(q.stats.mean)}
              r={q.datum === odabrani || q.datum === hover ? 5.5 : 4}
              fill={razred(q.stats.mean).boja}
              stroke="#fff"
              strokeWidth={1.5}
            />
          ) : q.status === 'oblacno' ? (
            <circle key={q.datum} cx={g.x(q.datum)} cy={H - P.b - 4} r={2.5} fill="#fff" stroke="#a1a1aa" strokeWidth={1.2} />
          ) : null,
        )}

        {/* sloj za hover/tap — cijela površina grafa */}
        <rect
          x={P.l}
          y={P.t}
          width={W - P.l - P.r}
          height={H - P.t - P.b}
          fill="transparent"
          className="cursor-pointer"
          onPointerMove={(e) => setHover(najbliza(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const d = najbliza(e as unknown as React.PointerEvent<SVGRectElement>);
            if (d) onOdaberi(d);
          }}
        />
      </svg>

      <details className="text-xs">
        <summary className="cursor-pointer text-list-700">Tablica vrijednosti</summary>
        <table className="mt-1 w-full text-left">
          <thead className="text-zinc-500">
            <tr>
              <th className="font-normal">Datum</th>
              <th className="font-normal">NDVI</th>
              <th className="font-normal">10–90 %</th>
            </tr>
          </thead>
          <tbody>
            {[...tocke].reverse().map((q) => (
              <tr key={q.datum} className="border-t border-zinc-100">
                <td>{fmtDan.format(new Date(q.datum))}</td>
                <td>{q.status === 'ok' ? n2(q.stats.mean) : q.status === 'oblacno' ? '☁' : '—'}</td>
                <td>
                  {q.status === 'ok' && p(q.stats, '10') !== undefined && p(q.stats, '90') !== undefined
                    ? `${n2(p(q.stats, '10') ?? 0)}–${n2(p(q.stats, '90') ?? 0)}`
                    : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
