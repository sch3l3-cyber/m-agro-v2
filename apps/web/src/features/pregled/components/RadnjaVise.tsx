'use client';

import { useMemo, useState } from 'react';
import { sazetakKultura } from '@m-agro/domain';
import type { Cestica } from '@/lib/db';
import { OperacijaForma } from '@/features/operacije/components/OperacijeTab';

const ha = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 1 });
const BEZ_KULTURE = '__bez__';
const kljucKulture = (c: Cestica) => c.kultura?.trim() || BEZ_KULTURE;

/** Korak 1: na kojim česticama (po kulturama, „odaberi sve”) → korak 2: ista forma radnje za sve odabrane. */
export function RadnjaVise({
  cestice,
  gospodarstvoId,
  pocetniFiltar,
  onGotovo,
  onOdustani,
}: {
  cestice: Cestica[];
  gospodarstvoId: string;
  pocetniFiltar: string | null;
  onGotovo: (poruka?: string) => void;
  onOdustani: () => void;
}) {
  const [odabrane, setOdabrane] = useState<Set<string>>(() => new Set(pocetniFiltar ? cestice.filter((c) => kljucKulture(c) === pocetniFiltar).map((c) => c.id) : []));
  const [korak, setKorak] = useState<1 | 2>(1);
  const [trazi, setTrazi] = useState('');
  const grupe = useMemo(() => sazetakKultura(cestice).map((k) => ({ ...k, kljuc: k.kultura ?? BEZ_KULTURE, cestice: cestice.filter((c) => kljucKulture(c) === (k.kultura ?? BEZ_KULTURE)).sort((a, b) => a.naziv.localeCompare(b.naziv, 'hr')) })), [cestice]);
  const odabraneLista = cestice.filter((c) => odabrane.has(c.id));
  const odabranoHa = odabraneLista.reduce((s, c) => s + c.povrsinaHa, 0);
  const kulture = new Set(odabraneLista.map((c) => c.kultura?.trim()).filter(Boolean));
  const zajednickaKultura = kulture.size === 1 ? ([...kulture][0] ?? null) : null;

  const prebaci = (ids: string[], ukljuci: boolean) =>
    setOdabrane((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (ukljuci) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  if (korak === 2) {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => setKorak(1)} className="self-start text-sm font-semibold text-list-700">
          ← {odabrane.size} {odabrane.size === 1 ? 'čestica' : 'čestica'} · {ha.format(odabranoHa)} ha (promijeni)
        </button>
        <OperacijaForma
          cesticeIds={[...odabrane]}
          gospodarstvoId={gospodarstvoId}
          kultura={zajednickaKultura}
          gumb={odabrane.size > 1 ? `Spremi na ${odabrane.size} čestica` : 'Spremi'}
          onGotovo={onGotovo}
          onOdustani={onOdustani}
        />
      </div>
    );
  }

  const t = trazi.trim().toLowerCase();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Na kojim česticama?</h2>
        <button type="button" onClick={onOdustani} className="min-h-11 px-2 text-sm text-zinc-600">
          Odustani
        </button>
      </div>
      {odabrane.size > 0 && (
        <button type="button" onClick={() => setKorak(2)} className="min-h-12 rounded-xl bg-list-600 font-semibold text-white">
          Dalje · {odabrane.size} čestica · {ha.format(odabranoHa)} ha
        </button>
      )}
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
      {/* bez position:sticky (lekcija #6) — gumb je i gore i dolje */}
      <div className="pt-1">
        <button
          type="button"
          disabled={odabrane.size === 0}
          onClick={() => setKorak(2)}
          className="min-h-12 w-full rounded-xl bg-list-600 font-semibold text-white disabled:opacity-50"
        >
          {odabrane.size === 0 ? 'Odaberi čestice' : `Dalje · ${odabrane.size} čestica · ${ha.format(odabranoHa)} ha`}
        </button>
      </div>
    </div>
  );
}
