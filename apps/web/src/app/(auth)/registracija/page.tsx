import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/components/AuthForm';
import { registracija } from '@/features/auth/actions';

export const metadata: Metadata = { title: 'Registracija' };

export default function Page() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Novi račun</h1>
      <p className="mb-5 text-sm text-zinc-600">Lozinka: barem 8 znakova, slovo i broj.</p>
      <AuthForm
        action={registracija}
        gumb="Registriraj se"
        polja={[
          { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
          { name: 'lozinka', label: 'Lozinka', type: 'password', autoComplete: 'new-password' },
        ]}
        footer={[{ href: '/prijava', tekst: 'Već imaš račun? Prijavi se' }]}
      />
    </>
  );
}
