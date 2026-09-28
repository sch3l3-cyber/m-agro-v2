import { z } from 'zod';

/** Mora odgovarati enum-u public.uloga_clanstva (redoslijed = razina ovlasti). */
export const ULOGE = ['citanje', 'clan', 'vlasnik'] as const;
export const UlogaSchema = z.enum(ULOGE);
export type Uloga = z.infer<typeof UlogaSchema>;

export function imaOvlast(uloga: Uloga | null | undefined, minimalno: Uloga): boolean {
  if (!uloga) return false;
  return ULOGE.indexOf(uloga) >= ULOGE.indexOf(minimalno);
}

/** Mora odgovarati enum-u public.tip_operacije. */
export const TIPOVI_OPERACIJA = ['sjetva', 'prihrana', 'zastita', 'zetva', 'obrada', 'ostalo'] as const;
export const TipOperacijeSchema = z.enum(TIPOVI_OPERACIJA);
export type TipOperacije = z.infer<typeof TipOperacijeSchema>;
