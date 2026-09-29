import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { imaOvlast } from '@m-agro/domain';
import { getAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiUkljucen } from '@/lib/ai';
import { ParceleView } from '@/features/cestice/components/ParceleView';

export const metadata: Metadata = { title: 'Čestice' };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ uvoz?: string }> }) {
  const { id } = await params;
  const { uvoz } = await searchParams;
  const user = await getAuth().getUser();
  if (!user) redirect('/prijava');

  const db = getDb();
  const gosp = await db.gospodarstva.get(id, user.id);
  if (!gosp) notFound();
  const cestice = await db.cestice.listByGospodarstvo(id);
  const smijeUvoz = imaOvlast(gosp.uloga, 'clan');

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
        <ParceleView cestice={cestice} gospodarstvoId={id} smijeUredjivati={smijeUvoz} smijeBrisati={imaOvlast(gosp.uloga, 'vlasnik')} ai={aiUkljucen()} />
      )}
    </>
  );
}
