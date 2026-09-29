import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/components/AuthForm';
import { prijava } from '@/features/auth/actions';
import { safeNext } from '@/features/auth/state';

export const metadata: Metadata = { title: 'Prijava' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; greska?: string; obrisan?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Prijava</h1>
      {sp.obrisan === '1' && (
        <p role="status" className="mb-4 text-sm text-zinc-700">
          Račun i svi podaci su obrisani. Hvala što si koristio M-AGRO.
        </p>
      )}
      {sp.greska === 'link' && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          Ako si upravo potvrdio email, račun je aktivan — samo se prijavi. Ako prijava ne uspije, link je istekao pa se registriraj ponovo.
        </p>
      )}
      <AuthForm
        action={prijava}
        gumb="Prijavi se"
        hidden={{ next: safeNext(sp.next) }}
        polja={[
          { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
          { name: 'lozinka', label: 'Lozinka', type: 'password', autoComplete: 'current-password' },
        ]}
        footer={[
          { href: '/zaboravljena-lozinka', tekst: 'Zaboravljena lozinka?' },
          { href: '/registracija', tekst: 'Nemaš račun? Registriraj se' },
        ]}
      />
    </>
  );
}
