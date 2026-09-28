import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';

// Bez zaglavlja aplikacije — čista A4 stranica za ispis / "Spremi kao PDF"
export default async function IspisLayout({ children }: { children: React.ReactNode }) {
  const auth = getAuth();
  if (!(await auth.getUser())) redirect('/prijava');
  if ((await auth.mfaStatus()).potrebnoAal2) redirect('/prijava/mfa');
  return <div className="min-h-full bg-white text-zinc-900">{children}</div>;
}
