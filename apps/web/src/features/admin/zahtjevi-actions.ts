'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { arkodBrojeviIzTeksta, lpisNaziv } from '@m-agro/domain';
import { arkodUTocki } from '@/lib/arkod/wms';
import { DbError, getDb } from '@/lib/db';

/** Admin: učitavanje ARKOD čestica za zahtjev (MIBPG). Sve provjere ovlasti su u bazi (is_admin + mfa_ok). */
export async function adminPronadi(tekst: unknown): Promise<{ ok: true; cestice: { arkodId: string; lon: number; lat: number; ha: number | null; naziv: string; vrstaUporabe: string | null }[]; nepronadeno: number } | { ok: false; poruka: string }> {
  if (typeof tekst !== 'string' || tekst.length > 200_000) return { ok: false, poruka: 'Neispravan tekst.' };
  const ids = arkodBrojeviIzTeksta(tekst);
  if (ids.length === 0) return { ok: false, poruka: 'Nema ARKOD brojeva u tekstu.' };
  if (ids.length > 500) return { ok: false, poruka: 'Najviše 500 brojeva.' };
  try {
    const n = await getDb().arkod.poBrojevima(ids);
    return { ok: true, cestice: n.map((c) => ({ arkodId: c.arkodId, lon: c.lon, lat: c.lat, ha: c.ha, naziv: c.naziv?.trim() || `ARKOD ${c.arkodId}`, vrstaUporabe: lpisNaziv(c.landUseId) })), nepronadeno: ids.length - n.length };
  } catch (err) {
    if (err instanceof DbError && err.code === 'P0001') return { ok: false, poruka: 'Dnevni limit upita (20) je dosegnut.' };
    return { ok: false, poruka: 'Greška pri dohvatu.' };
  }
}

const Dodaj = z.object({ zahtjevId: z.uuid(), lon: z.number(), lat: z.number(), naziv: z.string().max(200) });

/** Jedna čestica po pozivu (CPU limit workera): granica iz ARKOD WMS-a → baza (preskače duplikate). */
export async function adminDodajArkod(ulaz: unknown): Promise<{ ok: true; dodano: boolean } | { ok: false; poruka: string }> {
  const p = Dodaj.safeParse(ulaz);
  if (!p.success) return { ok: false, poruka: 'Podaci nisu ispravni.' };
  try {
    const c = await arkodUTocki(p.data.lon, p.data.lat);
    if (!c) return { ok: false, poruka: 'ARKOD čestica nije pronađena na toj točki.' };
    const dodano = await getDb().arkod.adminDodaj(p.data.zahtjevId, { arkodId: c.arkodId, naziv: p.data.naziv || c.naziv || `ARKOD ${c.arkodId}`, landUseId: c.landUseId, atributi: { ...c.atributi }, geom: c.geom });
    return { ok: true, dodano };
  } catch (err) {
    if (err instanceof DbError && err.code === '42501') return { ok: false, poruka: 'Samo admin.' };
    if (err instanceof DbError && err.code === 'P0001') return { ok: false, poruka: 'Zahtjev je već riješen.' };
    console.error('[admin] dodaj arkod', err);
    return { ok: false, poruka: 'Dodavanje nije uspjelo.' };
  }
}

export async function adminZavrsiZahtjev(zahtjevId: unknown): Promise<{ ok: boolean }> {
  const p = z.uuid().safeParse(zahtjevId);
  if (!p.success) return { ok: false };
  await getDb().arkod.adminGotovo(p.data);
  revalidatePath('/admin');
  return { ok: true };
}
