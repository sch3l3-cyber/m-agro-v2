'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Cestica } from '@/lib/db';
import { useMapStore } from '@/stores/mapStore';
import { CesticaPanel } from './CesticaPanel';
import { ListaCestica } from './ListaCestica';
import { UrediCesticu } from './UrediCesticu';

// MapLibre (~800 KB) samo u browseru — ne ulazi u Worker bundle (ADR-0001, limit 3 MiB)
const Karta = dynamic(() => import('./Karta'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-zinc-800 text-sm text-zinc-300">Učitavam kartu…</div>,
});

const ha = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 });

// Montira se SAMO jedna varijanta detalja (desni stupac ILI donja ploča) — inače dvostruki Sentinel pozivi
const MQ = '(min-width: 768px)';
function useDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(MQ);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(MQ).matches,
    () => false,
  );
}

/**
 * Desktop (md+): lista | karta | detalji — tri stupca, NIŠTA ne pokriva kartu.
 * Mobitel: Karta/Lista prekidač; detalji su donja ploča (sklopljena = zaglavlje, raširena = NDVI/operacije),
 * a karta centrira česticu iznad ploče (mapStore.donjiRub). Bez position:sticky (lekcija #6).
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
  const [uredjujeId, setUredjujeId] = useState<string | null>(null);
  const [rasireno, setRasireno] = useState(false);
  const ukupno = cestice.reduce((s, c) => s + c.povrsinaHa, 0);
  const odabranaId = useMapStore((s) => s.odabranaId);
  const odaberi = useMapStore((s) => s.odaberi);
  const postaviDonjiRub = useMapStore((s) => s.postaviDonjiRub);
  const odabrana = cestice.find((c) => c.id === odabranaId);
  const desktop = useDesktop();

  // Mobitel: odabir u listi → prikaži kartu (sklopljena ploča, čestica vidljiva)
  useEffect(
    () =>
      useMapStore.subscribe((st, prev) => {
        if (st.odabranaId && st.odabranaId !== prev.odabranaId) {
          setRasireno(false);
          if (st.izvor === 'lista') setMobilniPrikaz('karta');
        }
      }),
    [],
  );

  // Visina mobilne ploče → karta (0 na desktopu, gdje je ploča zaseban stupac)
  const plocaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = plocaRef.current;
    if (!el) {
      postaviDonjiRub(0);
      return;
    }
    const izmjeri = () => postaviDonjiRub(el.offsetHeight);
    const ro = new ResizeObserver(izmjeri);
    ro.observe(el);
    izmjeri();
    return () => ro.disconnect();
  }, [odabrana, desktop, postaviDonjiRub]);

  const zatvori = () => {
    setUredjujeId(null);
    odaberi(null, 'lista');
  };

  const detalji = odabrana && (
    <>
      {uredjujeId === odabrana.id ? (
        <UrediCesticu key={odabrana.id} cestica={odabrana} gospodarstvoId={gospodarstvoId} smijeBrisati={smijeBrisati} onZatvori={() => setUredjujeId(null)} />
      ) : (
        <CesticaPanel
          key={odabrana.id}
          cestica={odabrana}
          gospodarstvoId={gospodarstvoId}
          smijeUredjivati={smijeUredjivati}
          onZatvori={zatvori}
          {...(smijeUredjivati && { onUredi: () => setUredjujeId(odabrana.id) })}
        />
      )}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="flex flex-shrink-0 border-b border-zinc-200 bg-white md:hidden" role="tablist">
        {(['karta', 'lista'] as const).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={mobilniPrikaz === p}
            onClick={() => setMobilniPrikaz(p)}
            className={`min-h-11 flex-1 text-base font-semibold ${mobilniPrikaz === p ? 'border-b-2 border-list-600 text-list-700' : 'text-zinc-500'}`}
          >
            {p === 'karta' ? 'Karta' : `Lista (${cestice.length})`}
          </button>
        ))}
      </div>

      <aside className={`${mobilniPrikaz === 'lista' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col border-zinc-200 bg-zemlja-50 md:flex md:w-72 md:flex-none md:border-r lg:w-80`}>
        <p className="flex-shrink-0 px-3 pt-3 text-sm text-zinc-600">
          {cestice.length} čestica · {ha.format(ukupno)} ha
        </p>
        <ListaCestica cestice={cestice} />
      </aside>

      <section className={`${mobilniPrikaz === 'karta' ? 'flex' : 'hidden'} relative min-h-0 flex-1 md:flex`}>
        <Karta cestice={cestice} />

        {/* Mobitel: donja ploča preko karte */}
        {odabrana && !desktop && (
          <div
            ref={plocaRef}
            className={`absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.15)] ${rasireno ? 'h-[72%]' : ''}`}
          >
            <button
              type="button"
              onClick={() => setRasireno((r) => !r)}
              aria-expanded={rasireno}
              aria-label={rasireno ? 'Smanji detalje čestice' : 'Prikaži detalje čestice'}
              className="flex min-h-7 w-full flex-shrink-0 items-center justify-center"
            >
              <span className="h-1.5 w-10 rounded-full bg-zinc-300" />
            </button>
            <div className={`min-h-0 flex-1 px-3 pb-3 ${rasireno ? 'overflow-y-auto' : ''}`}>
              {uredjujeId === odabrana.id ? (
                detalji
              ) : (
                <CesticaPanel
                  key={odabrana.id}
                  cestica={odabrana}
                  gospodarstvoId={gospodarstvoId}
                  smijeUredjivati={smijeUredjivati}
                  onZatvori={zatvori}
                  sazeto={!rasireno}
                  {...(!rasireno && { onRasiri: () => setRasireno(true) })}
                  {...(smijeUredjivati && {
                    onUredi: () => {
                      setRasireno(true);
                      setUredjujeId(odabrana.id);
                    },
                  })}
                />
              )}
            </div>
          </div>
        )}
      </section>

      {/* Desktop: detalji kao treći stupac */}
      {odabrana && desktop && <aside className="min-h-0 w-[22rem] flex-shrink-0 overflow-y-auto border-l border-zinc-200 bg-white p-3 lg:w-96">{detalji}</aside>}
    </div>
  );
}
