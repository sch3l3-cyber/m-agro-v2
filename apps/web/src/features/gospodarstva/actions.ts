'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb, DbError } from '@/lib/db';
import type { FormState } from '@/features/auth/state';

const NovoSchema = z.object({
  naziv: z.string().trim().min(1, 'Unesi naziv').max(200),
  mibpg: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, 'MIBPG sadrži samo znamenke')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export async function kreirajGospodarstvo(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = NovoSchema.safeParse({ naziv: fd.get('naziv'), mibpg: fd.get('mibpg') ?? '' });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
    return { status: 'error', message: 'Provjeri označena polja.', fieldErrors: fe };
  }
  try {
    await getDb().gospodarstva.create(parsed.data);
  } catch (err) {
    if (err instanceof DbError && err.code === '23505') {
      return { status: 'error', message: 'Gospodarstvo s tim MIBPG-om već postoji. Javi se administratoru.', fieldErrors: { mibpg: 'Već registriran' } };
    }
    console.error('[gospodarstva] create', err);
    return { status: 'error', message: 'Spremanje nije uspjelo. Pokušaj ponovo.' };
  }
  revalidatePath('/');
  return { status: 'success', message: 'Gospodarstvo je kreirano.' };
}
