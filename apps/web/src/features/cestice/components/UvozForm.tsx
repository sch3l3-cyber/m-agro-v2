'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { UvozMod } from '@m-agro/domain';
import type { UvozRezultat } from '@m-agro/domain/uvoz';
import { Button } from '@/components/ui/button';
import { uveziCestice } from '../actions';

const MAX_MB = 25;
const ha = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 });

const MODOVI: { mod: UvozMod; naslov: string; opis: string; samoVlasnik?: boolean }[] = [
  { mod: 'dodaj', naslov: 'Dodaj nove', opis: 'Postojeće čestice ostaju netaknute, dodaju se samo nove.' },
  { mod: 'azuriraj', naslov: 'Dodaj i ažuriraj', opis: 'Čestice s istim ARKOD brojem (ili nazivom) dobivaju novi oblik i naziv.' },
  {
    mod: 'zamijeni',
    naslov: 'Zamijeni sve',
    opis: 'Briše SVE postojeće čestice ovog gospodarstva i njihove operacije, pa uvozi datoteku.',
    samoVlasnik: true,
  },
];

const FORMAT_LABEL = { arkod: 'ARKOD (QGIS)', kml: 'Google Earth / KML', genericki: 'GeoJSON' } as const;

export function UvozForm({ gospodarstvoId, vlasnik, brojPostojecih }: { gospodarstvoId: string; vlasnik: boolean; brojPostojecih: number }) {
  const router = useRouter();
  const [rezultat, setRezultat] = useState<UvozRezultat | null>(null);
  const [datoteka, setDatoteka] = useState<string | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [mod, setMod] = useState<UvozMod>('dodaj');
  const [potvrdaZamjene, setPotvrdaZamjene] = useState(false);
  const [pending, startTransition] = useTransition();

  async function ucitaj(file: File | undefined) {
    setGreska(null);
    setRezultat(null);
    if (!file) return;
    setDatoteka(file.name);
    if (file.size > MAX_MB * 1024 * 1024) return setGreska(`Datoteka je veća od ${MAX_MB} MB. Izvezi samo svoje čestice iz QGIS-a.`);
    if (/\.(gpkg|shp|kml|kmz|zip)$/i.test(file.name)) {
      return setGreska('Podržan je samo GeoJSON (.geojson / .json). U QGIS generatoru odaberi format GeoJSON.');
    }
    try {
      // proj4 + turf (~150 KB) učitavaju se tek kad korisnik odabere datoteku
      const { parsirajUvoz, UvozError, CrsError } = await import('@m-agro/domain/uvoz');
      const json: unknown = JSON.parse(await file.text());
      try {
        setRezultat(parsirajUvoz(json));
      } catch (err) {
        if (err instanceof UvozError || err instanceof CrsError) return setGreska(err.message);
        throw err;
      }
    } catch (err) {
      if (err instanceof SyntaxError) setGreska('Datoteka nije ispravan JSON.');
      else {
        console.error('[uvoz] parsiranje', err);
        setGreska('Datoteku nije moguće pročitati.');
      }
    }
  }

  function posalji() {
    if (!rezultat) return;
    setGreska(null);
    startTransition(async () => {
      const odg = await uveziCestice({
        gospodarstvoId,
        mod,
        cestice: rezultat.cestice.map((c) => ({ naziv: c.naziv, arkodId: c.arkodId, landUseId: c.landUseId, kultura: c.kultura, geom: c.geom })),
      });
      if (!odg.ok) return setGreska(odg.poruka);
      const { dodano, azurirano, preskoceno, obrisano } = odg.ishod;
      const dijelovi = [
        obrisano && `obrisano ${obrisano}`,
        `dodano ${dodano}`,
        azurirano && `ažurirano ${azurirano}`,
        preskoceno && `preskočeno ${preskoceno} (već postoje)`,
      ].filter(Boolean);
      router.push(`/gospodarstvo/${gospodarstvoId}?uvoz=${encodeURIComponent(dijelovi.join(', '))}`);
      router.refresh();
    });
  }

  const blokiranaZamjena = mod === 'zamijeni' && (!potvrdaZamjene || !vlasnik);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h2 className="mb-1 font-semibold">1. Odaberi datoteku</h2>
        <p className="mb-4 text-sm text-zinc-600">
          GeoJSON iz QGIS generatora (ARKOD) ili izvoz iz Google Eartha. Koordinate u HTRS96/TM ili Gauss-Krügeru pretvaraju se automatski.
        </p>
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 p-4 text-center hover:border-list-500">
          <span className="font-semibold text-list-700">{datoteka ?? 'Klikni i odaberi .geojson'}</span>
          <span className="text-sm text-zinc-500">najviše {MAX_MB} MB</span>
          <input type="file" accept=".geojson,.json,application/geo+json,application/json" className="sr-only" onChange={(e) => ucitaj(e.target.files?.[0])} />
        </label>
      </section>

      {rezultat && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="mb-3 font-semibold">2. Provjeri</h2>
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Čestica" value={String(rezultat.cestice.length)} />
            <Stat label="Površina" value={`${ha.format(rezultat.ukupnoHa)} ha`} />
            <Stat label="Format" value={FORMAT_LABEL[rezultat.format]} />
            <Stat label="Koordinate" value={rezultat.crs} />
          </dl>

          {rezultat.greske.length > 0 && (
            <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
              <p className="font-semibold">{rezultat.greske.length} redaka neće biti uvezeno:</p>
              <ul className="mt-1 list-disc pl-5">
                {rezultat.greske.slice(0, 8).map((g) => (
                  <li key={g.redak}>
                    Redak {g.redak}: {g.poruka}
                  </li>
                ))}
                {rezultat.greske.length > 8 && <li>… i još {rezultat.greske.length - 8}</li>}
              </ul>
            </div>
          )}
          {rezultat.upozorenja.length > 0 && (
            <ul className="mb-3 list-disc rounded-lg bg-amber-50 p-3 pl-8 text-sm text-amber-900">
              {rezultat.upozorenja.slice(0, 6).map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-list-700">Prikaži popis čestica</summary>
            <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-zinc-200">
              {rezultat.cestice.map((c) => (
                <li key={c.redak} className="flex justify-between gap-2 border-b border-zinc-100 px-3 py-1.5 last:border-0">
                  <span className="truncate">{c.naziv}</span>
                  <span className="flex-shrink-0 text-zinc-500">{ha.format(c.povrsinaHa)} ha</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {rezultat && rezultat.cestice.length > 0 && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="mb-3 font-semibold">3. Način uvoza</h2>
          {brojPostojecih > 0 && <p className="mb-3 text-sm text-zinc-600">Gospodarstvo već ima {brojPostojecih} čestica.</p>}
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Način uvoza</legend>
            {MODOVI.filter((m) => brojPostojecih > 0 || m.mod === 'dodaj').map((m) => (
              <label
                key={m.mod}
                className={`flex cursor-pointer gap-3 rounded-xl p-3 ring-1 ${mod === m.mod ? 'bg-list-500/10 ring-list-600' : 'ring-zinc-200'} ${m.samoVlasnik && !vlasnik ? 'opacity-50' : ''}`}
              >
                <input
                  type="radio"
                  name="mod"
                  value={m.mod}
                  checked={mod === m.mod}
                  disabled={m.samoVlasnik && !vlasnik}
                  onChange={() => {
                    setMod(m.mod);
                    setPotvrdaZamjene(false);
                  }}
                  className="mt-1 h-5 w-5 accent-list-600"
                />
                <span>
                  <span className="font-semibold">{m.naslov}</span>
                  <span className="block text-sm text-zinc-600">
                    {m.opis}
                    {m.samoVlasnik && !vlasnik && ' (samo vlasnik)'}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {mod === 'zamijeni' && vlasnik && (
            <label className="mt-3 flex gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">
              <input type="checkbox" checked={potvrdaZamjene} onChange={(e) => setPotvrdaZamjene(e.target.checked)} className="mt-0.5 h-5 w-5 accent-red-600" />
              Razumijem da se briše {brojPostojecih} postojećih čestica zajedno s njihovim operacijama.
            </label>
          )}

          {greska && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {greska}
            </p>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={posalji} disabled={pending || blokiranaZamjena}>
              {pending ? 'Uvozim…' : `Uvezi ${rezultat.cestice.length} čestica`}
            </Button>
            <Link href={`/gospodarstvo/${gospodarstvoId}`} className="inline-flex min-h-12 items-center justify-center px-5 text-list-700">
              Odustani
            </Link>
          </div>
        </section>
      )}

      {greska && !rezultat && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {greska}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zemlja-50 p-2">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
