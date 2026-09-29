'use server';

import { getDb } from '@/lib/db';
import { posaljiGreskuServer } from '@/lib/monitoring/server';

/** Admin provjera Sentryja: šalje probnu serversku grešku (ne ruši ništa). */
export async function probnaGreskaServer(): Promise<{ ok: boolean }> {
  if (!(await getDb().adminPregled(9000))) return { ok: false };
  await posaljiGreskuServer(new Error('M-AGRO probna greška (server) — sve radi'), { putanja: '/admin', metoda: 'POST', ruta: '/admin', vrsta: 'proba' });
  return { ok: true };
}
