import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import { odjava } from '@/features/auth/actions';
import { Button } from '@/components/ui/button';

// Lekcija #6: bez position:sticky — flex stupac, scroll samo na <main>
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Druga linija obrane (prva je proxy.ts): RSC ne vjeruje da je proxy odradio posao
  const user = await getAuth().getUser();
  if (!user) redirect('/prijava');

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2">
        <span className="text-lg font-bold text-list-700">M-AGRO</span>
        <div className="flex items-center gap-2">
          <span className="hidden max-w-48 truncate text-sm text-zinc-600 sm:inline">{user.email}</span>
          <form action={odjava}>
            <Button variant="ghost" type="submit">Odjava</Button>
          </form>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
