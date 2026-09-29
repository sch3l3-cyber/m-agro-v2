import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { imaOvlast, ndviSemafor, type Semafor } from '@m-agro/domain';
import { getAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiUkljucen } from '@/lib/ai';
import { GospodarstvoPrikaz } from '@/features/pregled/components/GospodarstvoPrikaz';
import type { ZadnjaRadnja } from '@/features/pregled/components/JednostavniPregled';

export const metadata: Metadata = { title: 'Čestice' };

/** Izvan komponente: Date.now() nije dopušten u renderu (react-compiler lint). */
function datumi() {
  const sad = Date.now();
  return {
    danas: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb' }).format(sad),
    pomak: (d: number) => new Date(sad - d * 86_400_000).toISOString().slice(0, 10),
  };
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ uvoz?: string; prikaz?: string }> }) {
  const { id } = await params;
  const { uvoz, prikaz } = await searchParams;
  const user = await getAuth().getUser();
  if (!user) redirect('/prijava');

  const db = getDb();
  const gosp = await db.gospodarstva.get(id, user.id);
  if (!gosp) notFound();
  const { danas, pomak } = datumi();
  const [cestice, nacin, ndvi, operacije] = await Promise.all([
    db.cestice.listByGospodarstvo(id),
    db.profil.nacin(user.id),
    db.cestice.ndviNedavno(id, pomak(50)).catch(() => ({}) as Record<string, { datum: string; mean: number }[]>),
    db.operacije.listByGospodarstvo(id, pomak(365), danas).catch(() => []),
  ]);
  const smijeUvoz = imaOvlast(gosp.uloga, 'clan');

  // zadnja radnja i zadnja žetva/obrada po čestici (operacije su najnovije prve)
  const zadnjeRadnje: Record<string, ZadnjaRadnja> = {};
  const zadnjaZetva: Record<string, string> = {};
  for (const o of operacije) {
    zadnjeRadnje[o.cesticaId] ??= { tip: o.tip, datum: o.datum };
    if (o.tip === 'zetva' || o.tip === 'obrada') zadnjaZetva[o.cesticaId] ??= o.datum;
  }
  const semafori: Record<string, Semafor> = {};
  for (const c of cestice) semafori[c.id] = ndviSemafor(ndvi[c.id] ?? [], danas, zadnjaZetva[c.id] ?? null);
  const pocetni = prikaz === 'karta' || prikaz === 'pregled' ? prikaz : nacin === 'jednostavni' ? 'pregled' : 'karta';

  return (
    <>
      <div className="flex min-h-12 flex-shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-2">
        <div className="flex min-w-0 items-center">
          <Link href="/" className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center text-xl text-list-700" aria-label="Natrag na gospodarstva">
            ←
          </Link>
          <h1 className="truncate font-semibold">{gosp.naziv}</h1>
        </div>
        <div className="flex flex-shrink-0 gap-1">
          <Link
            href={`/gospodarstvo/${id}/operacije`}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-list-700 ring-1 ring-zinc-300 hover:bg-list-500/10"
          >
            Operacije
          </Link>
          {smijeUvoz && (
            <Link
              href={`/gospodarstvo/${id}/uvoz`}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-list-700 ring-1 ring-zinc-300 hover:bg-list-500/10"
            >
              Uvezi
            </Link>
          )}
        </div>
      </div>

      {uvoz && (
        <p role="status" className="flex-shrink-0 bg-list-500/10 px-4 py-2 text-sm text-list-700">
          Uvoz gotov: {uvoz.slice(0, 200)}.
        </p>
      )}

      {cestice.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <p className="mb-2 text-lg font-semibold">Još nema čestica</p>
            <p className="mb-5 text-zinc-600">
              Uvezi GeoJSON iz QGIS generatora (ARKOD) ili izvoz iz Google Eartha. Koordinate se pretvaraju automatski.
            </p>
            {smijeUvoz && (
              <Link
                href={`/gospodarstvo/${id}/uvoz`}
                className="inline-flex min-h-12 items-center rounded-lg bg-list-600 px-5 font-semibold text-white hover:bg-list-700"
              >
                Uvezi čestice
              </Link>
            )}
          </div>
        </div>
      ) : (
        <GospodarstvoPrikaz
          cestice={cestice}
          gospodarstvoId={id}
          smijeUredjivati={smijeUvoz}
          smijeBrisati={imaOvlast(gosp.uloga, 'vlasnik')}
          ai={aiUkljucen()}
          napredno={nacin === 'napredni'}
          pocetni={pocetni}
          semafori={semafori}
          zadnjeRadnje={zadnjeRadnje}
        />
      )}
    </>
  );
}
