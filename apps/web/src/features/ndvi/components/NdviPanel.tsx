'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Cestica } from '@/lib/db';
import { dohvatiSliku, dohvatiSnimke, dohvatiStats, dohvatiTrend, SentinelKlijentGreska, type Sloj, type Snimka, type StatsIshod, type TrendTocka } from '@/lib/sentinel/client';
import { useMapStore } from '@/stores/mapStore';
import { KONTRAST_LEGENDA, NDMI_LEGENDA, NDRE_LEGENDA, NDVI_RAZREDI, razred } from '../kategorije';
import { TrendGraf } from './TrendGraf';

const SLOJ_LABEL: Record<Sloj, string> = { ndvi: 'NDVI', kontrast: 'Kontrast', prave_boje: 'Prave boje', ndmi: 'Vlaga', ndre: 'Dušik' };
const fmtDatum = new Intl.DateTimeFormat('hr-HR', { day: 'numeric', month: 'short' });
const n2 = (x: number) => x.toFixed(2).replace('.', ',');

function bboxOf(c: Cestica): [number, number, number, number] {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const poly of c.geom.coordinates)
    for (const ring of poly)
      for (const [x, y] of ring) {
        w = Math.min(w, x);
        s = Math.min(s, y);
        e = Math.max(e, x);
        n = Math.max(n, y);
      }
  return [w, s, e, n];
}

type Stanje<T> = { status: 'ucitavam' } | { status: 'greska'; poruka: string } | { status: 'ok'; data: T };
const poruka = (err: unknown) => (err instanceof SentinelKlijentGreska ? err.message : 'Nešto je pošlo po zlu.');

export function NdviPanel({ cestica }: { cestica: Cestica }) {
  const postaviOverlay = useMapStore((s) => s.postaviOverlay);
  // Panel je ključan po čestici (key={id}), pa se stanje resetira samim remountom.
  const [snimke, setSnimke] = useState<Stanje<Snimka[]>>({ status: 'ucitavam' });
  const [odabraniDatum, setDatum] = useState<string | null>(null);
  const [sloj, setSloj] = useState<Sloj>('ndvi');
  // rezultati se pamte uz ključ zahtjeva; "učitavam" = ključ se ne poklapa s trenutnim odabirom
  const [statsRez, setStatsRez] = useState<{ kljuc: string; s: Stanje<StatsIshod> } | null>(null);
  const [slikaRez, setSlikaRez] = useState<{ kljuc: string; s: Stanje<true> } | null>(null);
  const bbox = useMemo(() => bboxOf(cestica), [cestica]);

  // zadani datum: prvi s razumnom oblačnošću scene; inače najnoviji
  const datum =
    odabraniDatum ?? (snimke.status === 'ok' ? ((snimke.data.find((x) => (x.oblacnost ?? 0) <= 40) ?? snimke.data[0])?.datum ?? null) : null);

  // 0) trend kroz sezonu — neovisno o odabranom datumu
  const [trend, setTrend] = useState<Stanje<TrendTocka[]>>({ status: 'ucitavam' });
  useEffect(() => {
    let aktivno = true;
    dohvatiTrend(cestica.id)
      .then((d) => aktivno && setTrend({ status: 'ok', data: d }))
      .catch((e) => aktivno && setTrend({ status: 'greska', poruka: poruka(e) }));
    return () => {
      aktivno = false;
    };
  }, [cestica.id]);

  // 1) dostupni datumi
  useEffect(() => {
    let aktivno = true;
    dohvatiSnimke(cestica.id)
      .then((d) => aktivno && setSnimke({ status: 'ok', data: d }))
      .catch((e) => aktivno && setSnimke({ status: 'greska', poruka: poruka(e) }));
    return () => {
      aktivno = false;
    };
  }, [cestica.id]);

  // 2) statistike za odabrani datum
  useEffect(() => {
    if (!datum) return;
    let aktivno = true;
    dohvatiStats(cestica.id, datum)
      .then((d) => aktivno && setStatsRez({ kljuc: datum, s: { status: 'ok', data: d } }))
      .catch((e) => aktivno && setStatsRez({ kljuc: datum, s: { status: 'greska', poruka: poruka(e) } }));
    return () => {
      aktivno = false;
    };
  }, [cestica.id, datum]);
  const stats: Stanje<StatsIshod> | null = !datum ? null : statsRez?.kljuc === datum ? statsRez.s : { status: 'ucitavam' };

  // 3) slika — samo ako statistika kaže da ima čistih piksela
  const imaPiksela = stats?.status === 'ok' && stats.data.status === 'ok';
  const slikaKljuc = datum && imaPiksela ? `${datum}|${sloj}` : null;
  useEffect(() => {
    if (!slikaKljuc || !datum) {
      postaviOverlay(null);
      return;
    }
    let aktivno = true;
    dohvatiSliku(cestica.id, datum, sloj)
      .then((url) => {
        if (!aktivno) return URL.revokeObjectURL(url);
        postaviOverlay({ cesticaId: cestica.id, url, bbox });
        setSlikaRez({ kljuc: slikaKljuc, s: { status: 'ok', data: true } });
      })
      .catch((e) => aktivno && setSlikaRez({ kljuc: slikaKljuc, s: { status: 'greska', poruka: poruka(e) } }));
    return () => {
      aktivno = false;
    };
  }, [cestica.id, datum, sloj, slikaKljuc, bbox, postaviOverlay]);
  const slikaStanje: Stanje<true> | null = !slikaKljuc ? null : slikaRez?.kljuc === slikaKljuc ? slikaRez.s : { status: 'ucitavam' };

  // makni snimku kad se panel zatvori
  useEffect(() => () => postaviOverlay(null), [postaviOverlay]);

  return (
    // bez vlastitog okvira i zaglavlja — to daje CesticaPanel (zajedničko za NDVI i Operacije)
    <div className="flex flex-col gap-3">
      {/* Datumi */}
      {snimke.status === 'ucitavam' && <p className="text-sm text-zinc-500">Tražim satelitske snimke…</p>}
      {snimke.status === 'greska' && <p role="alert" className="text-sm text-red-700">{snimke.poruka}</p>}
      {snimke.status === 'ok' && snimke.data.length === 0 && <p className="text-sm text-zinc-600">Nema snimaka u zadnjih 150 dana.</p>}
      {snimke.status === 'ok' && snimke.data.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="listbox" aria-label="Datum snimke">
          {snimke.data.map((s) => (
            <button
              key={s.datum}
              role="option"
              aria-selected={s.datum === datum}
              onClick={() => setDatum(s.datum)}
              className={`flex min-h-11 flex-shrink-0 flex-col items-center justify-center rounded-lg px-2.5 text-xs ring-1 ${
                s.datum === datum ? 'bg-list-600 text-white ring-list-600' : 'bg-white ring-zinc-300'
              }`}
            >
              <span className="font-semibold">{fmtDatum.format(new Date(s.datum))}</span>
              {s.oblacnost !== null && <span className="opacity-80">☁ {Math.round(s.oblacnost)}%</span>}
            </button>
          ))}
        </div>
      )}

      {/* Slojevi */}
      {datum && (
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1" role="tablist" aria-label="Sloj">
          {(Object.keys(SLOJ_LABEL) as Sloj[]).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={s === sloj}
              onClick={() => setSloj(s)}
              className={`min-h-10 rounded-md text-sm font-medium ${s === sloj ? 'bg-white shadow-sm' : 'text-zinc-600'}`}
            >
              {SLOJ_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {/* Statistike */}
      {stats?.status === 'ucitavam' && <p className="text-sm text-zinc-500">Računam NDVI…</p>}
      {stats?.status === 'greska' && <p role="alert" className="text-sm text-red-700">{stats.poruka}</p>}
      {stats?.status === 'ok' && stats.data.status === 'oblacno' && (
        <p className="rounded-lg bg-zinc-100 p-2 text-sm">
          ☁ Čestica je taj dan bila pod oblacima ({Math.round(stats.data.oblacnostPct)} %). Odaberi drugi datum.
        </p>
      )}
      {stats?.status === 'ok' && stats.data.status === 'nema_snimke' && <p className="text-sm text-zinc-600">Za taj datum nema snimke preko čestice.</p>}
      {stats?.status === 'ok' && stats.data.status === 'ok' && <Statistike s={stats.data.stats} />}

      {slikaStanje?.status === 'ucitavam' && <p className="text-xs text-zinc-500">Učitavam snimku…</p>}
      {slikaStanje?.status === 'greska' && <p role="alert" className="text-xs text-red-700">Snimka: {slikaStanje.poruka}</p>}

      {imaPiksela && <Legenda sloj={sloj} />}

      {/* Kroz sezonu */}
      <section className="border-t border-zinc-200 pt-2" aria-label="NDVI kroz sezonu">
        <p className="mb-1 text-sm font-semibold">Kroz sezonu</p>
        {trend.status === 'ucitavam' && <p className="text-xs text-zinc-500">Računam NDVI za sve snimke… (prvi put do pola minute)</p>}
        {trend.status === 'greska' && <p role="alert" className="text-xs text-red-700">{trend.poruka}</p>}
        {trend.status === 'ok' && trend.data.length > 0 && <TrendGraf tocke={trend.data} odabrani={datum} onOdaberi={setDatum} />}
      </section>
    </div>
  );
}

function Statistike({ s }: { s: Extract<StatsIshod, { status: 'ok' }>['stats'] }) {
  const r = razred(s.mean);
  const p = (k: string) => s.percentili[`${k}.0`] ?? s.percentili[k];
  const p10 = p('10');
  const p90 = p('90');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 flex-shrink-0 rounded-lg" style={{ background: r.boja }} aria-hidden />
        <div>
          <p className="text-2xl font-bold leading-none">{n2(s.mean)}</p>
          <p className="text-sm text-zinc-600">{r.naziv}</p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-1 text-center text-xs">
        <div className="rounded bg-zinc-100 p-1">
          <dt className="text-zinc-500">Min</dt>
          <dd className="font-semibold">{n2(s.min)}</dd>
        </div>
        <div className="rounded bg-zinc-100 p-1">
          <dt className="text-zinc-500">{p10 !== undefined && p90 !== undefined ? '10–90 %' : 'St. dev.'}</dt>
          <dd className="font-semibold">{p10 !== undefined && p90 !== undefined ? `${n2(p10)}–${n2(p90)}` : n2(s.stdev)}</dd>
        </div>
        <div className="rounded bg-zinc-100 p-1">
          <dt className="text-zinc-500">Max</dt>
          <dd className="font-semibold">{n2(s.max)}</dd>
        </div>
      </dl>
      {s.oblacnostPct > 5 && <p className="text-xs text-amber-800">☁ {Math.round(s.oblacnostPct)} % čestice pod oblakom — statistika je samo iz čistog dijela.</p>}
    </div>
  );
}

function Legenda({ sloj }: { sloj: Sloj }) {
  if (sloj === 'prave_boje') return null;
  if (sloj === 'ndmi')
    return (
      <div>
        <p className="mb-1 text-xs text-zinc-600">NDMI — vlaga u biljci (piksel 20 m)</p>
        <ul className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-xs">
          {NDMI_LEGENDA.map((r) => (
            <li key={r.naziv} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm ring-1 ring-zinc-300" style={{ background: r.boja }} aria-hidden />
              {r.naziv}
            </li>
          ))}
        </ul>
      </div>
    );
  if (sloj === 'ndre')
    return (
      <div>
        <p className="mb-1 text-xs text-zinc-600">NDRE — klorofil / dušik; razlikuje gust usjev gdje je NDVI već pun (piksel 20 m)</p>
        <div className="flex h-2.5 overflow-hidden rounded-full ring-1 ring-zinc-200">
          {NDRE_LEGENDA.map((b) => (
            <span key={b} className="flex-1" style={{ background: b }} />
          ))}
        </div>
        <p className="mt-1 flex justify-between text-xs text-zinc-600">
          <span>manje (&lt; 0,1)</span>
          <span>više (&gt; 0,5)</span>
        </p>
      </div>
    );
  if (sloj === 'kontrast')
    return (
      <div>
        <div className="flex h-2.5 overflow-hidden rounded-full">
          {KONTRAST_LEGENDA.map((b) => (
            <span key={b} className="flex-1" style={{ background: b }} />
          ))}
        </div>
        <p className="mt-1 flex justify-between text-xs text-zinc-600">
          <span>slabije u čestici</span>
          <span>jače u čestici</span>
        </p>
      </div>
    );
  return (
    <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
      {NDVI_RAZREDI.slice(1).map((r) => (
        <li key={r.naziv} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: r.boja }} aria-hidden />
          {r.naziv}
        </li>
      ))}
    </ul>
  );
}
