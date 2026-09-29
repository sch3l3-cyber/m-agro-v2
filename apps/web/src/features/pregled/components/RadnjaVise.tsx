'use client';

import { useState } from 'react';
import type { Cestica } from '@/lib/db';
import { OperacijaForma } from '@/features/operacije/components/OperacijeTab';
import { kljucKulture, OdabirCestica } from './OdabirCestica';

const ha = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 1 });

/** Korak 1: na kojim česticama → korak 2: ista forma radnje za sve odabrane. */
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
  const lista = cestice.filter((c) => odabrane.has(c.id));
  const kulture = new Set(lista.map((c) => c.kultura?.trim()).filter(Boolean));
  const zajednickaKultura = kulture.size === 1 ? ([...kulture][0] ?? null) : null;

  if (korak === 1) return <OdabirCestica cestice={cestice} odabrane={odabrane} setOdabrane={setOdabrane} naslov="Na kojim česticama?" onDalje={() => setKorak(2)} onOdustani={onOdustani} />;

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => setKorak(1)} className="self-start text-sm font-semibold text-list-700">
        ← {odabrane.size} čestica · {ha.format(lista.reduce((s, c) => s + c.povrsinaHa, 0))} ha (promijeni)
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
