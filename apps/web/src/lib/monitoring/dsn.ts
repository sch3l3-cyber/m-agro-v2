/** DSN → envelope URL (Sentry protokol, bez SDK-a). DSN nije tajna: https://KLJUC@HOST/PROJEKT */
export function envelopeUrl(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projekt = u.pathname.replace(/^\/+/, '');
    if (!u.username || !projekt) return null;
    return `${u.protocol}//${u.host}/api/${projekt}/envelope/?sentry_key=${u.username}&sentry_version=7`;
  } catch {
    return null;
  }
}

/** Nikad ne šalji query string (može sadržavati token_hash, code…) ni fragment. */
export const bezUpita = (putanja: string) => putanja.split(/[?#]/)[0] ?? putanja;
