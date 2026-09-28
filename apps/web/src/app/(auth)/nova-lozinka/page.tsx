import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/components/AuthForm';
import { postaviNovuLozinku } from '@/features/auth/actions';

export const metadata: Metadata = { title: 'Nova lozinka' };

// Dolazi se ovamo iz reset linka (/auth/potvrda postavi sesiju). proxy.ts traži prijavu.
export default function Page() {
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Postavi novu lozinku</h1>
      <AuthForm
        action={postaviNovuLozinku}
        gumb="Spremi lozinku"
        polja={[
          { name: 'lozinka', label: 'Nova lozinka', type: 'password', autoComplete: 'new-password' },
          { name: 'potvrda', label: 'Ponovi lozinku', type: 'password', autoComplete: 'new-password' },
        ]}
      />
    </>
  );
}
