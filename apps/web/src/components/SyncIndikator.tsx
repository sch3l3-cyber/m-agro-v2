'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { dodajOperaciju } from '@/features/operacije/actions';
import { idbSpremiste, pretplati, stanjeReda, ucitajRed } from '@/lib/offline/red';
import { sinkroniziraj } from '@/lib/offline/sinkronizacija';

function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Zaglavlje: "Bez signala" / "⏳ N čeka slanje". Ujedno pokreće slanje reda:
 * pri otvaranju, kad se vrati signal, kad se aplikacija vrati u prvi plan i svakih 60 s.
 */
export function SyncIndikator() {
  const router = useRouter();
  const online = useOnline();
  const red = useSyncExternalStore(pretplati, stanjeReda, () => []);
  const radi = useRef(false);

  useEffect(() => {
    const sink = async () => {
      if (radi.current || !navigator.onLine) return;
      radi.current = true;
      try {
        const r = await sinkroniziraj(idbSpremiste, async (s) => {
          const odg = await dodajOperaciju({ cesticaId: s.cesticaId, gospodarstvoId: s.gospodarstvoId, operacija: s.operacija });
          return odg.ok ? 'ok' : { greska: odg.poruka };
        });
        if (r.poslano > 0) router.refresh();
      } finally {
        radi.current = false;
      }
    };
    void ucitajRed().then(sink);
    const vidljivo = () => document.visibilityState === 'visible' && void sink();
    window.addEventListener('online', sink);
    document.addEventListener('visibilitychange', vidljivo);
    const t = setInterval(sink, 60_000);
    return () => {
      window.removeEventListener('online', sink);
      document.removeEventListener('visibilitychange', vidljivo);
      clearInterval(t);
    };
  }, [router]);

  const ceka = red.filter((s) => !s.greska).length;
  const greske = red.length - ceka;
  if (online && red.length === 0) return null;
  return (
    <span role="status" className={`rounded-full px-2.5 py-1 text-xs font-semibold ${online ? 'bg-amber-100 text-amber-900' : 'bg-zinc-800 text-white'}`}>
      {!online && 'Bez signala'}
      {!online && ceka > 0 && ' · '}
      {ceka > 0 && `⏳ ${ceka} čeka slanje`}
      {greske > 0 && ` · ⚠ ${greske} greška`}
    </span>
  );
}

/** Registracija service workera (samo produkcija — u dev modu bi cacheirao vruće module). */
export function SwRegistracija() {
  // Nakon deploya stara otvorena stranica zove server akcije koje više ne postoje
  // (UnrecognizedActionError) → jednom osvježi stranicu da dobije novu verziju.
  useEffect(() => {
    const h = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string } | undefined;
      if (r?.name !== 'UnrecognizedActionError' && !r?.message?.includes('was not found on the server')) return;
      try {
        const zadnje = Number(sessionStorage.getItem('m-agro-reload') ?? 0);
        if (Date.now() - zadnje < 60_000) return;
        sessionStorage.setItem('m-agro-reload', String(Date.now()));
      } catch {
        /* bez sessionStorage — ipak osvježi */
      }
      location.reload();
    };
    window.addEventListener('unhandledrejection', h);
    return () => window.removeEventListener('unhandledrejection', h);
  }, []);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('[sw] registracija', err));
  }, []);
  return null;
}
