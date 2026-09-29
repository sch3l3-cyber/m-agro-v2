'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { arkodUpitUrl, lpisNaziv, parsirajArkod, UrediCesticuSchema, type ArkodCestica } from '@m-agro/domain';
import { getAuth } from '@/lib/auth';
import { DbError, getDb } from '@/lib/db';

/**
 * ADR-0010: dodir na kartu → javni ARKOD WMS (EPSG:3765) → pregled / dodavanje / povezivanje.
 * Geometriju UVIJEK ponovno dohvaća poslužitelj — klijentu se ne vjeruje. jpaid se nikad ne čita (parsirajArkod).
 */
const Tocka = z.object({ gospodarstvoId: z.uuid(), lon: z.number().min(13).max(20), lat: z.number().min(42).max(47) });

const PRAG_ISTA = 0.5; // > 50 % preklapanja = ista čestica

async function dohvati(lon: number, lat: number): Promise<ArkodCestica | null> {
  const r = await fetch(arkodUpitUrl(lon, lat), { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`ARKOD ${r.status}`);
  return parsirajArkod(await r.json());
}

export type ArkodPregled =
  | { ok: true; nema: true }
  | {
      ok: true;
      nema: false;
      arkodId: string;
      naziv: string | null;
      vrstaUporabe: string | null;
      povrsinaHa: number | null;
      geom: GeoJSON.MultiPolygon;
      /** vlastita čestica koja se preklapa (> 50 %) — tada se nudi „Poveži”, ne „Dodaj” */
      postojeca: { id: string; naziv: string; imaArkod: boolean } | null;
      zone: string[];
    }
  | { ok: false; poruka: string };

function opisZona(a: ArkodCestica['atributi']): string[] {
  const z: string[] = [];
  if (a.vodozastita) z.push(`Zona zaštite voda ${a.vodozastita}`);
  if (a.natura2000) z.push('Natura 2000');
  if (a.nagib !== null && a.nagib >= 8) z.push(`Nagib ${a.nagib.toFixed(0)} %`);
  return z;
}

async function prijavljen() {
  return (await getAuth().getUser()) !== null;
}

export async function arkodNaTocki(ulaz: unknown): Promise<ArkodPregled> {
  const p = Tocka.safeParse(ulaz);
  if (!p.success) return { ok: false, poruka: 'Točka je izvan Hrvatske.' };
  if (!(await prijavljen())) return { ok: false, poruka: 'Potrebna je prijava.' };
  let c: ArkodCestica | null;
  try {
    c = await dohvati(p.data.lon, p.data.lat);
  } catch (err) {
    console.error('[arkod] dohvat', err);
    return { ok: false, poruka: 'ARKOD servis trenutno ne odgovara. Pokušaj za minutu ili nacrtaj česticu ručno.' };
  }
  if (!c) return { ok: true, nema: true };
  const prekl = await getDb().cestice.preklapanje(p.data.gospodarstvoId, c.geom);
  const ista = prekl.find((x) => x.udio > PRAG_ISTA);
  return {
    ok: true,
    nema: false,
    arkodId: c.arkodId,
    naziv: c.naziv,
    vrstaUporabe: lpisNaziv(c.landUseId),
    povrsinaHa: c.povrsinaHa,
    geom: c.geom as GeoJSON.MultiPolygon,
    postojeca: ista ? { id: ista.id, naziv: ista.naziv, imaArkod: ista.arkodId !== null } : null,
    zone: opisZona(c.atributi),
  };
}

const DodajUlaz = Tocka.extend({ naziv: UrediCesticuSchema.shape.naziv, kultura: UrediCesticuSchema.shape.kultura });

export async function dodajArkodCesticu(ulaz: unknown): Promise<{ ok: true; naziv: string } | { ok: false; poruka: string }> {
  const p = DodajUlaz.safeParse(ulaz);
  if (!p.success) return { ok: false, poruka: p.error.issues[0]?.message ?? 'Podaci nisu ispravni.' };
  if (!(await prijavljen())) return { ok: false, poruka: 'Potrebna je prijava.' };
  const { gospodarstvoId, lon, lat, naziv, kultura } = p.data;
  let c: ArkodCestica | null;
  try {
    c = await dohvati(lon, lat);
  } catch {
    return { ok: false, poruka: 'ARKOD servis trenutno ne odgovara. Pokušaj ponovo.' };
  }
  if (!c) return { ok: false, poruka: 'Na tom mjestu više nema ARKOD čestice.' };
  const db = getDb();
  if ((await db.cestice.preklapanje(gospodarstvoId, c.geom)).some((x) => x.udio > PRAG_ISTA)) return { ok: false, poruka: 'Već imaš ovu česticu.' };
  try {
    const ishod = await db.cestice.uvezi(gospodarstvoId, [{ naziv, arkodId: c.arkodId, landUseId: c.landUseId, kultura, geom: c.geom }], 'dodaj');
    if (ishod.dodano === 0) return { ok: false, poruka: 'Već imaš ovu ARKOD česticu.' };
    // atributi (zone, nagib) — nije kritično ako ne uspije
    const nova = (await db.cestice.preklapanje(gospodarstvoId, c.geom)).find((x) => x.arkodId === c.arkodId);
    if (nova) await db.cestice.poveziArkod(nova.id, { arkodId: c.arkodId, landUseId: c.landUseId, atributi: { ...c.atributi } }).catch(() => undefined);
    revalidatePath(`/gospodarstvo/${gospodarstvoId}`);
    return { ok: true, naziv };
  } catch (err) {
    console.error('[arkod] dodaj', err);
    if (err instanceof DbError && err.code === '42501') return { ok: false, poruka: 'Nemaš pravo dodavati čestice u ovo gospodarstvo.' };
    return { ok: false, poruka: 'Dodavanje nije uspjelo. Pokušaj ponovo.' };
  }
}

const PoveziUlaz = z.object({ gospodarstvoId: z.uuid(), cesticaId: z.uuid(), lon: z.number().optional(), lat: z.number().optional() });

/** Dopuni postojeću česticu ARKOD id-om, vrstom uporabe i zonama. Geometrija se NE mijenja (čuva NDVI povijest). */
export async function poveziSArkodom(ulaz: unknown): Promise<{ ok: true; arkodId: string } | { ok: false; poruka: string; nema?: boolean }> {
  const p = PoveziUlaz.safeParse(ulaz);
  if (!p.success) return { ok: false, poruka: 'Podaci nisu ispravni.' };
  if (!(await prijavljen())) return { ok: false, poruka: 'Potrebna je prijava.' };
  const db = getDb();
  const t = p.data.lon !== undefined && p.data.lat !== undefined ? { lon: p.data.lon, lat: p.data.lat } : await db.cestice.tocka(p.data.cesticaId);
  if (!t) return { ok: false, poruka: 'Čestica ne postoji ili nemaš pristup.' };
  let c: ArkodCestica | null;
  try {
    c = await dohvati(t.lon, t.lat);
  } catch {
    return { ok: false, poruka: 'ARKOD servis trenutno ne odgovara.' };
  }
  if (!c) return { ok: false, poruka: 'Na mjestu čestice nema ARKOD čestice.', nema: true };
  const prekl = await db.cestice.preklapanje(p.data.gospodarstvoId, c.geom);
  if (!prekl.some((x) => x.id === p.data.cesticaId && x.udio > PRAG_ISTA)) return { ok: false, poruka: 'ARKOD čestica se premalo poklapa s tvojom — provjeri granice.', nema: true };
  try {
    await db.cestice.poveziArkod(p.data.cesticaId, { arkodId: c.arkodId, landUseId: c.landUseId, atributi: { ...c.atributi } });
    revalidatePath(`/gospodarstvo/${p.data.gospodarstvoId}`);
    return { ok: true, arkodId: c.arkodId };
  } catch (err) {
    if (err instanceof DbError && err.code === '23505') return { ok: false, poruka: 'Ta ARKOD čestica je već povezana s drugom tvojom česticom.' };
    if (err instanceof DbError && (err.code === '42501' || err.code === 'not_found')) return { ok: false, poruka: 'Nemaš pravo mijenjati ovu česticu.' };
    console.error('[arkod] poveži', err);
    return { ok: false, poruka: 'Povezivanje nije uspjelo.' };
  }
}
