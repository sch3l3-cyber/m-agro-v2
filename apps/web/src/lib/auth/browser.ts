'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '../env';
import type { Database } from '../db/database.types';

/**
 * Browser strana autha — koristi se SAMO za dohvat access tokena za pozive prema
 * Sentinel workeru (drugi origin). Sesiju i dalje osvježava middleware na serveru.
 */
let client: SupabaseClient<Database> | null = null;

function sb(): SupabaseClient<Database> {
  if (!client) {
    const env = publicEnv();
    client = createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  }
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await sb().auth.getSession();
  return data.session?.access_token ?? null;
}
