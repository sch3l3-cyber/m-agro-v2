'use client';

import { useRef, useState } from 'react';

interface Poruka {
  uloga: 'korisnik' | 'asistent';
  tekst: string;
}

const PRIJEDLOZI = ['Kako stoji usjev prema satelitu?', 'Je li ovaj tjedan dobar za prihranu?', 'Što da provjerim na polju?'];

/** AI savjetnik za odabranu česticu. Kontekst (NDVI, operacije, prognoza) sastavlja server. */
export function SavjetnikTab({ cesticaId }: { cesticaId: string }) {
  const [poruke, setPoruke] = useState<Poruka[]>([]);
  const [unos, setUnos] = useState('');
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const prekid = useRef<AbortController | null>(null);
  const dno = useRef<HTMLDivElement>(null);

  async function pitaj(pitanje: string) {
    const p = pitanje.trim();
    if (!p || radi) return;
    if (!navigator.onLine) {
      setGreska('Savjetnik treba internet. Pitaj kad se vratiš u signal.');
      return;
    }
    setGreska(null);
    setUnos('');
    const povijest = poruke.slice(-8);
    setPoruke((s) => [...s, { uloga: 'korisnik', tekst: p }, { uloga: 'asistent', tekst: '' }]);
    setRadi(true);
    const ac = new AbortController();
    prekid.current = ac;
    try {
      const r = await fetch('/api/ai/savjet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cesticaId, pitanje: p, povijest }),
        signal: ac.signal,
      });
      if (!r.ok || !r.body) {
        const poruka = (await r.text().catch(() => '')) || 'Savjetnik trenutno ne radi.';
        setPoruke((s) => s.slice(0, -2));
        setUnos(p);
        setGreska(poruka);
        return;
      }
      const citac = r.body.getReader();
      const dek = new TextDecoder();
      for (;;) {
        const { value, done } = await citac.read();
        if (done) break;
        const dio = dek.decode(value, { stream: true });
        setPoruke((s) => {
          const zadnja = s.at(-1);
          return zadnja ? [...s.slice(0, -1), { ...zadnja, tekst: zadnja.tekst + dio }] : s;
        });
        dno.current?.scrollIntoView({ block: 'nearest' });
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setGreska('Veza je prekinuta. Pokušaj ponovo.');
    } finally {
      setRadi(false);
      prekid.current = null;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {poruke.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-zinc-600">Pitaj o ovoj čestici. Savjetnik vidi satelitske snimke koje su već učitane, evidenciju operacija i prognozu za 7 dana.</p>
          <div className="flex flex-wrap gap-2">
            {PRIJEDLOZI.map((q) => (
              <button key={q} type="button" onClick={() => void pitaj(q)} className="min-h-11 rounded-full px-3 text-left text-sm text-list-700 ring-1 ring-zinc-300 hover:bg-list-500/10">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2" aria-live="polite">
        {poruke.map((m, i) => (
          <div
            key={i}
            className={
              m.uloga === 'korisnik'
                ? 'ml-8 self-end rounded-2xl rounded-br-sm bg-list-600 px-3 py-2 text-sm text-white'
                : 'mr-4 whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-zinc-100 px-3 py-2 text-sm text-zinc-900'
            }
          >
            {m.tekst || (radi && i === poruke.length - 1 ? <span className="text-zinc-500">Razmišljam…</span> : null)}
          </div>
        ))}
        <div ref={dno} />
      </div>

      {greska && (
        <p role="alert" className="text-sm text-red-700">
          {greska}
        </p>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void pitaj(unos);
        }}
      >
        <label className="sr-only" htmlFor={`pitanje-${cesticaId}`}>
          Pitanje savjetniku
        </label>
        <textarea
          id={`pitanje-${cesticaId}`}
          value={unos}
          onChange={(e) => setUnos(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void pitaj(unos);
            }
          }}
          rows={2}
          maxLength={1000}
          placeholder="npr. Treba li dodatna prihrana?"
          className="min-h-11 flex-1 resize-none rounded-lg px-3 py-2 text-sm ring-1 ring-zinc-300 focus:ring-2 focus:ring-list-500 focus:outline-none"
        />
        {radi ? (
          <button type="button" onClick={() => prekid.current?.abort()} className="min-h-11 rounded-lg px-3 text-sm font-semibold ring-1 ring-zinc-300">
            Stani
          </button>
        ) : (
          <button type="submit" disabled={!unos.trim()} className="min-h-11 rounded-lg bg-list-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
            Pitaj
          </button>
        )}
      </form>
      <p className="text-xs text-zinc-500">AI savjet je pomoć pri odlučivanju, ne zamjena za agronoma. Doze i sredstva uskladi s deklaracijom i propisima.</p>
    </div>
  );
}
