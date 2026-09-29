'use client';

import { useState, useTransition } from 'react';
import { postaviNacin } from './actions';

const OPCIJE = [
  { v: 'jednostavni', naslov: 'Jednostavni', opis: 'Kulture i čestice sa semaforom, brzi upis radnji. Preporučeno.' },
  { v: 'napredni', naslov: 'Napredni', opis: 'Uz to VRA karte, svi satelitski slojevi i karta kao početni prikaz.' },
] as const;

export function NacinPrekidac({ nacin }: { nacin: 'jednostavni' | 'napredni' }) {
  const [odabran, setOdabran] = useState(nacin);
  const [greska, setGreska] = useState(false);
  const [pending, start] = useTransition();
  return (
    <fieldset className="flex flex-col gap-2" disabled={pending}>
      <legend className="sr-only">Način rada</legend>
      {OPCIJE.map((o) => (
        <label key={o.v} className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 ring-1 ${odabran === o.v ? 'bg-list-500/10 ring-list-600' : 'ring-zinc-200'}`}>
          <input
            type="radio"
            name="nacin"
            value={o.v}
            checked={odabran === o.v}
            onChange={() => {
              const prije = odabran;
              setOdabran(o.v);
              setGreska(false);
              start(async () => {
                const r = await postaviNacin(o.v).catch(() => ({ ok: false }));
                if (!r.ok) {
                  setOdabran(prije);
                  setGreska(true);
                }
              });
            }}
            className="mt-1 h-5 w-5 accent-list-600"
          />
          <span>
            <span className="block font-semibold">{o.naslov}</span>
            <span className="block text-sm text-zinc-600">{o.opis}</span>
          </span>
        </label>
      ))}
      {greska && (
        <p role="alert" className="text-sm text-red-700">
          Promjena nije spremljena. Pokušaj ponovo (treba internet).
        </p>
      )}
    </fieldset>
  );
}
