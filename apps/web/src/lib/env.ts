import { z } from 'zod';

/**
 * Jedino mjesto koje čita process.env. Fail loud (lekcija #14): ako konfiguracija
 * nedostaje, app pada odmah s jasnom porukom, ne negdje duboko u runtimeu.
 *
 * NEXT_PUBLIC_* se ugrađuju u build — moraju se referencirati doslovno da ih Next zamijeni.
 */
const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_FEATURE_AI: z.enum(['true', 'false']).default('false'),
  NEXT_PUBLIC_FEATURE_VRA7: z.enum(['true', 'false']).default('false'),
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

let cached: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = PublicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_FEATURE_AI: process.env.NEXT_PUBLIC_FEATURE_AI,
    NEXT_PUBLIC_FEATURE_VRA7: process.env.NEXT_PUBLIC_FEATURE_VRA7,
  });
  if (!parsed.success) {
    const polja = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Neispravna konfiguracija okruženja: ${polja}. Vidi apps/web/.env.example`);
  }
  cached = parsed.data;
  return cached;
}
