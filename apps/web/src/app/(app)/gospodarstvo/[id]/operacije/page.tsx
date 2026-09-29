import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { imaOvlast } from '@m-agro/domain';
import { getAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { PregledOperacija } from '@/features/operacije/components/PregledOperacija';

export const metadata: Metadata = { title: 'Operacije' };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ godina?: string }> }) {
  const { id } = await params;
  const { godina: g } = await searchParams;
  const user = await getAuth().getUser();
  if (!user) redirect('/prijava');

  const db = getDb();
  const gosp = await db.gospodarstva.get(id, user.id);
  if (!gosp) notFound();

  const ova = new Date().getFullYear();
  const godina = g && /^\d{4}$/.test(g) && +g >= 2017 && +g <= ova + 1 ? +g : ova;
  const operacije = await db.operacije.listByGospodarstvo(id, `${godina}-01-01`, `${godina}-12-31`);

  return (
    <>
      <div className="flex min-h-12 flex-shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-2">
        <div className="flex min-w-0 items-center">
          <Link href={`/gospodarstvo/${id}`} className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center text-xl text-list-700" aria-label="Natrag na kartu">
            ←
          </Link>
          <h1 className="truncate font-semibold">Operacije · {gosp.naziv}</h1>
        </div>
        <nav className="flex flex-shrink-0 gap-1" aria-label="Godina">
          {[ova, ova - 1, ova - 2].map((y) => (
            <Link
              key={y}
              href={`/gospodarstvo/${id}/operacije?godina=${y}`}
              aria-current={y === godina ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold ${y === godina ? 'bg-list-600 text-white' : 'text-list-700 ring-1 ring-zinc-300'}`}
            >
              {y}
            </Link>
          ))}
        </nav>
      </div>
      <PregledOperacija key={godina} operacije={operacije} godina={godina} smijeBrisati={imaOvlast(gosp.uloga, 'clan')} gospodarstvoId={id} />
    </>
  );
}
