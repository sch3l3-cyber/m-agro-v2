'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { IDLE } from '@/features/auth/state';
import { kreirajGospodarstvo } from '../actions';

export function NovoGospodarstvoForm() {
  const [state, action, pending] = useActionState(kreirajGospodarstvo, IDLE);
  const fe = state.status === 'error' ? state.fieldErrors : undefined;
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field id="naziv" name="naziv" label="Naziv gospodarstva" placeholder="npr. OPG Horvat" required error={fe?.naziv} />
      <div className="flex flex-col gap-1">
        <Field id="mibpg" name="mibpg" label="MIBPG" inputMode="numeric" error={fe?.mibpg} />
        <p className="text-sm text-zinc-600">Upiši MIBPG i tvoje ARKOD čestice učitat ćemo mi, u roku 24 sata. Bez MIBPG-a čestice dodaješ sam dodirom na karti.</p>
      </div>
      {state.status === 'error' && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Spremam…' : 'Kreiraj gospodarstvo'}</Button>
    </form>
  );
}
