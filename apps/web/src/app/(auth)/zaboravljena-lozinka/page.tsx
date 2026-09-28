import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/components/AuthForm';
import { zatraziReset } from '@/features/auth/actions';

export const metadata: Metadata = { title: 'Zaboravljena lozinka' };

export default function Page() {
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Zaboravljena lozinka</h1>
      <AuthForm
        action={zatraziReset}
        gumb="Pošalji link"
        polja={[{ name: 'email', label: 'Email', type: 'email', autoComplete: 'email' }]}
        footer={[{ href: '/prijava', tekst: 'Natrag na prijavu' }]}
      />
    </>
  );
}
