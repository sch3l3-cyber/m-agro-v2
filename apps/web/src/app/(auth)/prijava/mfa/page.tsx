import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import { odjava } from '@/features/auth/actions';
import { MfaKodForm } from '@/features/auth/components/MfaKodForm';
import { safeNext } from '@/features/auth/state';

export const metadata: Metadata = { title: 'Potvrda prijave' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const auth = getAuth();
  if (!(await auth.getUser())) redirect('/prijava');
  if (!(await auth.mfaStatus()).potrebnoAal2) redirect(next);
  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">Potvrda prijave</h1>
      <p className="mb-5 text-sm text-zinc-600">Otvori aplikaciju za autentifikaciju (npr. Google Authenticator) i upiši kod za M-AGRO.</p>
      <MfaKodForm next={next} />
      <form action={odjava} className="mt-4 text-center">
        <button type="submit" className="min-h-11 text-sm text-list-700">
          Odustani i odjavi se
        </button>
      </form>
    </>
  );
}
