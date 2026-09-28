import { z } from 'zod';
import type { TipOperacije } from './uloge';

export const TIP_LABEL: Record<TipOperacije, string> = {
  sjetva: 'Sjetva',
  prihrana: 'Prihrana',
  zastita: 'Zaštita',
  zetva: 'Žetva',
  obrada: 'Obrada',
  ostalo: 'Ostalo',
};

/** Dopuštene jedinice količine po vrsti (prva = zadana). */
export const JEDINICE: Record<TipOperacije, readonly string[]> = {
  sjetva: ['kg/ha', 'zrna/ha', 'sj/m²'],
  prihrana: ['kg/ha', 'l/ha'],
  zastita: ['l/ha', 'kg/ha', 'ml/ha', 'g/ha'],
  zetva: ['t/ha'],
  obrada: [],
  ostalo: [],
};

/** Prijedlozi u poljima (slobodan unos i dalje dopušten). */
export const GNOJIVA = ['KAN', 'UREA', 'AN', 'UAN', 'MAP', 'DAP', 'NPK 7-20-30', 'NPK 15-15-15', 'NPK 8-26-26', 'Stajski gnoj'] as const;
export const OBRADE = ['Oranje', 'Podrivanje', 'Tanjuranje', 'Sjetvospremač', 'Kultiviranje', 'Malčiranje', 'Valjanje', 'Međuredna kultivacija'] as const;

const tekst = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max))
    .transform((s) => (s === '' ? null : s));

const obavezno = (max: number, poruka: string) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1, poruka).max(max));

// Brojevi iz forme dolaze kao tekst s decimalnim zarezom ("12,5") ili prazno
const broj = (min: number, max: number, naziv: string) =>
  z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      if (typeof v === 'number') return v;
      const s = v.trim().replace(',', '.');
      if (s === '') return null;
      const n = Number(s);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: 'custom', message: `${naziv}: upiši broj` });
        return z.NEVER;
      }
      return n;
    })
    .pipe(z.number().min(min, `${naziv}: najmanje ${min}`).max(max, `${naziv}: najviše ${max}`).nullable());

const danas = () => new Date().toISOString().slice(0, 10);
const Datum = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Neispravan datum')
  .refine((d) => d >= '2000-01-01', 'Datum je prestar')
  // dopušteno do godinu dana unaprijed (planiranje), ne dalje
  .refine((d) => d <= new Date(Date.now() + 366 * 86_400_000).toISOString().slice(0, 10), 'Datum je predaleko u budućnosti');

const zajednicko = {
  datum: Datum,
  note: tekst(2000),
  // idempotentnost (dvostruki klik, kasnije offline sync)
  localId: z.string().min(8).max(100),
};

const kolicina = { amount: broj(0, 100_000, 'Količina'), unit: tekst(20) };

/**
 * Operacija s klijenta, po vrsti. Mapira se na kolone tablice `operacije`:
 * obrada koristi `product` za vrstu obrade (oranje, tanjuranje…), žetva `amount` za prinos (t/ha).
 */
export const NovaOperacijaSchema = z.discriminatedUnion('tip', [
  z.object({ tip: z.literal('sjetva'), ...zajednicko, kultura: obavezno(120, 'Upiši kulturu'), sorta: tekst(120), ...kolicina, dubina: broj(0, 200, 'Dubina') }),
  z.object({ tip: z.literal('prihrana'), ...zajednicko, fert: obavezno(120, 'Upiši gnojivo'), ...kolicina }),
  z.object({ tip: z.literal('zastita'), ...zajednicko, product: obavezno(200, 'Upiši sredstvo'), ...kolicina }),
  z.object({
    tip: z.literal('zetva'),
    ...zajednicko,
    kultura: tekst(120),
    amount: broj(0, 100_000, 'Prinos'),
    unit: tekst(20),
    vlaga: broj(0, 100, 'Vlaga'),
    hektolitarska: broj(0, 150, 'Hektolitarska'),
  }),
  z.object({ tip: z.literal('obrada'), ...zajednicko, product: obavezno(200, 'Odaberi vrstu obrade'), dubina: broj(0, 200, 'Dubina') }),
  z.object({ tip: z.literal('ostalo'), ...zajednicko, note: obavezno(2000, 'Opiši što je rađeno') }),
]);
export type NovaOperacija = z.output<typeof NovaOperacijaSchema>;

/** Kratak opis za listu, npr. "KAN 200 kg/ha" ili "Pšenica · Kraljica · 250 kg/ha". */
export function opisOperacije(o: {
  tip: TipOperacije;
  kultura?: string | null;
  sorta?: string | null;
  fert?: string | null;
  product?: string | null;
  amount?: number | null;
  unit?: string | null;
  vlaga?: number | null;
  dubina?: number | null;
  note?: string | null;
}): string {
  const kol = o.amount != null ? `${String(o.amount).replace('.', ',')}${o.unit ? ` ${o.unit}` : ''}` : null;
  const dijelovi: (string | null | undefined)[] =
    o.tip === 'sjetva'
      ? [o.kultura, o.sorta, kol]
      : o.tip === 'prihrana'
        ? [o.fert, kol]
        : o.tip === 'zastita'
          ? [o.product, kol]
          : o.tip === 'zetva'
            ? [o.kultura, kol, o.vlaga != null ? `vlaga ${String(o.vlaga).replace('.', ',')} %` : null]
            : o.tip === 'obrada'
              ? [o.product, o.dubina != null ? `${String(o.dubina).replace('.', ',')} cm` : null]
              : [o.note];
  return dijelovi.filter(Boolean).join(' · ');
}

export { danas as danasnjiDatum };
