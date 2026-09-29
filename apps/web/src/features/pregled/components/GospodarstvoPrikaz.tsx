'use client';

import { useEffect, useState } from 'react';
import type { Semafor } from '@m-agro/domain';
import type { Cestica } from '@/lib/db';
import { ParceleView } from '@/features/cestice/components/ParceleView';
import { useMapStore } from '@/stores/mapStore';
import { JednostavniPregled, type ZadnjaRadnja } from './JednostavniPregled';

type Prikaz = 'pregled' | 'karta';

/** Pregled (kulture + semafor + „+ Radnja”) | Karta (postojeći ParceleView). Karta ostaje montirana kad se jednom otvori. */
export function GospodarstvoPrikaz({
  cestice,
  gospodarstvoId,
  smijeUredjivati,
  smijeBrisati,
  ai,
  napredno,
  pocetni,
  pocetnoDodavanje = false,
  semafori,
  zadnjeRadnje,
}: {
  cestice: Cestica[];
  gospodarstvoId: string;
  smijeUredjivati: boolean;
  smijeBrisati: boolean;
  ai: boolean;
  napredno: boolean;
  pocetni: Prikaz;
  /** prazno gospodarstvo: odmah „Dodaj čestice” na karti */
  pocetnoDodavanje?: boolean;
  semafori: Record<string, Semafor>;
  zadnjeRadnje: Record<string, ZadnjaRadnja>;
}) {
  const [prikaz, setPrikaz] = useState<Prikaz>(pocetni);
  const [kartaOtvorena, setKartaOtvorena] = useState(pocetni === 'karta');
  const odaberi = useMapStore((s) => s.odaberi);
  const postaviDodavanje = useMapStore((s) => s.postaviDodavanje);

  useEffect(() => {
    if (pocetnoDodavanje) useMapStore.getState().postaviDodavanje(true);
  }, [pocetnoDodavanje]);

  const idi = (p: Prikaz) => {
    setPrikaz(p);
    if (p === 'karta') setKartaOtvorena(true);
  };

  return (
    <>
      <div className="grid flex-shrink-0 grid-cols-2 border-b border-zinc-200 bg-white" role="tablist" aria-label="Prikaz gospodarstva">
        {(['pregled', 'karta'] as const).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={prikaz === p}
            onClick={() => idi(p)}
            className={`-mb-px min-h-11 border-b-2 text-sm font-semibold ${prikaz === p ? 'border-list-600 text-list-700' : 'border-transparent text-zinc-500'}`}
          >
            {p === 'pregled' ? 'Pregled' : 'Karta'}
          </button>
        ))}
      </div>
      {prikaz === 'pregled' && (
        <JednostavniPregled
          cestice={cestice}
          gospodarstvoId={gospodarstvoId}
          smijeUpisivati={smijeUredjivati}
          semafori={semafori}
          zadnjeRadnje={zadnjeRadnje}
          onOtvori={(id) => {
            odaberi(id, 'lista');
            idi('karta');
          }}
          onDodaj={() => {
            idi('karta');
            postaviDodavanje(true);
          }}
        />
      )}
      {kartaOtvorena && (
        <div className={prikaz === 'karta' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <ParceleView cestice={cestice} gospodarstvoId={gospodarstvoId} smijeUredjivati={smijeUredjivati} smijeBrisati={smijeBrisati} ai={ai} napredno={napredno} />
        </div>
      )}
    </>
  );
}
