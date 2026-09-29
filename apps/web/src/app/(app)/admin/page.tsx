import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { ProbaSentryLoader } from '@/components/SentryLoader';

export const metadata: Metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

/** Mora odgovarati SENTINEL_MJESECNI_LIMIT u sentinel workeru (zadano 20000). */
const LIMIT_KVOTE = 20000;
const fmt = new Intl.NumberFormat('hr-HR');
const fmtVrijeme = new Intl.DateTimeFormat('hr-HR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zagreb' });

const AKCIJE: Record<string, string> = {
  'gospodarstva.insert': 'novo gospodarstvo',
  'gospodarstva.delete': 'obrisano gospodarstvo',
  'cestice.delete': 'obrisana čestica',
  'operacije.delete': 'obrisana operacija',
  'cestice.uvoz': 'uvoz čestica',
  'memberships.insert': 'novi član gospodarstva',
  'memberships.delete': 'uklonjen član',
};

export default async function Page() {
  const p = await getDb().adminPregled(LIMIT_KVOTE);
  if (!p) notFound(); // ne otkrivamo da stranica postoji
  const udio = p.kvota.limit ? p.kvota.potroseno / p.kvota.limit : 0;
  const upozorenje = udio >= 0.8;
  const b = p.brojke;
  const plocice: [string, string, string?][] = [
    ['Korisnika', fmt.format(b.korisnika), `${fmt.format(b.korisnika_7d)} aktivnih u 7 dana`],
    ['Gospodarstava', fmt.format(b.gospodarstava)],
    ['Čestica', fmt.format(b.cestica), `${fmt.format(b.hektara)} ha`],
    ['Operacija', fmt.format(b.operacija), `${fmt.format(b.operacija_30d)} u 30 dana`],
    ['NDVI u cacheu', fmt.format(b.ndvi_cache), 'dijeljeno između korisnika'],
    ['MFA uključen', fmt.format(b.mfa_ukljuceno), 'korisnika'],
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-zemlja-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <Link href="/racun" className="inline-flex min-h-11 items-center text-list-700">
          ← Račun
        </Link>
        <h1 className="text-xl font-semibold">Admin pregled</h1>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200" aria-label="Sentinel kvota">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">Sentinel kvota · {p.kvota.mjesec}</h2>
            <p className="text-sm">
              <strong>{fmt.format(p.kvota.potroseno)}</strong> / {fmt.format(p.kvota.limit)} jedinica ({Math.round(udio * 100)} %)
            </p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-zinc-100" role="meter" aria-valuemin={0} aria-valuemax={p.kvota.limit} aria-valuenow={p.kvota.potroseno} aria-label="Potrošnja kvote">
            <div className={`h-full rounded-full ${upozorenje ? 'bg-red-600' : 'bg-list-600'}`} style={{ width: `${Math.min(100, udio * 100)}%` }} />
          </div>
          {upozorenje && (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-900">
              ⚠ Preko 80 % mjesečne kvote. Na 100 % novi satelitski upiti staju do 1. u mjesecu (cache i dalje radi).
            </p>
          )}
          {p.kvota.povijest.length > 1 && (
            <p className="mt-2 text-xs text-zinc-600">
              Prethodni mjeseci: {p.kvota.povijest.slice(1).map((m) => `${m.mjesec}: ${fmt.format(m.jedinice)}`).join(' · ')}
            </p>
          )}
        </section>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Brojke">
          {plocice.map(([naslov, vrijednost, opis]) => (
            <div key={naslov} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
              <p className="text-xs text-zinc-500">{naslov}</p>
              <p className="text-2xl font-bold">{vrijednost}</p>
              {opis && <p className="text-xs text-zinc-500">{opis}</p>}
            </div>
          ))}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200" aria-label="Praćenje grešaka">
          <h2 className="mb-2 font-semibold">Praćenje grešaka (Sentry)</h2>
          <ProbaSentryLoader ukljuceno={!!process.env.NEXT_PUBLIC_SENTRY_DSN} />
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200" aria-label="Zadnje promjene">
          <h2 className="mb-2 font-semibold">Zadnje promjene (audit log)</h2>
          {p.audit.length === 0 ? (
            <p className="text-sm text-zinc-600">Još nema zapisa.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {p.audit.map((a, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                  <span>
                    <span className="font-medium">{AKCIJE[a.action] ?? a.action}</span>
                    {a.actor_email && <span className="text-zinc-500"> · {a.actor_email}</span>}
                  </span>
                  <span className="text-xs text-zinc-500">{fmtVrijeme.format(new Date(a.created_at))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
