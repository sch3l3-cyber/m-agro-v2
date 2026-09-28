'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { KULTURE } from '@m-agro/domain';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { Cestica } from '@/lib/db';
import { useMapStore } from '@/stores/mapStore';
import { obrisiCesticu, urediCesticu } from '../actions';

const ha = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 });

export function UrediCesticu({
  cestica,
  gospodarstvoId,
  smijeBrisati,
  onZatvori,
}: {
  cestica: Cestica;
  gospodarstvoId: string;
  smijeBrisati: boolean;
  onZatvori: () => void;
}) {
  const router = useRouter();
  const odaberi = useMapStore((s) => s.odaberi);
  const [naziv, setNaziv] = useState(cestica.naziv);
  const [kultura, setKultura] = useState(cestica.kultura ?? '');
  const [greska, setGreska] = useState<string | null>(null);
  const [potvrdaBrisanja, setPotvrdaBrisanja] = useState(false);
  const [pending, startTransition] = useTransition();

  function spremi(e: React.FormEvent) {
    e.preventDefault();
    setGreska(null);
    startTransition(async () => {
      const odg = await urediCesticu({ id: cestica.id, gospodarstvoId, naziv, kultura });
      if (!odg.ok) return setGreska(odg.poruka);
      router.refresh();
      onZatvori();
    });
  }

  function obrisi() {
    setGreska(null);
    startTransition(async () => {
      const odg = await obrisiCesticu({ id: cestica.id, gospodarstvoId });
      if (!odg.ok) return setGreska(odg.poruka);
      odaberi(null, 'lista');
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={spremi}
      className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-zinc-200 backdrop-blur"
      aria-label="Uredi česticu"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold">Uredi česticu</p>
        <p className="text-sm text-zinc-600">
          {ha.format(cestica.povrsinaHa)} ha{cestica.arkodId && ` · ARKOD ${cestica.arkodId}`}
        </p>
      </div>

      <Field id="naziv" label="Naziv" value={naziv} onChange={(e) => setNaziv(e.target.value)} maxLength={200} required autoComplete="off" />
      <Field
        id="kultura"
        label="Kultura"
        value={kultura}
        onChange={(e) => setKultura(e.target.value)}
        maxLength={120}
        list="kulture"
        placeholder="npr. Pšenica"
        autoComplete="off"
      />
      <datalist id="kulture">
        {KULTURE.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>

      {greska && (
        <p role="alert" className="text-sm text-red-700">
          {greska}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? 'Spremam…' : 'Spremi'}
        </Button>
        <Button type="button" variant="ghost" onClick={onZatvori} disabled={pending}>
          Odustani
        </Button>
      </div>

      {smijeBrisati && (
        <div className="border-t border-zinc-200 pt-3">
          {!potvrdaBrisanja ? (
            <button type="button" onClick={() => setPotvrdaBrisanja(true)} className="min-h-11 text-sm font-medium text-red-700">
              Obriši česticu…
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
              <p>
                Brišeš <strong>{cestica.naziv}</strong> zajedno sa svim njenim operacijama. Ovo se ne može poništiti.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={obrisi}
                  disabled={pending}
                  className="min-h-11 flex-1 rounded-lg bg-red-600 px-4 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {pending ? 'Brišem…' : 'Da, obriši'}
                </button>
                <button type="button" onClick={() => setPotvrdaBrisanja(false)} disabled={pending} className="min-h-11 px-3 font-medium">
                  Ne
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
