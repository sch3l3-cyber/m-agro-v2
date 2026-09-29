import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { MfaPostavke } from '@/features/auth/components/MfaPostavke';

export const metadata: Metadata = { title: 'Račun' };

export default async function Page() {
  const auth = getAuth();
  const user = await auth.getUser();
  if (!user) redirect('/prijava');
  const mfa = await auth.mfaStatus();
  const faktor = mfa.faktori.find((f) => f.potvrden) ?? null;
  const admin = (await getDb().adminPregled(20000).catch(() => null)) !== null;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-zemlja-50">
      <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
        <Link href="/" className="inline-flex min-h-11 items-center text-list-700">
          ← Gospodarstva
        </Link>
        <h1 className="text-xl font-semibold">Račun</h1>
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-500">Email</p>
          <p className="font-medium">{user.email}</p>
        </section>
        {admin && (
          <Link href="/admin" className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-semibold text-list-700 ring-1 ring-zinc-300 hover:bg-list-500/10">
            Admin pregled →
          </Link>
        )}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <h2 className="mb-3 font-semibold">Dvofaktorska prijava (2FA)</h2>
          <MfaPostavke ukljuceno={!!faktor} factorId={faktor?.id ?? null} />
        </section>
      </div>
    </div>
  );
}
