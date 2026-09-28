'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { Cestica } from '@/lib/db';
import { ListaCestica } from './ListaCestica';
import { UrediCesticu } from './UrediCesticu';
import { NdviPanel } from '@/features/ndvi/components/NdviPanel';
import { useMapStore } from '@/stores/mapStore';

// MapLibre (~800 KB) samo u browseru — ne ulazi u Worker bundle (ADR-0001, limit 3 MiB)
const Karta = dynamic(() => import('./Karta'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-zinc-800 text-sm text-zinc-300">Učitavam kartu…</div>,
});

const ha = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 });

/**
 * Mobitel: karta gore, lista dolje (prekidač "Karta/Lista" za puni ekran).
 * Desktop: lista lijevo, karta desno. Bez position:sticky (lekcija #6).
 */
export function ParceleView({
  cestice,
  gospodarstvoId,
  smijeUredjivati,
  smijeBrisati,
}: {
  cestice: Cestica[];
  gospodarstvoId: string;
  smijeUredjivati: boolean;
  smijeBrisati: boolean;
}) {
  const [mobilniPrikaz, setMobilniPrikaz] = useState<'karta' | 'lista'>('karta');
  // id čestice koja se uređuje; druga odabrana čestica automatski zatvara obrazac
  const [uredjujeId, setUredjujeId] = useState<string | null>(null);
  const ukupno = cestice.reduce((s, c) => s + c.povrsinaHa, 0);
  const odabranaId = useMapStore((s) => s.odabranaId);
  const odabrana = cestice.find((c) => c.id === odabranaId);

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="flex flex-shrink-0 border-b border-zinc-200 bg-white md:hidden" role="tablist">
        {(['karta', 'lista'] as const).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={mobilniPrikaz === p}
            onClick={() => setMobilniPrikaz(p)}
            className={`min-h-12 flex-1 text-base font-semibold ${mobilniPrikaz === p ? 'border-b-2 border-list-600 text-list-700' : 'text-zinc-500'}`}
          >
            {p === 'karta' ? 'Karta' : `Lista (${cestice.length})`}
          </button>
        ))}
      </div>

      <aside className={`${mobilniPrikaz === 'lista' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col border-zinc-200 bg-zemlja-50 md:flex md:w-96 md:flex-none md:border-r`}>
        <p className="flex-shrink-0 px-3 pt-3 text-sm text-zinc-600">
          {cestice.length} čestica · {ha.format(ukupno)} ha
        </p>
        <ListaCestica cestice={cestice} />
      </aside>

      <section className={`${mobilniPrikaz === 'karta' ? 'flex' : 'hidden'} relative min-h-[60vh] flex-1 md:flex md:min-h-0`}>
        <Karta cestice={cestice} />
        {odabrana && (
          <div className="absolute inset-x-2 bottom-8 z-10 md:inset-x-auto md:left-3 md:top-3 md:bottom-auto md:w-80">
            {uredjujeId === odabrana.id ? (
              <UrediCesticu
                key={odabrana.id}
                cestica={odabrana}
                gospodarstvoId={gospodarstvoId}
                smijeBrisati={smijeBrisati}
                onZatvori={() => setUredjujeId(null)}
              />
            ) : (
              <NdviPanel key={odabrana.id} cestica={odabrana} {...(smijeUredjivati && { onUredi: () => setUredjujeId(odabrana.id) })} />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
