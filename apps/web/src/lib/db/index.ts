import 'server-only';
import type { DbClient } from './types';
import { supabaseDb } from './supabase';

export type { DbClient, GospodarstvoSazetak, NovoGospodarstvo } from './types';
export { DbError } from './types';

/** Jedina točka ulaza za bazu u feature kodu. Migracija (Drizzle/pg) = novi fajl ovdje. */
export function getDb(): DbClient {
  return supabaseDb;
}
