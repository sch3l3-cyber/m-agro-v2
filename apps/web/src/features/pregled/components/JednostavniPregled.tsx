'use client';

import { useMemo, useState } from 'react';
import { sazetakKultura, TIP_LABEL, type Semafor, type SemaforBoja, type TipOperacije } from '@m-agro/domain';
import type { Cestica } from '@/lib/db';
import { RadnjaVise } from './RadnjaVise';

export interface ZadnjaRadnja {
  tip: TipOperacije;
  datum: string;
}

const ha = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 1 });
const kratkiDatum = (d: string) => {
  const [, m, dan] = d.split('-');
  return `${Number(dan)}. ${Number(m)}.`;
};
const BOJA: Record<SemaforBoja, string> = { zeleno: 'bg-green-600', zuto: 'bg-amber-400', crveno: 'bg-red-600', sivo: 'bg-zinc-300' };
const PAZNJA = new Set<SemaforBoja>(['crveno', 'zuto']);
const BEZ_KULTURE = '__bez__';

/** Jednostavni način: kulture → čestice sa semaforom; veliki „+ Upiši radnju” za jednu ili više čestica. */
export function JednostavniPregled({
  cestice,
  gospodarstvoId,
  smijeUpisivati,
  semafori,
  zadnjeRadnje,
  onOtvori,
}: {
  cestice: Cestica[];
  gospodarstvoId: string;
  smijeUpisivati: boolean;
  semafori: Record<string, Semafor>;
  zadnjeRadnje: Record<string, ZadnjaRadnja>;
  onOtvori: (id: string) => void;
}) {
  const [filtar, setFiltar] = useState<string | null>(null); // null = sve, 'paznja', kultura ili BEZ_KULTURE
  const [upis, setUpis] = useState(false);
  const [poruka, setPoruka] = useState<string | null>(null);

  const kulture = useMemo(() => sazetakKultura(cestice), [cestice]);
  const ukupnoHa = cestice.reduce((s, c) => s + c.povrsinaHa, 0);
  const paznja = cestice.filter((c) => PAZNJA.has(semafori[c.id]?.boja ?? 'sivo'));

  const prikazane = useMemo(() => {
    const f = cestice.filter((c) =>
      filtar === null ? true : filtar === 'paznja' ? PAZNJA.has(semafori[c.id]?.boja ?? 'sivo') : filtar === BEZ_KULTURE ? !c.kultura?.trim() : c.kultura?.trim() === filtar,
    );
    const red = (c: Cestica) => ({ crveno: 0, zuto: 1, zeleno: 2, sivo: 3 })[semafori[c.id]?.boja ?? 'sivo'];
    return f.sort((a, b) => red(a) - red(b) || a.naziv.localeCompare(b.naziv, 'hr'));
  }, [cestice, filtar, semafori]);

  if (upis) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-zemlja-50">
        <div className="mx-auto max-w-lg p-3">
          <RadnjaVise
            cestice={cestice}
            gospodarstvoId={gospodarstvoId}
            pocetniFiltar={filtar !== null && filtar !== 'paznja' ? filtar : null}
            onGotovo={(p) => {
              setUpis(false);
              setPoruka(p ?? 'Radnja je spremljena.');
            }}
            onOdustani={() => setUpis(false)}
          />
        </div>
      </div>
    );
  }

  const chip = { filtar, onFiltar: setFiltar };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-zemlja-50">
      <div className="mx-auto flex max-w-lg flex-col gap-3 p-3">
        {smijeUpisivati && (
          <button type="button" onClick={() => { setPoruka(null); setUpis(true); }} className="min-h-14 rounded-xl bg-list-600 text-lg font-semibold text-white shadow-sm hover:bg-list-700">
            + Upiši radnju
          </button>
        )}
        {poruka && (
          <p role="status" className="rounded-lg bg-list-500/10 px-3 py-2 text-sm text-list-700">
            {poruka}
          </p>
        )}

        <section aria-label="Kulture" className="grid grid-cols-2 gap-2">
          <Chip {...chip} id={null} naslov="Sve čestice" opis={`${cestice.length} · ${ha.format(ukupnoHa)} ha`} />
          {paznja.length > 0 && <Chip {...chip} id="paznja" naslov="⚠ Traži pažnju" opis={`${paznja.length} ${paznja.length === 1 ? 'čestica' : 'čestica'}`} />}
          {kulture.map((k) => (
            <Chip {...chip} key={k.kultura ?? BEZ_KULTURE} id={k.kultura ?? BEZ_KULTURE} naslov={k.kultura ?? 'Bez kulture'} opis={`${k.broj} · ${ha.format(k.ha)} ha`} />
          ))}
        </section>

        <ul className="flex flex-col divide-y divide-zinc-100 overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
          {prikazane.map((c) => {
            const s = semafori[c.id];
            const z = zadnjeRadnje[c.id];
            return (
              <li key={c.id}>
                <button type="button" onClick={() => onOtvori(c.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-50">
                  <span className={`h-3.5 w-3.5 flex-shrink-0 rounded-full ${BOJA[s?.boja ?? 'sivo']}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.naziv}</span>
                    <span className="block truncate text-xs text-zinc-600">
                      {ha.format(c.povrsinaHa)} ha{c.kultura ? ` · ${c.kultura}` : ''}
                      {z ? ` · ${TIP_LABEL[z.tip]} ${kratkiDatum(z.datum)}` : ''}
                    </span>
                  </span>
                  <span className="flex-shrink-0 text-right text-xs text-zinc-600" title={s?.razlog}>
                    {s?.naslov ?? 'Nema snimke'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-zinc-500">
          Boja = promjena NDVI-ja (satelit) u zadnjih ~45 dana: zeleno u redu, žuto pad, crveno nagli pad, sivo nema svježe snimke.
        </p>
      </div>
    </div>
  );
}

function Chip({ id, naslov, opis, filtar, onFiltar }: { id: string | null; naslov: string; opis: string; filtar: string | null; onFiltar: (f: string | null) => void }) {
  const aktivan = filtar === id;
  return (
    <button
      type="button"
      aria-pressed={aktivan}
      onClick={() => onFiltar(aktivan && id !== null ? null : id)}
      className={`flex min-h-14 flex-col items-start justify-center rounded-xl px-3 py-2 text-left ring-1 ${aktivan ? 'bg-list-600 text-white ring-list-600' : 'bg-white ring-zinc-200'}`}
    >
      <span className="text-sm font-semibold">{naslov}</span>
      <span className={`text-xs ${aktivan ? 'text-white/85' : 'text-zinc-600'}`}>{opis}</span>
    </button>
  );
}
