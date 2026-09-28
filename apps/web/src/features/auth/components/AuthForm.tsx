'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { IDLE, type FormState } from '../state';

type Polje = { name: string; label: string; type: 'email' | 'password'; autoComplete: string };

export function AuthForm({
  action,
  polja,
  gumb,
  hidden,
  footer,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  polja: Polje[];
  gumb: string;
  hidden?: Record<string, string>;
  footer?: { href: string; tekst: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);

  if (state.status === 'success') {
    return (
      <p role="status" className="rounded-lg bg-list-500/10 p-4 text-list-700">
        {state.message}
      </p>
    );
  }

  const fe = state.status === 'error' ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {polja.map((p) => (
        <Field key={p.name} id={p.name} name={p.name} label={p.label} type={p.type} autoComplete={p.autoComplete} required error={fe?.[p.name]} />
      ))}
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Pričekaj…' : gumb}
      </Button>
      {footer && (
        <nav className="flex flex-col gap-2 pt-2 text-center text-sm">
          {footer.map((f) => (
            <Link key={f.href} href={f.href} className="text-list-700 underline-offset-4 hover:underline">
              {f.tekst}
            </Link>
          ))}
        </nav>
      )}
    </form>
  );
}
