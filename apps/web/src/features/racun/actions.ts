'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';

const Nacin = z.enum(['jednostavni', 'napredni']);

export async function postaviNacin(nacin: unknown): Promise<{ ok: boolean }> {
  const n = Nacin.safeParse(nacin);
  if (!n.success) return { ok: false };
  const user = await getAuth().getUser();
  if (!user) return { ok: false };
  await getDb().profil.postaviNacin(user.id, n.data);
  revalidatePath('/', 'layout');
  return { ok: true };
}
