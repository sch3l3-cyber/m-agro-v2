'use client';

import { useState, useTransition } from 'react';
import { obrisiRacun } from '../actions';

/** Trajno brisanje računa — dvostruka potvrda (otvaranje + upis vlastitog emaila). */
export function ObrisiRacun({ email }: { email: string }) {
  const [otvoreno, setOtvoreno] = useState(false);
  const [potvrda, setPotvrda] = useState('');
  const [greska, setGreska] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!otvoreno) {
    return (
      <button type="button" onClick={() => setOtvoreno(true)} className="min-h-11 rounded-lg px-4 text-sm font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50">
        Obriši račun…
      </button>
    );
  }

  const tocno = potvrda.trim().toLowerCase() === email.toLowerCase();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setGreska(null);
        start(async () => {
          const r = await obrisiRacun(potvrda);
          if (!r.ok) {
            setGreska(r.poruka);
            return;
          }
          // lokalni podaci (red operacija bez signala, spremljene stranice) više ne pripadaju nikome
          try {
            indexedDB.deleteDatabase('m-agro');
            navigator.serviceWorker?.controller?.postMessage('odjava');
          } catch {
            /* nije bitno */
          }
          window.location.replace('/prijava?obrisan=1');
        });
      }}
    >
      <p className="text-sm text-zinc-700">
        Trajno se brišu račun, tvoja gospodarstva, sve čestice i operacije. <strong>Ovo se ne može poništiti.</strong> Prije toga možeš preuzeti svoje podatke (gore).
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Za potvrdu upiši svoj email ({email})
        <input
          value={potvrda}
          onChange={(e) => setPotvrda(e.target.value)}
          type="email"
          autoComplete="off"
          className="min-h-11 rounded-lg px-3 ring-1 ring-zinc-300 focus:ring-2 focus:ring-red-500 focus:outline-none"
        />
      </label>
      {greska && (
        <p role="alert" className="text-sm text-red-700">
          {greska}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={!tocno || pending} className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? 'Brišem…' : 'Trajno obriši račun'}
        </button>
        <button type="button" onClick={() => setOtvoreno(false)} className="min-h-11 rounded-lg px-4 text-sm ring-1 ring-zinc-300">
          Odustani
        </button>
      </div>
    </form>
  );
}
