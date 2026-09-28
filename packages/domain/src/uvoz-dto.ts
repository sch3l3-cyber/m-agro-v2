import { z } from 'zod';

export const MAX_CESTICA_PO_UVOZU = 5000;

/** Sažetak koji se šalje serveru — bez redaka i izračuna (server ih ne vjeruje). */
export const UvozCesticaDtoSchema = z.object({
  naziv: z.string().trim().min(1).max(200),
  arkodId: z.string().trim().max(50).nullable(),
  landUseId: z.number().int().nullable(),
  kultura: z.string().max(120).nullable(),
  geom: z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(z.array(z.number())))) }),
});
export type UvozCesticaDto = z.infer<typeof UvozCesticaDtoSchema>;

export const UVOZ_MODOVI = ['dodaj', 'azuriraj', 'zamijeni'] as const;
export const UvozModSchema = z.enum(UVOZ_MODOVI);
export type UvozMod = z.infer<typeof UvozModSchema>;
