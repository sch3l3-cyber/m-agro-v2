import { z } from 'zod';

/** Najčešće kulture u Slavoniji — prijedlozi u polju (slobodan unos i dalje dopušten). */
export const KULTURE = [
  'Pšenica',
  'Kukuruz',
  'Soja',
  'Suncokret',
  'Uljana repica',
  'Ječam',
  'Zob',
  'Tritikale',
  'Šećerna repa',
  'Lucerna',
  'Djetelina',
  'Travno-djetelinska smjesa',
  'Duhan',
  'Povrće',
  'Voćnjak',
  'Vinograd',
  'Ugar',
] as const;

const tekst = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max));

/** Izmjena čestice s klijenta. Geometrija i površina se NE mijenjaju ovdje (površinu računa baza). */
export const UrediCesticuSchema = z.object({
  naziv: tekst(200).pipe(z.string().min(1, 'Naziv je obavezan')),
  // prazno polje = bez kulture
  kultura: tekst(120).transform((s) => (s === '' ? null : s)),
});
export type UrediCesticu = z.output<typeof UrediCesticuSchema>;
