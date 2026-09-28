'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { mfaPrijava } from '../actions';
import { IDLE } from '../state';

export function MfaKodForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(mfaPrijava, IDLE);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Kod iz aplikacije za autentifikaciju</span>
        <input
          name="kod"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          placeholder="123 456"
          className="min-h-12 rounded-lg border border-zinc-300 bg-white px-3 text-center font-mono text-2xl tracking-widest focus:border-list-600 focus:outline-none focus:ring-2 focus:ring-list-500/30"
        />
      </label>
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Provjeravam…' : 'Potvrdi'}
      </Button>
    </form>
  );
}
