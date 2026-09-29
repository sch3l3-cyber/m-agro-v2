'use client';

import { bezUpita } from './dsn';

let pokrenuto = false;

/**
 * Greške u pregledniku → Sentry. @sentry/browser se učitava TEK nakon što se stranica otvori
 * (dinamički import) — ne usporava prvo prikazivanje i ne ulazi u worker bundle.
 */
export async function pokreniSentryKlijent(): Promise<void> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (pokrenuto || !dsn || process.env.NODE_ENV !== 'production') return;
  pokrenuto = true;
  const Sentry = await import('@sentry/browser');
  Sentry.init({
    dsn,
    release: process.env.NEXT_PUBLIC_GIT_SHA,
    environment: 'production',
    tracesSampleRate: 0,
    // očekivano/bezopasno: stara stranica nakon deploya (sama se osvježi), prekinuti zahtjevi, bez signala
    ignoreErrors: ['UnrecognizedActionError', 'was not found on the server', 'AbortError', 'Failed to fetch', 'NetworkError', 'Load failed'],
    beforeSend(e) {
      delete e.user;
      if (e.request?.url) e.request.url = bezUpita(e.request.url);
      if (e.request) delete e.request.headers;
      return e;
    },
  });
}

/** Za provjeru iz admin pregleda. */
export async function probnaGreskaKlijent(): Promise<void> {
  await pokreniSentryKlijent();
  const Sentry = await import('@sentry/browser');
  Sentry.captureException(new Error('M-AGRO probna greška (preglednik) — sve radi'));
  await Sentry.flush(3000);
}
