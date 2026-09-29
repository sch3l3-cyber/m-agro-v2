'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { GNOJIVA, JEDINICE, KULTURE, NovaOperacijaSchema, OBRADE, TIP_LABEL, TIPOVI_OPERACIJA, opisOperacije, type TipOperacije } from '@m-agro/domain';
import { Button } from '@/components/ui/button';
import type { Operacija } from '@/lib/db';
import { idbSpremiste, jeGreskaMreze, pretplati, spremiListu, stanjeReda, ucitajListu, uRed } from '@/lib/offline/red';
import type { StavkaReda } from '@/lib/offline/sinkronizacija';
import { dodajOperaciju, dodajOperacijeVise, obrisiOperaciju, ucitajOperacije } from '../actions';

const fmtDatum = new Intl.DateTimeFormat('hr-HR', { day: 'numeric', month: 'numeric', year: 'numeric' });
const danas = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const TIP_BOJA: Record<TipOperacije, string> = {
  sjetva: 'bg-amber-100 text-amber-900',
  prihrana: 'bg-sky-100 text-sky-900',
  zastita: 'bg-violet-100 text-violet-900',
  zetva: 'bg-yellow-100 text-yellow-900',
  obrada: 'bg-stone-200 text-stone-900',
  ostalo: 'bg-zinc-100 text-zinc-800',
};

type Stanje = { status: 'ucitavam' } | { status: 'greska'; poruka: string } | { status: 'ok'; data: Operacija[]; izMemorije?: boolean };

export function OperacijeTab({
  cesticaId,
  gospodarstvoId,
  kultura,
  smijeUpisivati,
  onBroj,
}: {
  cesticaId: string;
  gospodarstvoId: string;
  kultura: string | null;
  smijeUpisivati: boolean;
  onBroj?: (n: number) => void;
}) {
  const [stanje, setStanje] = useState<Stanje>({ status: 'ucitavam' });
  const [verzija, setVerzija] = useState(0);
  const [forma, setForma] = useState(false);

  useEffect(() => {
    let aktivno = true;
    ucitajOperacije(cesticaId)
      .then((r) => {
        if (!aktivno) return;
        setStanje(r.ok ? { status: 'ok', data: r.operacije } : { status: 'greska', poruka: r.poruka });
        if (r.ok) {
          onBroj?.(r.operacije.length);
          void spremiListu(cesticaId, r.operacije);
        }
      })
      .catch(async () => {
        // bez signala → zadnja učitana lista s ovog uređaja
        const lista = await ucitajListu<Operacija>(cesticaId);
        if (!aktivno) return;
        setStanje(lista ? { status: 'ok', data: lista, izMemorije: true } : { status: 'greska', poruka: 'Bez signala — operacije ove čestice još nisu učitane na ovom uređaju.' });
      });
    return () => {
      aktivno = false;
    };
  }, [cesticaId, verzija, onBroj]);

  // Stavke ove čestice koje čekaju slanje; kad red splasne (poslano) → ponovo učitaj s poslužitelja
  const red = useSyncExternalStore(pretplati, stanjeReda, () => []);
  const naCekanju = red.filter((st) => st.cesticaId === cesticaId);
  const prosli = useRef(naCekanju.length);
  useEffect(() => {
    if (naCekanju.length < prosli.current) setVerzija((v) => v + 1);
    prosli.current = naCekanju.length;
  }, [naCekanju.length]);

  const osvjezi = () => setVerzija((v) => v + 1);

  if (forma)
    return (
      <OperacijaForma
        cesticeIds={[cesticaId]}
        gospodarstvoId={gospodarstvoId}
        kultura={kultura}
        onGotovo={() => {
          setForma(false);
          osvjezi();
        }}
        onOdustani={() => setForma(false)}
      />
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {smijeUpisivati && (
          <Button onClick={() => setForma(true)} className="flex-1">
            + Dodaj operaciju
          </Button>
        )}
        <a
          href={`/ispis/cestica/${cesticaId}?gosp=${gospodarstvoId}`}
          className="inline-flex min-h-12 items-center justify-center rounded-lg px-4 text-sm font-semibold text-list-700 ring-1 ring-zinc-300 hover:bg-list-500/10"
        >
          Ispis / PDF
        </a>
      </div>
      {stanje.status === 'ucitavam' && <p className="text-sm text-zinc-500">Učitavam operacije…</p>}
      {stanje.status === 'greska' && (
        <p role="alert" className="text-sm text-red-700">
          {stanje.poruka}
        </p>
      )}
      {naCekanju.length > 0 && (
        <ul className="flex flex-col gap-1">
          {naCekanju.map((st) => (
            <NaCekanjuRed key={st.localId} st={st} />
          ))}
        </ul>
      )}
      {stanje.status === 'ok' && stanje.izMemorije && <p className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">Bez signala — prikazano zadnje učitano na ovom uređaju.</p>}
      {stanje.status === 'ok' && stanje.data.length === 0 && naCekanju.length === 0 && <p className="text-sm text-zinc-600">Još nema upisanih operacija na ovoj čestici.</p>}
      {stanje.status === 'ok' && stanje.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-zinc-100">
          {stanje.data.map((o) => (
            <OperacijaRed key={o.id} o={o} smijeBrisati={smijeUpisivati && !stanje.izMemorije} onObrisano={osvjezi} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NaCekanjuRed({ st }: { st: StavkaReda }) {
  const tip = st.operacija.tip as TipOperacije;
  const opis = opisOperacije({ ...(st.operacija as Parameters<typeof opisOperacije>[0]), tip, amount: st.operacija.amount === '' || st.operacija.amount == null ? null : Number(String(st.operacija.amount).replace(',', '.')) });
  return (
    <li className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${st.greska ? 'bg-red-50' : 'bg-amber-50'}`}>
      <div className="min-w-0 flex-1">
        <span className="font-semibold">{TIP_LABEL[tip] ?? tip}</span> <span className="text-xs text-zinc-600">{st.operacija.datum}</span>
        {opis && <p>{opis}</p>}
        <p className={`text-xs ${st.greska ? 'text-red-800' : 'text-amber-900'}`}>{st.greska ? `⚠ Nije spremljeno: ${st.greska}` : '⏳ Čeka signal — poslat će se sama'}</p>
      </div>
      {st.greska && (
        <button type="button" onClick={() => void idbSpremiste.obrisi(st.localId)} className="min-h-11 flex-shrink-0 px-2 text-xs font-semibold text-red-800">
          Ukloni
        </button>
      )}
    </li>
  );
}

function OperacijaRed({ o, smijeBrisati, onObrisano }: { o: Operacija; smijeBrisati: boolean; onObrisano: () => void }) {
  const [potvrda, setPotvrda] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const opis = opisOperacije(o);
  return (
    <li className="flex items-start gap-2 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${TIP_BOJA[o.tip]}`}>{TIP_LABEL[o.tip]}</span>
          <span className="text-xs text-zinc-500">{fmtDatum.format(new Date(`${o.datum}T12:00:00`))}</span>
        </div>
        {opis && <p className="mt-0.5 text-sm">{opis}</p>}
        {o.note && o.tip !== 'ostalo' && <p className="mt-0.5 text-xs text-zinc-600">{o.note}</p>}
        {greska && (
          <p role="alert" className="text-xs text-red-700">
            {greska}
          </p>
        )}
      </div>
      {smijeBrisati &&
        (potvrda ? (
          <div className="flex flex-shrink-0 gap-1">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    const r = await obrisiOperaciju(o.id);
                    if (r.ok) onObrisano();
                    else setGreska(r.poruka);
                  } catch {
                    setGreska('Brisanje traži internet — pokušaj kad bude signala.');
                    setPotvrda(false);
                  }
                })
              }
              className="min-h-11 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? '…' : 'Obriši'}
            </button>
            <button type="button" onClick={() => setPotvrda(false)} className="min-h-11 px-2 text-sm">
              Ne
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setPotvrda(true)} aria-label={`Obriši ${TIP_LABEL[o.tip]} ${o.datum}`} className="min-h-11 min-w-11 flex-shrink-0 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-red-700">
            ✕
          </button>
        ))}
    </li>
  );
}

/** Forma radnje za jednu ili više čestica (jednostavni način). Ista validacija i red bez signala. */
export function OperacijaForma({
  cesticeIds,
  gospodarstvoId,
  kultura,
  onGotovo,
  onOdustani,
  gumb = 'Spremi',
}: {
  cesticeIds: string[];
  gospodarstvoId: string;
  kultura: string | null;
  onGotovo: (poruka?: string) => void;
  onOdustani: () => void;
  gumb?: string;
}) {
  const router = useRouter();
  const [tip, setTip] = useState<TipOperacije>('prihrana');
  // stabilan localId po čestici → ponovljeno slanje (npr. nakon prekida) ne stvara duplikate
  const [localIds] = useState(() => new Map<string, string>());
  const localIdZa = (cid: string) => {
    let id = localIds.get(cid);
    if (!id) {
      id = crypto.randomUUID();
      localIds.set(cid, id);
    }
    return id;
  };
  const [greska, setGreska] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function spremi(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGreska(null);
    const fd = new FormData(e.currentTarget);
    const v = (k: string) => String(fd.get(k) ?? '');
    const polja = { tip, datum: v('datum'), note: v('note'), kultura: v('kultura'), sorta: v('sorta'), fert: v('fert'), product: v('product'), amount: v('amount'), unit: v('unit'), vlaga: v('vlaga'), hektolitarska: v('hektolitarska'), dubina: v('dubina') };
    if (cesticeIds.length === 0) return setGreska('Odaberi barem jednu česticu.');
    const stavke = cesticeIds.map((cid) => ({ cesticaId: cid, operacija: { ...polja, localId: localIdZa(cid) } }));
    // ista validacija kao na poslužitelju — greška se vidi odmah, i bez signala
    const provjera = NovaOperacijaSchema.safeParse(stavke[0]?.operacija);
    if (!provjera.success) return setGreska(provjera.error.issues[0]?.message ?? 'Provjeri unos.');
    const uRedCekanja = async () => {
      for (const st of stavke) await uRed({ localId: st.operacija.localId, cesticaId: st.cesticaId, gospodarstvoId, operacija: st.operacija });
      onGotovo(`Bez signala — ${stavke.length === 1 ? 'radnja će se poslati' : `${stavke.length} radnji će se poslati`} sama kad se vrati internet.`);
    };
    startTransition(async () => {
      if (!navigator.onLine) return uRedCekanja();
      try {
        if (stavke.length === 1 && stavke[0]) {
          const r = await dodajOperaciju({ cesticaId: stavke[0].cesticaId, gospodarstvoId, operacija: stavke[0].operacija });
          if (!r.ok) return setGreska(r.poruka);
          if (r.kulturaPromijenjena) router.refresh();
          return onGotovo();
        }
        const r = await dodajOperacijeVise({ gospodarstvoId, stavke });
        if (!r.ok) return setGreska(r.poruka);
        router.refresh();
        onGotovo(r.neuspjelo.length ? `Spremljeno na ${r.spremljeno} čestica; ${r.neuspjelo.length} nije uspjelo — pokušaj ponovo za njih.` : `Spremljeno na ${r.spremljeno} čestica.`);
      } catch (err) {
        if (jeGreskaMreze(err)) return uRedCekanja();
        setGreska('Spremanje nije uspjelo. Pokušaj ponovo.');
      }
    });
  }

  const jedinice = JEDINICE[tip];

  return (
    <form onSubmit={spremi} className="flex flex-col gap-3" aria-label="Nova operacija">
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Vrsta</legend>
        <div className="grid grid-cols-3 gap-1">
          {TIPOVI_OPERACIJA.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={t === tip}
              onClick={() => setTip(t)}
              className={`min-h-11 rounded-lg text-sm font-semibold ring-1 ${t === tip ? 'bg-list-600 text-white ring-list-600' : 'bg-white ring-zinc-300'}`}
            >
              {TIP_LABEL[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <Polje label="Datum">
        <input name="datum" type="date" required defaultValue={danas()} className={INPUT} />
      </Polje>

      {/* key={tip}: promjena vrste resetira polja te vrste */}
      <div key={tip} className="flex flex-col gap-3">
        {(tip === 'sjetva' || tip === 'zetva') && (
          <Polje label={tip === 'sjetva' ? 'Kultura *' : 'Kultura'}>
            <input name="kultura" list="op-kulture" defaultValue={kultura ?? ''} required={tip === 'sjetva'} maxLength={120} autoComplete="off" className={INPUT} />
          </Polje>
        )}
        {tip === 'sjetva' && (
          <Polje label="Sorta / hibrid">
            <input name="sorta" maxLength={120} autoComplete="off" className={INPUT} />
          </Polje>
        )}
        {tip === 'prihrana' && (
          <Polje label="Gnojivo *">
            <input name="fert" list="op-gnojiva" required maxLength={120} autoComplete="off" placeholder="npr. KAN" className={INPUT} />
          </Polje>
        )}
        {tip === 'zastita' && (
          <Polje label="Sredstvo *">
            <input name="product" required maxLength={200} autoComplete="off" placeholder="naziv pripravka" className={INPUT} />
          </Polje>
        )}
        {tip === 'obrada' && (
          <Polje label="Vrsta obrade *">
            <input name="product" list="op-obrade" required maxLength={200} autoComplete="off" placeholder="npr. Oranje" className={INPUT} />
          </Polje>
        )}
        {jedinice.length > 0 && (
          <div className="flex gap-2">
            <Polje label={tip === 'zetva' ? 'Prinos' : tip === 'sjetva' ? 'Norma sjetve' : 'Količina'} className="flex-1">
              <input name="amount" inputMode="decimal" autoComplete="off" className={INPUT} />
            </Polje>
            <Polje label="Jedinica" className="w-28">
              <select name="unit" defaultValue={jedinice[0]} className={INPUT}>
                {jedinice.map((j) => (
                  <option key={j}>{j}</option>
                ))}
              </select>
            </Polje>
          </div>
        )}
        {(tip === 'sjetva' || tip === 'obrada') && (
          <Polje label="Dubina (cm)">
            <input name="dubina" inputMode="decimal" autoComplete="off" className={INPUT} />
          </Polje>
        )}
        {tip === 'zetva' && (
          <div className="flex gap-2">
            <Polje label="Vlaga (%)" className="flex-1">
              <input name="vlaga" inputMode="decimal" autoComplete="off" className={INPUT} />
            </Polje>
            <Polje label="Hektolitar (kg/hl)" className="flex-1">
              <input name="hektolitarska" inputMode="decimal" autoComplete="off" className={INPUT} />
            </Polje>
          </div>
        )}
        <Polje label={tip === 'ostalo' ? 'Opis *' : 'Bilješka'}>
          <textarea name="note" rows={2} maxLength={2000} required={tip === 'ostalo'} className={`${INPUT} py-2`} />
        </Polje>
      </div>

      <datalist id="op-kulture">
        {KULTURE.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <datalist id="op-gnojiva">
        {GNOJIVA.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <datalist id="op-obrade">
        {OBRADE.map((k) => (
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
          {pending ? 'Spremam…' : gumb}
        </Button>
        <Button type="button" variant="ghost" onClick={onOdustani} disabled={pending}>
          Odustani
        </Button>
      </div>
    </form>
  );
}

const INPUT = 'min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base focus:border-list-600 focus:outline-none focus:ring-2 focus:ring-list-500/30';

function Polje({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
