'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { KULTURE } from '@m-agro/domain';
import type { Cestica } from '@/lib/db';
import { useMapStore } from '@/stores/mapStore';
import { arkodCijeloGospodarstvo, arkodNaTocki, dodajArkodCesticu, poveziSArkodom, type ArkodPregled, type GrupaOdgovor } from '../arkod-actions';

const ha = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 });
const INPUT = 'min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base focus:border-list-600 focus:outline-none';

type Stanje = { s: 'ceka' } | { s: 'trazi' } | { s: 'greska'; poruka: string } | { s: 'pregled'; p: Extract<ArkodPregled, { ok: true; nema: false }>; lon: number; lat: number } | { s: 'nema' };

/** ADR-0010: dodir na kartu → ARKOD čestica → Dodaj / Poveži. Karta ostaje interaktivna; dodaje se jedna po jedna. */
export function DodajCestice({ gospodarstvoId, cestice, onGotovo }: { gospodarstvoId: string; cestice: Cestica[]; onGotovo: () => void }) {
  const dodir = useMapStore((s) => s.dodir);
  const postaviPregled = useMapStore((s) => s.postaviPregledArkod);
  // rezultat je vezan uz broj dodira (bez setState u efektu: „traži” se izvodi iz toga što rezultat još nije stigao)
  const [rez, setRez] = useState<{ br: number; stanje: Stanje } | null>(null);
  const br = dodir?.br ?? 0;
  const stanje: Stanje = !dodir ? { s: 'ceka' } : rez?.br === br ? rez.stanje : { s: 'trazi' };
  const setStanje = (st: Stanje) => setRez({ br, stanje: st });
  const [naziv, setNaziv] = useState('');
  const [kultura, setKultura] = useState('');
  const [dodano, setDodano] = useState<string[]>([]);
  const [porukaS, setPorukaS] = useState<{ br: number; tekst: string } | null>(null);
  const poruka = porukaS?.br === br ? porukaS.tekst : null;
  const setPoruka = (tekst: string) => setPorukaS({ br, tekst });
  const [pending, start] = useTransition();
  const zadnji = useRef(0);

  useEffect(() => {
    if (!dodir) return;
    const b = dodir.br;
    zadnji.current = b;
    const gotovo = (st: Stanje) => zadnji.current === b && setRez({ br: b, stanje: st });
    arkodNaTocki({ gospodarstvoId, lon: dodir.lon, lat: dodir.lat })
      .then((r) => {
        if (zadnji.current !== b) return; // stigao noviji dodir
        if (!r.ok) {
          postaviPregled(null);
          return gotovo({ s: 'greska', poruka: r.poruka });
        }
        if (r.nema) {
          postaviPregled(null);
          return gotovo({ s: 'nema' });
        }
        postaviPregled(r.geom);
        setNaziv(r.naziv ?? `ARKOD ${r.arkodId}`);
        gotovo({ s: 'pregled', p: r, lon: dodir.lon, lat: dodir.lat });
      })
      .catch(() => gotovo({ s: 'greska', poruka: 'Treba internet za dodavanje čestica.' }));
  }, [dodir, gospodarstvoId, postaviPregled]);

  // izlaz iz načina dodavanja → makni obris
  useEffect(() => () => postaviPregled(null), [postaviPregled]);

  const bezArkoda = cestice.filter((c) => !c.arkodId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold">Dodaj čestice</p>
          <p className="text-sm text-zinc-600">{dodano.length > 0 ? `Dodano: ${dodano.length}` : 'Dodirni svoje polje na karti.'}</p>
        </div>
        <button type="button" onClick={onGotovo} className="min-h-11 rounded-lg bg-list-600 px-4 text-sm font-semibold text-white">
          Gotovo
        </button>
      </div>

      {stanje.s === 'ceka' && <p className="text-sm text-zinc-600">Približi kartu do svojih polja i dodirni unutar granice. Obris iz ARKOD-a pojavit će se narančasto.</p>}
      {stanje.s === 'trazi' && <p className="text-sm text-zinc-600">Tražim u ARKOD-u…</p>}
      {stanje.s === 'nema' && <p className="text-sm text-zinc-700">Na tom mjestu nema ARKOD čestice. Dodirni unutar polja (ne na put ili kanal).</p>}
      {stanje.s === 'greska' && (
        <p role="alert" className="text-sm text-red-700">
          {stanje.poruka}
        </p>
      )}
      {poruka && (
        <p role="status" className="rounded-lg bg-list-500/10 px-3 py-2 text-sm text-list-700">
          {poruka}
        </p>
      )}

      {stanje.s === 'pregled' && (
        <div className="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-orange-300">
          <p className="text-sm text-zinc-700">
            ARKOD {stanje.p.arkodId}
            {stanje.p.povrsinaHa !== null && ` · ${ha.format(stanje.p.povrsinaHa)} ha`}
            {stanje.p.vrstaUporabe && ` · ${stanje.p.vrstaUporabe}`}
          </p>
          {stanje.p.zone.length > 0 && <p className="text-xs text-amber-800">{stanje.p.zone.join(' · ')}</p>}
          <CijeloGospodarstvo key={stanje.p.arkodId} gospodarstvoId={gospodarstvoId} arkodId={stanje.p.arkodId} onDodano={(n) => setDodano((d) => [...d, ...n])} />

          {stanje.p.postojeca ? (
            <>
              <p className="text-sm font-medium">Već imaš ovu česticu: {stanje.p.postojeca.naziv}</p>
              {!stanje.p.postojeca.imaArkod && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const pr = stanje;
                    start(async () => {
                      const r = await poveziSArkodom({ gospodarstvoId, cesticaId: pr.p.postojeca?.id, lon: pr.lon, lat: pr.lat });
                      setPoruka(r.ok ? `„${pr.p.postojeca?.naziv}” povezana s ARKOD-om.` : r.poruka);
                      if (r.ok) setStanje({ s: 'ceka' });
                    });
                  }}
                  className="min-h-11 rounded-lg px-4 text-sm font-semibold text-list-700 ring-1 ring-zinc-300"
                >
                  Poveži s ARKOD-om
                </button>
              )}
            </>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const pr = stanje;
                start(async () => {
                  const r = await dodajArkodCesticu({ gospodarstvoId, lon: pr.lon, lat: pr.lat, naziv, kultura }).catch(() => ({ ok: false as const, poruka: 'Treba internet.' }));
                  if (!r.ok) return setPoruka(r.poruka);
                  setDodano((d) => [...d, r.naziv]);
                  setPoruka(`Dodano: ${r.naziv}. Dodirni sljedeće polje.`);
                  postaviPregled(null);
                  setStanje({ s: 'ceka' });
                });
              }}
            >
              <label className="flex flex-col gap-1 text-sm font-medium">
                Naziv
                <input value={naziv} onChange={(e) => setNaziv(e.target.value)} required maxLength={200} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Kultura (može i kasnije)
                <select value={kultura} onChange={(e) => setKultura(e.target.value)} className={INPUT}>
                  <option value="">—</option>
                  {KULTURE.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-list-600 font-semibold text-white disabled:opacity-50">
                {pending ? 'Dodajem…' : 'Dodaj česticu'}
              </button>
            </form>
          )}
        </div>
      )}

      {bezArkoda.length > 0 && stanje.s !== 'pregled' && <PoveziSve gospodarstvoId={gospodarstvoId} cestice={bezArkoda} />}
      <p className="text-xs text-zinc-500">Izvor granica: ARKOD, APPRRR. Nema tvog polja u ARKOD-u? Uvezi datoteku (gore: Uvezi).</p>
    </div>
  );
}

/** Čestice bez ARKOD id-a (npr. uvezene iz KML-a): redom pitaj ARKOD u točki unutar čestice. Jedan poziv po čestici (CPU limit workera). */
function PoveziSve({ gospodarstvoId, cestice }: { gospodarstvoId: string; cestice: Cestica[] }) {
  const [tece, setTece] = useState(false);
  const [rez, setRez] = useState<{ ok: number; ne: number; gotovo: number } | null>(null);
  const stani = useRef(false);

  const pokreni = async () => {
    setTece(true);
    stani.current = false;
    let ok = 0;
    let ne = 0;
    for (const c of cestice) {
      if (stani.current) break;
      const r = await poveziSArkodom({ gospodarstvoId, cesticaId: c.id }).catch(() => ({ ok: false as const, poruka: '' }));
      if (r.ok) ok++;
      else ne++;
      setRez({ ok, ne, gotovo: ok + ne });
    }
    setTece(false);
  };

  return (
    <div className="rounded-xl bg-zinc-50 p-3 text-sm">
      <p className="mb-2">
        {cestice.length} {cestice.length === 1 ? 'čestica nije povezana' : 'čestica nije povezano'} s ARKOD-om. Povezivanje dodaje ARKOD broj, vrstu uporabe i zone zaštite (granice se ne mijenjaju).
      </p>
      {rez && (
        <p className="mb-2 text-zinc-700">
          {rez.gotovo}/{cestice.length} · povezano {rez.ok}
          {rez.ne > 0 && ` · nije pronađeno ${rez.ne}`}
        </p>
      )}
      {tece ? (
        <button type="button" onClick={() => (stani.current = true)} className="min-h-11 rounded-lg px-4 font-semibold ring-1 ring-zinc-300">
          Zaustavi
        </button>
      ) : (
        <button type="button" onClick={() => void pokreni()} className="min-h-11 rounded-lg px-4 font-semibold text-list-700 ring-1 ring-zinc-300">
          Poveži sve s ARKOD-om
        </button>
      )}
    </div>
  );
}

type Grupa = Extract<GrupaOdgovor, { ok: true }>['cestice'];

/** ADR-0011: ponudi sve čestice istog nositelja; farmer potvrđuje popis. Dodaje se jedna po jedna (granica iz ARKOD-a na poslužitelju). */
function CijeloGospodarstvo({ gospodarstvoId, arkodId, onDodano }: { gospodarstvoId: string; arkodId: string; onDodano: (nazivi: string[]) => void }) {
  const [grupa, setGrupa] = useState<Grupa | null>(null);
  const [odabrane, setOdabrane] = useState<Set<string>>(new Set());
  const [greska, setGreska] = useState<string | null>(null);
  const [tijek, setTijek] = useState<{ gotovo: number; dodano: number; preskoceno: number } | null>(null);
  const [radi, setRadi] = useState(false);
  const stani = useRef(false);
  const [pending, start] = useTransition();

  if (!grupa) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await arkodCijeloGospodarstvo({ gospodarstvoId, arkodId }).catch(() => ({ ok: false as const, poruka: 'Treba internet.' }));
              if (!r.ok) return setGreska(r.poruka);
              setGrupa(r.cestice);
              setOdabrane(new Set(r.cestice.filter((c) => !c.vecImas).map((c) => c.arkodId)));
            })
          }
          className="min-h-11 rounded-lg px-3 text-sm font-semibold text-list-700 ring-1 ring-zinc-300"
        >
          {pending ? 'Tražim…' : 'Ovo je moje — prikaži sve moje ARKOD čestice'}
        </button>
        {greska && <p className="text-xs text-red-700">{greska}</p>}
      </div>
    );
  }

  const ukupnoHa = grupa.filter((c) => odabrane.has(c.arkodId)).reduce((s, c) => s + (c.ha ?? 0), 0);
  const dodaj = async () => {
    setRadi(true);
    stani.current = false;
    let dodano = 0;
    let preskoceno = 0;
    const nazivi: string[] = [];
    const lista = grupa.filter((c) => odabrane.has(c.arkodId));
    for (const c of lista) {
      if (stani.current) break;
      const r = await dodajArkodCesticu({ gospodarstvoId, lon: c.lon, lat: c.lat, naziv: c.naziv, kultura: '' }).catch(() => ({ ok: false as const, poruka: '' }));
      if (r.ok) {
        dodano++;
        nazivi.push(r.naziv);
      } else preskoceno++;
      setTijek({ gotovo: dodano + preskoceno, dodano, preskoceno });
    }
    onDodano(nazivi);
    setRadi(false);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-2">
      <p className="text-sm font-medium">
        Pronađeno {grupa.length} ARKOD čestica istog korisnika. Označi svoje:
      </p>
      <ul className="max-h-60 divide-y divide-zinc-100 overflow-y-auto rounded bg-white ring-1 ring-zinc-200">
        {grupa.map((c) => (
          <li key={c.arkodId}>
            <label className="flex min-h-11 items-center gap-2 px-2 text-sm">
              <input
                type="checkbox"
                disabled={c.vecImas || radi}
                checked={odabrane.has(c.arkodId)}
                onChange={(e) =>
                  setOdabrane((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(c.arkodId);
                    else n.delete(c.arkodId);
                    return n;
                  })
                }
                className="h-5 w-5 accent-list-600"
              />
              <span className="min-w-0 flex-1 truncate">{c.naziv}</span>
              <span className="text-xs text-zinc-600">{c.vecImas ? 'već imaš' : c.ha !== null ? `${ha.format(c.ha)} ha` : ''}</span>
            </label>
          </li>
        ))}
      </ul>
      {tijek && (
        <p className="text-xs text-zinc-700">
          {tijek.gotovo}/{odabrane.size} · dodano {tijek.dodano}
          {tijek.preskoceno > 0 && ` · preskočeno ${tijek.preskoceno} (već postoje ili nisu pronađene)`}
        </p>
      )}
      {radi ? (
        <button type="button" onClick={() => (stani.current = true)} className="min-h-11 rounded-lg font-semibold ring-1 ring-zinc-300">
          Zaustavi
        </button>
      ) : (
        <button type="button" disabled={odabrane.size === 0 || (tijek !== null && tijek.gotovo >= odabrane.size)} onClick={() => void dodaj()} className="min-h-12 rounded-xl bg-list-600 font-semibold text-white disabled:opacity-50">
          Dodaj označene · {odabrane.size} · {ha.format(ukupnoHa)} ha
        </button>
      )}
      <p className="text-xs text-zinc-500">Dodaj samo čestice koje ti obrađuješ. Upit se bilježi; najviše 5 dnevno.</p>
    </div>
  );
}
