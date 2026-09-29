'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { opisOperacije, operacijeCsv, TIP_LABEL, TIPOVI_OPERACIJA, ukupnoInputa, type TipOperacije } from '@m-agro/domain';
import type { OperacijaSCesticom } from '@/lib/db';
import { obrisiOperaciju } from '../actions';

const fmtDatum = new Intl.DateTimeFormat('hr-HR', { day: 'numeric', month: 'numeric', year: 'numeric' });
const fmtBroj = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 1 });
const fmtHa = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 });
const UNDO_MS = 5000;

const TIP_BOJA: Record<TipOperacije, string> = {
  sjetva: 'bg-amber-100 text-amber-900',
  prihrana: 'bg-sky-100 text-sky-900',
  zastita: 'bg-violet-100 text-violet-900',
  zetva: 'bg-yellow-100 text-yellow-900',
  obrada: 'bg-stone-200 text-stone-900',
  ostalo: 'bg-zinc-100 text-zinc-800',
};

const norm = (s: string) => s.toLocaleLowerCase('hr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/**
 * Sve operacije gospodarstva za godinu: filtri (vrsta, čestica, tekst), ukupna potrošnja inputa,
 * CSV za Excel i brisanje s poništavanjem (5 s) — briše se tek kad istekne rok.
 */
export function PregledOperacija({
  operacije,
  godina,
  smijeBrisati,
  gospodarstvoId,
}: {
  operacije: OperacijaSCesticom[];
  godina: number;
  smijeBrisati: boolean;
  gospodarstvoId: string;
}) {
  const [tip, setTip] = useState<TipOperacije | null>(null);
  const [cesticaId, setCesticaId] = useState('');
  const [trazi, setTrazi] = useState('');
  const [obrisane, setObrisane] = useState<Set<string>>(new Set());
  const [ceka, setCeka] = useState<OperacijaSCesticom | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cekaRef = useRef<OperacijaSCesticom | null>(null);

  const zive = useMemo(() => operacije.filter((o) => !obrisane.has(o.id) && o.id !== ceka?.id), [operacije, obrisane, ceka]);
  const cestice = useMemo(() => [...new Map(operacije.map((o) => [o.cesticaId, o.cesticaNaziv])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'hr')), [operacije]);

  const bezTipa = useMemo(() => {
    const q = norm(trazi.trim());
    return zive.filter(
      (o) =>
        (!cesticaId || o.cesticaId === cesticaId) &&
        (!q || norm([o.cesticaNaziv, o.kultura, o.sorta, o.fert, o.product, o.note].filter(Boolean).join(' ')).includes(q)),
    );
  }, [zive, cesticaId, trazi]);
  const prikaz = useMemo(() => (tip ? bezTipa.filter((o) => o.tip === tip) : bezTipa), [bezTipa, tip]);
  const brojPoTipu = useMemo(() => {
    const m = new Map<TipOperacije, number>();
    for (const o of bezTipa) m.set(o.tip, (m.get(o.tip) ?? 0) + 1);
    return m;
  }, [bezTipa]);
  const ukupno = useMemo(() => ukupnoInputa(prikaz), [prikaz]);

  // ---- brisanje s poništavanjem ----
  async function izvrsi(o: OperacijaSCesticom) {
    try {
      const r = await obrisiOperaciju(o.id);
      if (r.ok) setObrisane((s) => new Set(s).add(o.id));
      else setGreska(r.poruka);
    } catch {
      setGreska('Brisanje traži internet — operacija nije obrisana.');
    }
  }
  function obrisi(o: OperacijaSCesticom) {
    setGreska(null);
    if (timer.current && cekaRef.current) void izvrsi(cekaRef.current); // prethodna odmah
    if (timer.current) clearTimeout(timer.current);
    cekaRef.current = o;
    setCeka(o);
    timer.current = setTimeout(() => {
      timer.current = null;
      cekaRef.current = null;
      setCeka(null);
      void izvrsi(o);
    }, UNDO_MS);
  }
  function ponisti() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    cekaRef.current = null;
    setCeka(null);
  }
  // odlazak sa stranice prije isteka = brisanje se ipak izvrši
  useEffect(
    () => () => {
      if (timer.current && cekaRef.current) {
        clearTimeout(timer.current);
        void obrisiOperaciju(cekaRef.current.id).catch(() => undefined);
      }
    },
    [],
  );

  function izvoz() {
    const blob = new Blob([operacijeCsv(prikaz)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `operacije-${godina}${tip ? `-${tip}` : ''}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-zemlja-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-3">
        {/* Filtri */}
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Vrsta operacije">
            <Chip aktivan={tip === null} onClick={() => setTip(null)}>
              Sve ({bezTipa.length})
            </Chip>
            {TIPOVI_OPERACIJA.filter((t) => brojPoTipu.get(t)).map((t) => (
              <Chip key={t} aktivan={tip === t} onClick={() => setTip(tip === t ? null : t)}>
                {TIP_LABEL[t]} ({brojPoTipu.get(t)})
              </Chip>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={cesticaId} onChange={(e) => setCesticaId(e.target.value)} aria-label="Čestica" className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 sm:w-56">
              <option value="">Sve čestice</option>
              {cestice.map(([id, naziv]) => (
                <option key={id} value={id}>
                  {naziv}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={trazi}
              onChange={(e) => setTrazi(e.target.value)}
              placeholder="Traži: KAN, pšenica, sorta, bilješka…"
              aria-label="Pretraga"
              className="min-h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-3"
            />
          </div>
        </div>

        {/* Ukupna potrošnja */}
        {ukupno.length > 0 && (
          <section className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200" aria-label="Ukupna potrošnja">
            <h2 className="mb-2 text-sm font-semibold">Ukupno potrošeno ({godina}{tip ? `, ${TIP_LABEL[tip].toLowerCase()}` : ''})</h2>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {ukupno.map((u) => (
                <li key={`${u.tip}${u.naziv}${u.jedinica}`} className="flex items-baseline justify-between gap-2 rounded-lg bg-zinc-50 px-2 py-1">
                  <span className="min-w-0 truncate">
                    <span className={`mr-1 rounded px-1 text-xs font-semibold ${TIP_BOJA[u.tip]}`}>{TIP_LABEL[u.tip]}</span>
                    {u.naziv}
                  </span>
                  <span className="flex-shrink-0 text-right">
                    <strong>
                      {fmtBroj.format(u.ukupno)} {u.jedinica}
                    </strong>
                    <span className="block text-xs text-zinc-500">
                      {fmtHa.format(u.ha)} ha · {u.primjena}×
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-zinc-600">{prikaz.length} operacija</p>
          <a href={`/ispis/gospodarstvo/${gospodarstvoId}?godina=${godina}`} className="ml-auto min-h-11 rounded-lg px-3 py-3 text-sm font-semibold text-list-700 ring-1 ring-zinc-300 hover:bg-list-500/10">
            Godišnji izvještaj (PDF)
          </a>
          {prikaz.length > 0 && (
            <button type="button" onClick={izvoz} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-list-700 ring-1 ring-zinc-300 hover:bg-list-500/10">
              Izvoz za Excel (CSV)
            </button>
          )}
        </div>

        {greska && (
          <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
            {greska}
          </p>
        )}

        {operacije.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-zinc-600 ring-1 ring-zinc-200">
            U {godina}. još nema upisanih operacija. Upisuju se na karti: odaberi česticu → tab Operacije.
          </p>
        ) : prikaz.length === 0 ? (
          <p className="p-4 text-center text-sm text-zinc-600">Nijedna operacija ne odgovara filtrima.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
            {prikaz.map((o) => {
              const opis = opisOperacije(o);
              return (
                <li key={o.id} className="flex items-start gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${TIP_BOJA[o.tip]}`}>{TIP_LABEL[o.tip]}</span>
                      <span className="text-sm font-semibold">{o.cesticaNaziv}</span>
                      <span className="text-xs text-zinc-500">
                        {fmtHa.format(o.cesticaHa)} ha · {fmtDatum.format(new Date(`${o.datum}T12:00:00`))}
                      </span>
                    </div>
                    {opis && <p className="mt-0.5 text-sm">{opis}</p>}
                    {o.note && o.tip !== 'ostalo' && <p className="mt-0.5 text-xs text-zinc-600">{o.note}</p>}
                  </div>
                  {smijeBrisati && (
                    <button
                      type="button"
                      onClick={() => obrisi(o)}
                      aria-label={`Obriši ${TIP_LABEL[o.tip]} ${o.cesticaNaziv} ${o.datum}`}
                      className="min-h-11 min-w-11 flex-shrink-0 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-red-700"
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {ceka && (
        <div role="status" className="fixed inset-x-3 bottom-4 z-20 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
          <span className="min-w-0 truncate">
            Obrisano: {TIP_LABEL[ceka.tip]} · {ceka.cesticaNaziv}
          </span>
          <button type="button" onClick={ponisti} className="min-h-11 flex-shrink-0 px-2 font-semibold text-amber-300">
            Poništi
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ aktivan, onClick, children }: { aktivan: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={aktivan}
      onClick={onClick}
      className={`min-h-11 rounded-full px-3 text-sm font-semibold ring-1 ${aktivan ? 'bg-list-600 text-white ring-list-600' : 'bg-white text-zinc-700 ring-zinc-300'}`}
    >
      {children}
    </button>
  );
}
