'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Cestica } from '@/lib/db';
import { useMapStore } from '@/stores/mapStore';
import { bojaCestice } from '../boje';
import { MiniObris } from './MiniObris';

const ha = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ListaCestica({ cestice }: { cestice: Cestica[] }) {
  const odabranaId = useMapStore((s) => s.odabranaId);
  const izvor = useMapStore((s) => s.izvor);
  const odaberi = useMapStore((s) => s.odaberi);
  const [trazi, setTrazi] = useState('');
  const refs = useRef(new Map<string, HTMLLIElement>());

  const filtrirane = useMemo(() => {
    const q = trazi.trim().toLocaleLowerCase('hr');
    return q ? cestice.filter((c) => c.naziv.toLocaleLowerCase('hr').includes(q) || c.arkodId?.includes(q)) : cestice;
  }, [cestice, trazi]);

  // klik na karti → pomakni listu do te čestice
  useEffect(() => {
    if (izvor !== 'karta' || !odabranaId) return;
    refs.current.get(odabranaId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [odabranaId, izvor]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-shrink-0 p-3">
        <input
          type="search"
          value={trazi}
          onChange={(e) => setTrazi(e.target.value)}
          placeholder={`Traži među ${cestice.length} čestica…`}
          aria-label="Traži česticu"
          className="min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base focus:border-list-600 focus:outline-none"
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" role="listbox" aria-label="Čestice">
        {filtrirane.map((c) => {
          const odabrana = c.id === odabranaId;
          return (
            <li
              key={c.id}
              ref={(n) => {
                if (n) refs.current.set(c.id, n);
                else refs.current.delete(c.id);
              }}
              role="option"
              aria-selected={odabrana}
              tabIndex={0}
              onClick={() => odaberi(c.id, 'lista')}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && odaberi(c.id, 'lista')}
              className={`mb-2 flex cursor-pointer items-center gap-3 rounded-xl p-2 ring-1 transition-colors ${
                odabrana ? 'bg-yellow-50 ring-2 ring-yellow-400' : 'bg-white ring-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <MiniObris geom={c.geom} boja={bojaCestice(c.landUseId)} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.naziv}</p>
                <p className="truncate text-sm text-zinc-600">
                  {ha.format(c.povrsinaHa)} ha
                  {c.kultura && ` · ${c.kultura}`}
                  {c.arkodId && ` · ARKOD ${c.arkodId}`}
                </p>
              </div>
            </li>
          );
        })}
        {filtrirane.length === 0 && <li className="p-4 text-center text-sm text-zinc-500">Nema čestica za „{trazi}”.</li>}
      </ul>
    </div>
  );
}
