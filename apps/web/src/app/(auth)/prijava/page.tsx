import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/components/AuthForm';
import { prijava } from '@/features/auth/actions';
import { safeNext } from '@/features/auth/state';

export const metadata: Metadata = { title: 'Prijava' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; greska?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Prijava</h1>
      {sp.greska === 'link' && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          Link je istekao ili je već iskorišten. Prijavi se ili zatraži novi.
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
