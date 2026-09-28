'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { NovaOperacijaSchema } from '@m-agro/domain';
import { DbError, getDb, type Operacija } from '@/lib/db';

export type OperacijeOdgovor = { ok: true; operacije: Operacija[] } | { ok: false; poruka: string };
export type SpremiOdgovor = { ok: true; kulturaPromijenjena: boolean } | { ok: false; poruka: string };

const Id = z.uuid();

export async function ucitajOperacije(cesticaId: unknown): Promise<OperacijeOdgovor> {
  const id = Id.safeParse(cesticaId);
  if (!id.success) return { ok: false, poruka: 'Neispravna čestica.' };
  try {
    return { ok: true, operacije: await getDb().operacije.listByCestica(id.data) };
  } catch (err) {
    console.error('[operacije] lista', err);
    return { ok: false, poruka: 'Operacije se nisu učitale. Pokušaj ponovo.' };
  }
}

const DodajUlaz = z.object({ cesticaId: z.uuid(), gospodarstvoId: z.uuid(), operacija: NovaOperacijaSchema });

/** Server ponovo validira (Zod na granici); autorizaciju radi RLS (član+ i created_by = auth.uid()). */
export async function dodajOperaciju(ulaz: unknown): Promise<SpremiOdgovor> {
  const p = DodajUlaz.safeParse(ulaz);
  if (!p.success) return { ok: false, poruka: p.error.issues[0]?.message ?? 'Podaci nisu ispravni.' };
  const { cesticaId, gospodarstvoId, operacija } = p.data;
  const db = getDb();
  try {
    await db.operacije.create(cesticaId, operacija);
  } catch (err) {
    console.error('[operacije] dodaj', err);
    if (err instanceof DbError && err.code === '42501') return { ok: false, poruka: 'Nemaš pravo upisivati operacije na ovom gospodarstvu.' };
    if (err instanceof DbError && err.code === '23514') return { ok: false, poruka: 'Neka vrijednost je izvan dopuštenog raspona.' };
    return { ok: false, poruka: 'Spremanje nije uspjelo. Pokušaj ponovo.' };
  }

  // Sjetva postavlja kulturu čestice — ali samo ako je to NAJNOVIJA sjetva (upis starih sezona ne prepisuje)
  let kulturaPromijenjena = false;
  if (operacija.tip === 'sjetva') {
    try {
      const sjetve = (await db.operacije.listByCestica(cesticaId)).filter((o) => o.tip === 'sjetva');
      if (sjetve[0]?.datum === operacija.datum) {
        await db.cestice.postaviKulturu(cesticaId, operacija.kultura);
        kulturaPromijenjena = true;
        revalidatePath(`/gospodarstvo/${gospodarstvoId}`);
      }
    } catch (err) {
      console.error('[operacije] kultura nakon sjetve', err); // operacija je spremljena — ovo nije fatalno
    }
  }
  return { ok: true, kulturaPromijenjena };
}

export async function obrisiOperaciju(id: unknown): Promise<{ ok: true } | { ok: false; poruka: string }> {
  const p = Id.safeParse(id);
  if (!p.success) return { ok: false, poruka: 'Neispravna operacija.' };
  try {
    await getDb().operacije.remove(p.data);
    return { ok: true };
  } catch (err) {
    console.error('[operacije] obriši', err);
    if (err instanceof DbError && (err.code === 'not_found' || err.code === '42501')) return { ok: false, poruka: 'Nemaš pravo brisati ovu operaciju.' };
    return { ok: false, poruka: 'Brisanje nije uspjelo.' };
  }
}
