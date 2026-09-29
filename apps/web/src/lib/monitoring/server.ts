import { bezUpita, envelopeUrl } from './dsn';

/**
 * Serverske greške → Sentry, BEZ @sentry/nextjs (worker ima limit 3 MiB; ovo je ~1 KB).
 * Šalje se samo: tip, poruka, stack, putanja bez upita, metoda, ruta. Nikad headeri/cookieji/tijelo.
 */
export async function posaljiGreskuServer(err: unknown, meta: { putanja?: string; metoda?: string; ruta?: string; vrsta?: string }): Promise<void> {
  const url = envelopeUrl(process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (!url) return;
  const e = err instanceof Error ? err : new Error(String(err));
  const eventId = crypto.randomUUID().replace(/-/g, '');
  const sada = new Date().toISOString();
  const okviri = (e.stack ?? '')
    .split('\n')
    .slice(1, 30)
    .map((l) => ({ function: l.trim().replace(/^at\s+/, '').slice(0, 200) }))
    .reverse();
  const dogadjaj = {
    event_id: eventId,
    timestamp: sada,
    platform: 'javascript',
    level: 'error',
    logger: 'server',
    environment: process.env.NODE_ENV ?? 'production',
    release: process.env.NEXT_PUBLIC_GIT_SHA,
    tags: { runtime: 'cloudflare-worker', ruta: meta.ruta ?? '', vrsta: meta.vrsta ?? '' },
    request: meta.putanja ? { url: bezUpita(meta.putanja), method: meta.metoda } : undefined,
    exception: { values: [{ type: e.name, value: e.message.slice(0, 1000), stacktrace: okviri.length ? { frames: okviri } : undefined }] },
  };
  const tijelo = `${JSON.stringify({ event_id: eventId, sent_at: sada })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(dogadjaj)}\n`;
  try {
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-sentry-envelope' }, body: tijelo, signal: AbortSignal.timeout(3000) });
  } catch {
    // praćenje grešaka nikad ne smije srušiti zahtjev
  }
}
