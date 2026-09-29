'use client';

import { useMemo, useState } from 'react';
import { sazetakKultura } from '@m-agro/domain';
import type { Cestica } from '@/lib/db';

const ha = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 1 });
export const BEZ_KULTURE = '__bez__';
export const kljucKulture = (c: { kultura: string | null }) => c.kultura?.trim() || BEZ_KULTURE;

/** Odabir više čestica: po kulturi („Odaberi sve”), pretraga po nazivu. Gumb „Dalje” gore i dolje (bez sticky — lekcija #6). */
export function OdabirCestica({
  cestice,
  odabrane,
  setOdabrane,
  naslov,
  onDalje,
  onOdustani,
}: {
  cestice: Cestica[];
  odabrane: Set<string>;
  setOdabrane: (f: (s: Set<string>) => Set<string>) => void;
  naslov: string;
  onDalje: () => void;
  onOdustani: () => void;
}) {
  const [trazi, setTrazi] = useState('');
  const grupe = useMemo(
    () =>
      sazetakKultura(cestice).map((k) => ({
        ...k,
        kljuc: k.kultura ?? BEZ_KULTURE,
        cestice: cestice.filter((c) => kljucKulture(c) === (k.kultura ?? BEZ_KULTURE)).sort((a, b) => a.naziv.localeCompare(b.naziv, 'hr')),
      })),
    [cestice],
  );
  const odabranoHa = cestice.filter((c) => odabrane.has(c.id)).reduce((s, c) => s + c.povrsinaHa, 0);
  const prebaci = (ids: string[], ukljuci: boolean) =>
    setOdabrane((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (ukljuci) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  const dalje = (
    <button type="button" disabled={odabrane.size === 0} onClick={onDalje} className="min-h-12 w-full rounded-xl bg-list-600 font-semibold text-white disabled:opacity-50">
      {odabrane.size === 0 ? 'Odaberi čestice' : `Dalje · ${odabrane.size} čestica · ${ha.format(odabranoHa)} ha`}
    </button>
  );
  const t = trazi.trim().toLowerCase();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{naslov}</h2>
        <button type="button" onClick={onOdustani} className="min-h-11 px-2 text-sm text-zinc-600">
          Odustani
        </button>
      </div>
      {odabrane.size > 0 && dalje}
      <input
        value={trazi}
        onChange={(e) => setTrazi(e.target.value)}
        placeholder="Traži po nazivu…"
        aria-label="Traži česticu po nazivu"
        className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base focus:border-list-600 focus:outline-none"
      />
      {grupe.map((g) => {
        const vidljive = t ? g.cestice.filter((c) => c.naziv.toLowerCase().includes(t)) : g.cestice;
        if (vidljive.length === 0) return null;
        const sveOdabrane = vidljive.every((c) => odabrane.has(c.id));
        return (
          <section key={g.kljuc} className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
            <div className="flex items-center justify-between gap-2 bg-zinc-50 px-3 py-1">
              <span className="text-sm font-semibold">
                {g.kultura ?? 'Bez kulture'} <span className="font-normal text-zinc-600">· {g.broj} · {ha.format(g.ha)} ha</span>
              </span>
              <button type="button" onClick={() => prebaci(vidljive.map((c) => c.id), !sveOdabrane)} className="min-h-11 px-2 text-sm font-semibold text-list-700">
                {sveOdabrane ? 'Poništi' : 'Odaberi sve'}
              </button>
            </div>
            <ul className="divide-y divide-zinc-100">
              {vidljive.map((c) => (
                <li key={c.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3">
                    <input type="checkbox" checked={odabrane.has(c.id)} onChange={(e) => prebaci([c.id], e.target.checked)} className="h-5 w-5 accent-list-600" />
                    <span className="min-w-0 flex-1 truncate">{c.naziv}</span>
                    <span className="text-sm text-zinc-600">{ha.format(c.povrsinaHa)} ha</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <div className="pt-1">{dalje}</div>
    </div>
  );
}
