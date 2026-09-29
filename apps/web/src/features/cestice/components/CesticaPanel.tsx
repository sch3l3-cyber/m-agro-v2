'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Cestica } from '@/lib/db';
import { NdviPanel } from '@/features/ndvi/components/NdviPanel';
import { OperacijeTab } from '@/features/operacije/components/OperacijeTab';
import { VraTab } from '@/features/vra/components/VraTab';
import { SavjetnikTab } from '@/features/savjetnik/components/SavjetnikTab';
import { useMapStore } from '@/stores/mapStore';

const ha = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Tab = 'ndvi' | 'vra' | 'operacije' | 'savjet';

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
  onZatvori,
  sazeto = false,
  onRasiri,
  ai = false,
}: {
  cestica: Cestica;
  gospodarstvoId: string;
  smijeUredjivati: boolean;
  onUredi?: () => void;
  onZatvori?: () => void;
  /** mobilna ploča sklopljena: vidi se samo zaglavlje; NDVI ostaje montiran (slika ostaje na karti) */
  sazeto?: boolean;
  onRasiri?: () => void;
  /** AI savjetnik uključen (postoji ANTHROPIC_API_KEY) */
  ai?: boolean;
}) {
  const [tab, setTabState] = useState<Tab>('ndvi');
  // VRA se montira tek kad se prvi put otvori (bez nepotrebnih Sentinel poziva), a onda ostaje
  const [vraOtvoren, setVraOtvoren] = useState(false);
  const postaviAktivni = useMapStore((s) => s.postaviAktivni);
  // nova čestica uvijek počinje na NDVI sloju karte
  useEffect(() => postaviAktivni('ndvi'), [postaviAktivni]);
  const setTab = (t: Tab) => {
    setTabState(t);
    if (t === 'vra') setVraOtvoren(true);
    postaviAktivni(t === 'vra' ? 'vra' : 'ndvi');
  };
  const [brojOperacija, setBrojOperacija] = useState<number | null>(null);
  const onBroj = useCallback((n: number) => setBrojOperacija(n), []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onRasiri} disabled={!onRasiri} className="min-w-0 flex-1 text-left disabled:cursor-default" aria-label={onRasiri ? `Otvori detalje: ${cestica.naziv}` : undefined}>
          <p className="truncate font-semibold">{cestica.naziv}</p>
          <p className="text-sm text-zinc-600">
            {ha.format(cestica.povrsinaHa)} ha{cestica.kultura && ` · ${cestica.kultura}`}
          </p>
        </button>
        {onUredi && (
          <button
            type="button"
            onClick={onUredi}
            className="min-h-11 flex-shrink-0 rounded-lg px-3 text-sm font-semibold text-list-700 ring-1 ring-zinc-300 hover:bg-list-500/10"
          >
            Uredi
          </button>
        )}
        {onZatvori && (
          <button type="button" onClick={onZatvori} aria-label="Zatvori česticu" className="min-h-11 min-w-11 flex-shrink-0 rounded-lg text-lg text-zinc-500 hover:bg-zinc-100">
            ✕
          </button>
        )}
      </div>

      <div hidden={sazeto} className="flex flex-col gap-3">
      <div className={`grid ${ai ? 'grid-cols-4' : 'grid-cols-3'} border-b border-zinc-200`} role="tablist" aria-label="Prikaz čestice">
        {(ai ? (['ndvi', 'vra', 'operacije', 'savjet'] as const) : (['ndvi', 'vra', 'operacije'] as const)).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px min-h-11 border-b-2 ${ai ? 'text-[13px]' : 'text-sm'} font-semibold ${tab === t ? 'border-list-600 text-list-700' : 'border-transparent text-zinc-500'}`}
          >
            {t === 'ndvi' ? 'Satelit' : t === 'vra' ? 'VRA' : t === 'savjet' ? 'Savjet' : `Operacije${brojOperacija !== null ? ` (${brojOperacija})` : ''}`}
          </button>
        ))}
      </div>

      <div hidden={tab !== 'ndvi'}>
        <NdviPanel cestica={cestica} />
      </div>
      {vraOtvoren && (
        <div hidden={tab !== 'vra'}>
          <VraTab cestica={cestica} gospodarstvoId={gospodarstvoId} smijeUpisivati={smijeUredjivati} />
        </div>
      )}
      <div hidden={tab !== 'operacije'}>
        <OperacijeTab cesticaId={cestica.id} gospodarstvoId={gospodarstvoId} kultura={cestica.kultura} smijeUpisivati={smijeUredjivati} onBroj={onBroj} />
      </div>
      {ai && (
        <div hidden={tab !== 'savjet'}>
          <SavjetnikTab cesticaId={cestica.id} />
        </div>
      )}
      </div>
    </div>
  );
}
