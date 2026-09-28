import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import { odjava } from '@/features/auth/actions';
import { Button } from '@/components/ui/button';
import { SwRegistracija, SyncIndikator } from '@/components/SyncIndikator';

// Lekcija #6: bez position:sticky — flex stupac, scroll samo na <main>
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Druga linija obrane (prva je proxy.ts): RSC ne vjeruje da je proxy odradio posao
  const auth = getAuth();
  const user = await auth.getUser();
  if (!user) redirect('/prijava');
  // uključen MFA, a sesija je samo s lozinkom → drugi korak (baza ionako ne daje podatke bez aal2)
  if ((await auth.mfaStatus()).potrebnoAal2) redirect('/prijava/mfa');

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4">
        <Link href="/" className="flex min-h-11 items-center text-lg font-bold text-list-700">
          M-AGRO
        </Link>
        <div className="flex items-center gap-2">
          <SyncIndikator />
          <Link href="/racun" className="hidden min-h-11 max-w-48 items-center truncate text-sm text-zinc-600 hover:text-list-700 sm:inline-flex">
            {user.email}
          </Link>
          <Link href="/racun" className="inline-flex min-h-11 items-center px-1 text-sm text-list-700 sm:hidden">
            Račun
          </Link>
          <form action={odjava}>
            <Button variant="ghost" type="submit" className="min-h-11 px-3">
              Odjava
            </Button>
          </form>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      <SwRegistracija />
    </div>
  );
}
