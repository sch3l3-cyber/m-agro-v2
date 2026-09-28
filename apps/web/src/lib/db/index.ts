import 'server-only';
import type { DbClient } from './types';
import { supabaseDb } from './supabase';

export type { Cestica, DbClient, GospodarstvoSazetak, NovoGospodarstvo, UvozIshod } from './types';
export { DbError } from './types';

/** Jedina točka ulaza za bazu u feature kodu. Migracija (Drizzle/pg) = novi fajl ovdje. */
export function getDb(): DbClient {
  return supabaseDb;
}
