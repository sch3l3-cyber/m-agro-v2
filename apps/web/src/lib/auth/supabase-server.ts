import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '../env';
import type { Database } from '../db/database.types';

/**
 * Supabase klijent vezan uz request (cookie sesija, httpOnly — 03_SIGURNOST.md).
 * Koriste ga SAMO implementacije u lib/auth i lib/db.
 */
export async function supabaseForRequest(): Promise<SupabaseClient<Database>> {
  const env = publicEnv();
  const store = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch (err) {
          // Server Component ne smije postavljati cookie; proxy.ts osvježava sesiju.
          // Ne gutamo tiho (lekcija #14) — ali ovo je očekivan slučaj, pa samo debug log.
          if (process.env.NODE_ENV === 'development') console.debug('[auth] setAll iz RSC-a preskočen', err);
        }
      },
    },
  });
}
