'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import type { ZahtjevUvoza } from '@/lib/db';
import { adminDodajArkod, adminPronadi, adminZavrsiZahtjev } from './zahtjevi-actions';

const vrijeme = new Intl.DateTimeFormat('hr-HR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const ha = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 });

/** Admin: zahtjevi za učitavanje čestica po MIBPG-u (cilj: u roku 24 h). */
export function ZahtjeviUvoza({ zahtjevi }: { zahtjevi: ZahtjevUvoza[] }) {
  const ceka = zahtjevi.filter((z) => z.status === 'ceka');
  const rijeseni = zahtjevi.filter((z) => z.status === 'gotovo');
  return (
    <div className="flex flex-col gap-3">
      {ceka.length === 0 && <p className="text-sm text-zinc-600">Nema zahtjeva koji čekaju.</p>}
      {ceka.map((z) => (
        <Zahtjev key={z.id} z={z} />
      ))}
      {rijeseni.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-600">Riješeni ({rijeseni.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {rijeseni.map((z) => (
              <li key={z.id} className="text-zinc-700">
                {z.gospodarstvo} · MIBPG {z.mibpg} · učitano {z.dodano}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Zahtjev({ z }: { z: ZahtjevUvoza }) {
  const router = useRouter();
  const [tekst, setTekst] = useState('');
  const [popis, setPopis] = useState<{ cestice: { arkodId: string; lon: number; lat: number; ha: number | null; naziv: string }[]; nepronadeno: number } | null>(null);
  const [poruka, setPoruka] = useState<string | null>(null);
  const [tijek, setTijek] = useState<{ gotovo: number; dodano: number } | null>(null);
  const [radi, setRadi] = useState(false);
  const stani = useRef(false);
  const [pending, start] = useTransition();
  // > 20 h → crveno (obećano je 24 h)
  const [staro] = useState(() => Date.parse(z.createdAt) < Date.now() - 20 * 3600_000);

  const ucitaj = async () => {
    if (!popis) return;
    setRadi(true);
    stani.current = false;
    let dodano = 0;
    let gotovo = 0;
    for (const c of popis.cestice) {
      if (stani.current) break;
      const r = await adminDodajArkod({ zahtjevId: z.id, lon: c.lon, lat: c.lat, naziv: c.naziv }).catch(() => ({ ok: false as const, poruka: '' }));
      gotovo++;
      if (r.ok && r.dodano) dodano++;
      setTijek({ gotovo, dodano });
    }
    setRadi(false);
  };

  return (
    <div className={`flex flex-col gap-2 rounded-xl p-3 ring-1 ${staro ? 'ring-red-300' : 'ring-zinc-200'}`}>
      <p className="text-sm">
        <strong>{z.gospodarstvo}</strong> · MIBPG <strong>{z.mibpg}</strong> · {z.email ?? '—'}
        <br />
        <span className={staro ? 'text-red-700' : 'text-zinc-600'}>
          zaprimljeno {vrijeme.format(new Date(z.createdAt))} · čestica u gospodarstvu: {z.cestica}
        </span>
      </p>
      <a href="https://preglednik.arkod.hr/ARKOD-Web/" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-list-700 underline">
        Otvori ARKOD preglednik → Brzo pretraživanje → MIBPG {z.mibpg} → kopiraj tablicu (sve stranice)
      </a>
      {!popis ? (
        <>
          <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={4} placeholder="Zalijepi tablicu ili ARKOD brojeve…" className="rounded-lg border border-zinc-300 p-2 text-sm" />
          <button
            type="button"
            disabled={pending || !tekst.trim()}
            onClick={() =>
              start(async () => {
                setPoruka(null);
                const r = await adminPronadi(tekst);
                if (!r.ok) return setPoruka(r.poruka);
                setPopis(r);
              })
            }
            className="min-h-11 rounded-lg bg-list-600 text-sm font-semibold text-white disabled:opacity-50"
          >
            Pronađi čestice
          </button>
        </>
      ) : (
        <>
          <p className="text-sm">
            Pronađeno {popis.cestice.length} · {ha.format(popis.cestice.reduce((s, c) => s + (c.ha ?? 0), 0))} ha
            {popis.nepronadeno > 0 && ` · nije pronađeno ${popis.nepronadeno}`}
          </p>
          {tijek && (
            <p className="text-sm text-zinc-700">
              {tijek.gotovo}/{popis.cestice.length} · dodano {tijek.dodano} (ostalo su duplikati)
            </p>
          )}
          <div className="flex gap-2">
            {radi ? (
              <button type="button" onClick={() => (stani.current = true)} className="min-h-11 flex-1 rounded-lg text-sm font-semibold ring-1 ring-zinc-300">
                Zaustavi
              </button>
            ) : (
              <button type="button" disabled={tijek !== null && tijek.gotovo >= popis.cestice.length} onClick={() => void ucitaj()} className="min-h-11 flex-1 rounded-lg bg-list-600 text-sm font-semibold text-white disabled:opacity-50">
                Učitaj u gospodarstvo
              </button>
            )}
            <button
              type="button"
              disabled={radi || pending}
              onClick={() =>
                start(async () => {
                  await adminZavrsiZahtjev(z.id);
                  router.refresh();
                })
              }
              className="min-h-11 rounded-lg px-3 text-sm font-semibold ring-1 ring-zinc-300"
            >
              Označi gotovo
            </button>
          </div>
        </>
      )}
      {poruka && <p className="text-sm text-red-700">{poruka}</p>}
    </div>
  );
}
