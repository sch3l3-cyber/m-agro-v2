import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { publicEnv } from '../env';
import type { Database } from '../db/database.types';

/**
 * Osvježava Supabase sesiju na svakom requestu (refresh token rotation) i vraća
 * korisnika. Poziva ga src/proxy.ts. Supabase logika ostaje u lib/ (ADR-0003).
 */
export async function refreshSession(request: NextRequest): Promise<{ response: NextResponse; userId: string | null }> {
  const env = publicEnv();
  let response = NextResponse.next({ request });

  const sb = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // VAŽNO: getUser() odmah nakon createServerClient, bez koda između (Supabase SSR upute)
  const { data } = await sb.auth.getUser();
  return { response, userId: data.user?.id ?? null };
}
