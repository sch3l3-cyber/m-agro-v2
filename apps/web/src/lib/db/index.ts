import 'server-only';
import type { DbClient } from './types';
import { supabaseDb } from './supabase';

export type { AdminPregled, Cestica, DbClient, NacinRada, ZahtjevUvoza, GospodarstvoSazetak, NovoGospodarstvo, Operacija, OperacijaSCesticom, UvozIshod } from './types';
export { DbError } from './types';

/** Jedina točka ulaza za bazu u feature kodu. Migracija (Drizzle/pg) = novi fajl ovdje. */
export function getDb(): DbClient {
  return supabaseDb;
}
