'use client';

import { useEffect, useMemo, useState } from 'react';
import { preporukaPrihrane, type DanPrognoze, type Ocjena } from '@m-agro/domain';
import { dohvatiPrognozu } from '@/lib/meteo/client';

const fmtDan = new Intl.DateTimeFormat('hr-HR', { weekday: 'short', day: 'numeric', month: 'numeric' });
const STIL: Record<Ocjena, { oznaka: string; klasa: string; tekst: string }> = {
  dobro: { oznaka: '✓', klasa: 'bg-green-100 text-green-900 ring-green-300', tekst: 'dobro' },
  uvjetno: { oznaka: '~', klasa: 'bg-amber-100 text-amber-900 ring-amber-300', tekst: 'uvjetno' },
  lose: { oznaka: '✕', klasa: 'bg-red-100 text-red-900 ring-red-300', tekst: 'ne' },
};

/** "Kad rasipati" — 7 dana, ocjena + razlog (ikona I tekst, ne samo boja). */
export function PrognozaPrihrane({ lat, lon, gnojivo }: { lat: number; lon: number; gnojivo: string }) {
  const [dani, setDani] = useState<DanPrognoze[] | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [odabran, setOdabran] = useState(0);
  useEffect(() => {
    let a = true;
    dohvatiPrognozu(lat, lon)
      .then((d) => a && setDani(d))
      .catch(() => a && setGreska('Prognoza trenutno nije dostupna.'));
    return () => {
      a = false;
    };
  }, [lat, lon]);
  const preporuke = useMemo(() => (dani ? preporukaPrihrane(dani, gnojivo) : []), [dani, gnojivo]);

  if (greska) return <p className="text-xs text-zinc-500">{greska}</p>;
  if (!dani) return <p className="text-xs text-zinc-500">Učitavam prognozu…</p>;
  const p = preporuke[odabran];
  const d = dani[odabran];
  return (
    <section aria-label="Kad rasipati" className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold">Kad rasipati ({gnojivo || 'gnojivo'})</p>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {preporuke.map((x, i) => (
          <button
            key={x.datum}
            type="button"
            aria-pressed={i === odabran}
            onClick={() => setOdabran(i)}
            className={`flex min-h-12 min-w-14 flex-shrink-0 flex-col items-center justify-center rounded-lg px-1.5 text-xs ring-1 ${STIL[x.ocjena].klasa} ${i === odabran ? 'ring-2 ring-zinc-800' : ''}`}
          >
            <span className="font-semibold">{fmtDan.format(new Date(`${x.datum}T12:00:00`))}</span>
            <span>
              {STIL[x.ocjena].oznaka} {STIL[x.ocjena].tekst}
            </span>
          </button>
        ))}
      </div>
      {p && d && (
        <p className="text-xs text-zinc-700">
          <span className="font-semibold">
            {Math.round(d.tMin)}–{Math.round(d.tMax)} °C · vjetar do {Math.round(d.vjetarMaxKmh)} km/h · kiša {d.kisaMm.toLocaleString('hr-HR', { maximumFractionDigits: 1 })} mm.
          </span>{' '}
          {p.razlozi.length ? p.razlozi.join('; ') + '.' : 'Bez prepreka.'}
        </p>
      )}
      <p className="text-[11px] text-zinc-400">Prognoza: Open-Meteo. Preporuka je orijentacijska — konačna odluka je tvoja.</p>
    </section>
  );
}
