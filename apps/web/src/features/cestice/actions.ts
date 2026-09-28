'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertWGS84, MAX_CESTICA_PO_UVOZU, UrediCesticuSchema, UvozCesticaDtoSchema, UvozModSchema } from '@m-agro/domain';
import { DbError, getDb, type UvozIshod } from '@/lib/db';

const UlazSchema = z.object({
  gospodarstvoId: z.uuid(),
  mod: UvozModSchema,
  cestice: z.array(UvozCesticaDtoSchema).min(1).max(MAX_CESTICA_PO_UVOZU),
});

export type UvozOdgovor = { ok: true; ishod: UvozIshod } | { ok: false; poruka: string };

/**
 * Server NE vjeruje klijentskom parseru: ponovno validira strukturu i WGS84 raspon
 * (03_SIGURNOST.md — Zod na svim granicama). Autorizaciju radi RLS u bazi.
 */
export async function uveziCestice(ulaz: unknown): Promise<UvozOdgovor> {
  const parsed = UlazSchema.safeParse(ulaz);
  if (!parsed.success) return { ok: false, poruka: 'Podaci za uvoz nisu ispravni. Osvježi stranicu i pokušaj ponovo.' };
  try {
    for (const c of parsed.data.cestice) assertWGS84(c.geom);
  } catch {
    return { ok: false, poruka: 'Neka čestica ima koordinate izvan WGS84 raspona.' };
  }

  try {
    const ishod = await getDb().cestice.uvezi(parsed.data.gospodarstvoId, parsed.data.cestice, parsed.data.mod);
    revalidatePath(`/gospodarstvo/${parsed.data.gospodarstvoId}`);
    return { ok: true, ishod };
  } catch (err) {
    console.error('[cestice] uvoz', err);
    if (err instanceof DbError && err.code === '42501') {
      return { ok: false, poruka: parsed.data.mod === 'zamijeni' ? 'Samo vlasnik može zamijeniti sve čestice.' : 'Nemaš pravo uvoziti u ovo gospodarstvo.' };
    }
    if (err instanceof DbError && err.code === '23514') return { ok: false, poruka: 'Neka čestica nije u WGS84 koordinatama.' };
    return { ok: false, poruka: 'Uvoz nije uspio — ništa nije spremljeno. Pokušaj ponovo.' };
  }
}

// ---------------------------------------------------------------- uređivanje / brisanje
export type AkcijaOdgovor = { ok: true } | { ok: false; poruka: string };

const UrediUlaz = z.object({ id: z.uuid(), gospodarstvoId: z.uuid() }).and(UrediCesticuSchema);

export async function urediCesticu(ulaz: unknown): Promise<AkcijaOdgovor> {
  const p = UrediUlaz.safeParse(ulaz);
  if (!p.success) return { ok: false, poruka: p.error.issues[0]?.message ?? 'Podaci nisu ispravni.' };
  try {
    await getDb().cestice.update(p.data.id, { naziv: p.data.naziv, kultura: p.data.kultura });
    revalidatePath(`/gospodarstvo/${p.data.gospodarstvoId}`);
    return { ok: true };
  } catch (err) {
    console.error('[cestice] uredi', err);
    if (err instanceof DbError && (err.code === 'not_found' || err.code === '42501')) return { ok: false, poruka: 'Nemaš pravo mijenjati ovu česticu.' };
    if (err instanceof DbError && err.code === '23505') return { ok: false, poruka: 'Čestica s tim ARKOD brojem već postoji.' };
    return { ok: false, poruka: 'Spremanje nije uspjelo. Pokušaj ponovo.' };
  }
}

const ObrisiUlaz = z.object({ id: z.uuid(), gospodarstvoId: z.uuid() });

export async function obrisiCesticu(ulaz: unknown): Promise<AkcijaOdgovor> {
  const p = ObrisiUlaz.safeParse(ulaz);
  if (!p.success) return { ok: false, poruka: 'Podaci nisu ispravni.' };
  try {
    await getDb().cestice.remove(p.data.id);
    revalidatePath(`/gospodarstvo/${p.data.gospodarstvoId}`);
    return { ok: true };
  } catch (err) {
    console.error('[cestice] obrisi', err);
    if (err instanceof DbError && (err.code === 'not_found' || err.code === '42501')) return { ok: false, poruka: 'Samo vlasnik gospodarstva može brisati čestice.' };
    return { ok: false, poruka: 'Brisanje nije uspjelo. Pokušaj ponovo.' };
  }
}
