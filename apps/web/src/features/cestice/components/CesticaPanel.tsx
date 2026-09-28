'use client';

import { useCallback, useState } from 'react';
import type { Cestica } from '@/lib/db';
import { NdviPanel } from '@/features/ndvi/components/NdviPanel';
import { OperacijeTab } from '@/features/operacije/components/OperacijeTab';

const ha = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Tab = 'ndvi' | 'operacije';

/**
 * Sadržaj odabrane čestice: zaglavlje (naziv, ha, kultura, Uredi) + tabovi NDVI | Operacije.
 * NDVI ostaje montiran i kad je otvoren tab Operacije (skriven) — inače bi NDVI slika nestala s karte
 * i ponovo se učitavala pri svakom prebacivanju.
 */
export function CesticaPanel({
  cestica,
  gospodarstvoId,
  smijeUredjivati,
  onUredi,
}: {
  cestica: Cestica;
  gospodarstvoId: string;
  smijeUredjivati: boolean;
  onUredi?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('ndvi');
  const [brojOperacija, setBrojOperacija] = useState<number | null>(null);
  const onBroj = useCallback((n: number) => setBrojOperacija(n), []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{cestica.naziv}</p>
          <p className="text-sm text-zinc-600">
            {ha.format(cestica.povrsinaHa)} ha{cestica.kultura && ` · ${cestica.kultura}`}
          </p>
        </div>
        {onUredi && (
          <button
            type="button"
            onClick={onUredi}
            className="min-h-11 flex-shrink-0 rounded-lg px-3 text-sm font-semibold text-list-700 ring-1 ring-zinc-300 hover:bg-list-500/10"
          >
            Uredi
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 border-b border-zinc-200" role="tablist" aria-label="Prikaz čestice">
        {(['ndvi', 'operacije'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px min-h-11 border-b-2 text-sm font-semibold ${tab === t ? 'border-list-600 text-list-700' : 'border-transparent text-zinc-500'}`}
          >
            {t === 'ndvi' ? 'Satelit (NDVI)' : `Operacije${brojOperacija !== null ? ` (${brojOperacija})` : ''}`}
          </button>
        ))}
      </div>

      <div hidden={tab !== 'ndvi'}>
        <NdviPanel cestica={cestica} />
      </div>
      <div hidden={tab !== 'operacije'}>
        <OperacijeTab cesticaId={cestica.id} gospodarstvoId={gospodarstvoId} kultura={cestica.kultura} smijeUpisivati={smijeUredjivati} onBroj={onBroj} />
      </div>
    </div>
  );
}
