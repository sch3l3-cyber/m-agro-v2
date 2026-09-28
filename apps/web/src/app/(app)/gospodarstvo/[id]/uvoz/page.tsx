import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { imaOvlast } from '@m-agro/domain';
import { getAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { UvozForm } from '@/features/cestice/components/UvozForm';

export const metadata: Metadata = { title: 'Uvoz čestica' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuth().getUser();
  if (!user) redirect('/prijava');
  const db = getDb();
  const gosp = await db.gospodarstva.get(id, user.id);
  if (!gosp || !imaOvlast(gosp.uloga, 'clan')) notFound();
  const postojece = await db.cestice.listByGospodarstvo(id);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto w-full max-w-2xl">
        <Link href={`/gospodarstvo/${id}`} className="text-sm text-list-700">
          ← {gosp.naziv}
        </Link>
        <h1 className="mb-5 text-xl font-semibold">Uvoz čestica</h1>
        <UvozForm gospodarstvoId={id} vlasnik={gosp.uloga === 'vlasnik'} brojPostojecih={postojece.length} />
      </div>
    </div>
  );
}
