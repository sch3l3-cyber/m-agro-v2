'use client';

import { useMemo, useState } from 'react';
import { dohvatiVisegodisnje, SentinelKlijentGreska, type MjesecNdvi } from '@/lib/sentinel/client';

const W = 320;
const H = 150;
const P = { l: 26, r: 8, t: 8, b: 20 };
const MJ = ['sij', 'velj', 'ožu', 'tra', 'svi', 'lip', 'srp', 'kol', 'ruj', 'lis', 'stu', 'pro'];
const n2 = (x: number) => x.toFixed(2).replace('.', ',');

type Stanje = { status: 'mirno' } | { status: 'ucitavam' } | { status: 'greska'; poruka: string } | { status: 'ok'; data: MjesecNdvi[] };

/**
 * Usporedba sezona: x = mjesec (sij–pro), jedna linija po godini (mjesečni max-NDVI).
 * Odabrana godina zelena i debela, ostale tanke sive (kontekst) — bez 9 kategorijskih boja.
 * Učitava se na zahtjev (skuplji Sentinel poziv; poslije 7 dana u cacheu).
 */
export function VisegodisnjiGraf({ cesticaId }: { cesticaId: string }) {
  const [stanje, setStanje] = useState<Stanje>({ status: 'mirno' });
  const [godina, setGodina] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  function ucitaj() {
    setStanje({ status: 'ucitavam' });
    dohvatiVisegodisnje(cesticaId)
      .then((d) => setStanje({ status: 'ok', data: d }))
      .catch((e) => setStanje({ status: 'greska', poruka: e instanceof SentinelKlijentGreska ? e.message : 'Nešto je pošlo po zlu.' }));
  }

  const poGodinama = useMemo(() => {
    const m = new Map<number, (MjesecNdvi | undefined)[]>();
    if (stanje.status !== 'ok') return m;
    for (const x of stanje.data) {
      const g = Number(x.mjesec.slice(0, 4));
      const i = Number(x.mjesec.slice(5, 7)) - 1;
      const arr = m.get(g) ?? new Array<MjesecNdvi | undefined>(12).fill(undefined);
      arr[i] = x;
      m.set(g, arr);
    }
    return m;
  }, [stanje]);
  const godine = [...poGodinama.keys()].sort((a, b) => b - a);
  const aktivna = godina ?? godine[0] ?? null;

  if (stanje.status === 'mirno')
    return (
      <button type="button" onClick={ucitaj} className="min-h-11 w-full rounded-lg text-sm font-semibold text-list-700 ring-1 ring-zinc-300 hover:bg-list-500/10">
        Prikaži po godinama (od 2017.)
      </button>
    );
  if (stanje.status === 'ucitavam') return <p className="text-xs text-zinc-500">Računam NDVI za sve godine od 2017… (prvi put do minute)</p>;
  if (stanje.status === 'greska')
    return (
      <p role="alert" className="text-xs text-red-700">
        {stanje.poruka}{' '}
        <button type="button" onClick={ucitaj} className="font-semibold underline">
          Pokušaj ponovo
        </button>
      </p>
    );
  if (godine.length === 0) return <p className="text-xs text-zinc-600">Nema čistih snimaka za ovu česticu.</p>;

  const x = (i: number) => P.l + (i / 11) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - Math.max(0, Math.min(1, v))) * (H - P.t - P.b);
  const linija = (arr: (MjesecNdvi | undefined)[]) => {
    let d = '';
    let prekid = true;
    arr.forEach((m, i) => {
      if (!m) {
        prekid = true;
        return;
      }
      d += `${prekid ? 'M' : 'L'}${x(i).toFixed(1)},${y(m.mean).toFixed(1)}`;
      prekid = false;
    });
    return d;
  };
  const aktivnaArr = aktivna !== null ? poGodinama.get(aktivna) : undefined;
  const hoverTocka = hover !== null ? aktivnaArr?.[hover] : undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label="Godina">
        {godine.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={g === aktivna}
            onClick={() => setGodina(g)}
            className={`min-h-9 flex-shrink-0 rounded-full px-2.5 text-xs font-semibold ring-1 ${g === aktivna ? 'bg-list-600 text-white ring-list-600' : 'bg-white text-zinc-700 ring-zinc-300'}`}
          >
            {g}
          </button>
        ))}
      </div>
      <p className="min-h-5 text-xs text-zinc-700" aria-live="polite">
        {hover !== null ? (
          <>
            <span className="font-semibold">
              {MJ[hover]} {aktivna}
            </span>
            {' · '}
            {hoverTocka ? `NDVI ${n2(hoverTocka.mean)}` : 'nema čiste snimke'}
          </>
        ) : (
          <span className="text-zinc-500">Zeleno: {aktivna} · sivo: ostale godine (mjesečni vrhunac NDVI-ja)</span>
        )}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none select-none" role="img" aria-label={`NDVI po mjesecima, ${aktivna} u usporedbi s ostalim godinama`}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#e4e4e7" />
            <text x={P.l - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#71717a">
              {v === 0 || v === 1 ? v : n2(v).replace(/0$/, '')}
            </text>
          </g>
        ))}
        {MJ.map((m, i) =>
          i % 2 === 0 ? (
            <text key={m} x={x(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="#71717a">
              {m}
            </text>
          ) : null,
        )}
        {godine
          .filter((g) => g !== aktivna)
          .map((g) => (
            <path key={g} d={linija(poGodinama.get(g) ?? [])} fill="none" stroke="#a1a1aa" strokeWidth={1} strokeOpacity={0.7} />
          ))}
        {aktivnaArr && (
          <>
            <path d={linija(aktivnaArr)} fill="none" stroke="#2f6f2f" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {aktivnaArr.map((m, i) => (m ? <circle key={i} cx={x(i)} cy={y(m.mean)} r={hover === i ? 5 : 3.5} fill="#2f6f2f" stroke="#fff" strokeWidth={1.5} /> : null))}
          </>
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="#3f3f46" strokeDasharray="3 3" />}
        <rect
          x={P.l}
          y={P.t}
          width={W - P.l - P.r}
          height={H - P.t - P.b}
          fill="transparent"
          onPointerMove={(e) => {
            const b = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
            if (!b) return;
            const px = ((e.clientX - b.left) / b.width) * W;
            setHover(Math.max(0, Math.min(11, Math.round(((px - P.l) / (W - P.l - P.r)) * 11))));
          }}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
    </div>
  );
}
