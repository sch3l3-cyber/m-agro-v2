'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { KULTURE } from '@m-agro/domain';
import type { Cestica } from '@/lib/db';
import { postaviKulturuVise } from '@/features/cestice/actions';
import { kljucKulture, OdabirCestica } from './OdabirCestica';

/** Korak 1: čestice → korak 2: kultura (veliki gumbi + slobodan unos) → spremi za sve odabrane. */
export function KulturaVise({
  cestice,
  gospodarstvoId,
  pocetniFiltar,
  onGotovo,
  onOdustani,
}: {
  cestice: Cestica[];
  gospodarstvoId: string;
  pocetniFiltar: string | null;
  onGotovo: (poruka: string) => void;
  onOdustani: () => void;
}) {
  const router = useRouter();
  const [odabrane, setOdabrane] = useState<Set<string>>(() => new Set(pocetniFiltar ? cestice.filter((c) => kljucKulture(c) === pocetniFiltar).map((c) => c.id) : []));
  const [korak, setKorak] = useState<1 | 2>(1);
  const [druga, setDruga] = useState('');
  const [greska, setGreska] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (korak === 1) return <OdabirCestica cestice={cestice} odabrane={odabrane} setOdabrane={setOdabrane} naslov="Kojim česticama postaviti kulturu?" onDalje={() => setKorak(2)} onOdustani={onOdustani} />;

  const spremi = (kultura: string) =>
    start(async () => {
      setGreska(null);
      const r = await postaviKulturuVise({ gospodarstvoId, cesticeIds: [...odabrane], kultura }).catch(() => ({ ok: false as const, poruka: 'Treba internet za ovu promjenu.' }));
      if (!r.ok) return setGreska(r.poruka);
      router.refresh();
      onGotovo(kultura ? `Kultura „${kultura}” postavljena na ${r.izmijenjeno} čestica.` : `Kultura uklonjena s ${r.izmijenjeno} čestica.`);
    });

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => setKorak(1)} className="self-start text-sm font-semibold text-list-700">
        ← {odabrane.size} čestica (promijeni)
      </button>
      <h2 className="text-lg font-semibold">Koja kultura?</h2>
      <div className="grid grid-cols-2 gap-2">
        {KULTURE.map((k) => (
          <button key={k} type="button" disabled={pending} onClick={() => spremi(k)} className="min-h-12 rounded-xl bg-white px-3 text-left font-medium ring-1 ring-zinc-200 hover:bg-list-500/10 disabled:opacity-50">
            {k}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (druga.trim()) spremi(druga.trim());
        }}
      >
        <input value={druga} onChange={(e) => setDruga(e.target.value)} maxLength={120} placeholder="Druga kultura…" aria-label="Druga kultura" className="min-h-12 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-base focus:border-list-600 focus:outline-none" />
        <button type="submit" disabled={pending || !druga.trim()} className="min-h-12 rounded-lg bg-list-600 px-4 font-semibold text-white disabled:opacity-50">
          Spremi
        </button>
      </form>
      <button type="button" disabled={pending} onClick={() => spremi('')} className="self-start text-sm text-zinc-600 underline">
        Ukloni kulturu s odabranih
      </button>
      {greska && (
        <p role="alert" className="text-sm text-red-700">
          {greska}
        </p>
      )}
    </div>
  );
}
