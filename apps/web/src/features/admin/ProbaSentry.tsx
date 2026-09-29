'use client';

import { useState, useTransition } from 'react';
import { probnaGreskaKlijent } from '@/lib/monitoring/client';
import { probnaGreskaServer } from './actions';

export function ProbaSentry({ ukljuceno }: { ukljuceno: boolean }) {
  const [poruka, setPoruka] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!ukljuceno) return <p className="text-sm text-zinc-600">Sentry nije postavljen (nema NEXT_PUBLIC_SENTRY_DSN).</p>;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await probnaGreskaKlijent();
            const r = await probnaGreskaServer();
            setPoruka(r.ok ? 'Poslano 2 probne greške (preglednik + server). Za minutu ih vidi u Sentry → Issues.' : 'Nije poslano.');
          })
        }
        className="min-h-11 rounded-lg px-4 text-sm font-semibold text-list-700 ring-1 ring-zinc-300 hover:bg-list-500/10 disabled:opacity-60"
      >
        {pending ? 'Šaljem…' : 'Pošalji probnu grešku u Sentry'}
      </button>
      {poruka && <p role="status" className="text-sm text-zinc-700">{poruka}</p>}
    </div>
  );
}
