'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertWGS84, MAX_CESTICA_PO_UVOZU, UvozCesticaDtoSchema, UvozModSchema } from '@m-agro/domain';
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
