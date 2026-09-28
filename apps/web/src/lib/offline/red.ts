/**
 * Offline red operacija + zadnje učitane liste operacija, u IndexedDB-u (preživi zatvaranje aplikacije).
 * Bez vanjskih biblioteka — mali wrapper (bundle je ograničen, ADR-0001).
 */
import type { Spremiste, StavkaReda } from './sinkronizacija';

const DB = 'm-agro';
const RED = 'red';
const KES = 'operacije';

let dbObecanje: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbObecanje ??= new Promise((ok, greska) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(RED, { keyPath: 'localId' });
      r.result.createObjectStore(KES);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => greska(r.error);
  });
  return dbObecanje;
}

async function tx<T>(store: string, mod: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((ok, greska) => {
    const t = d.transaction(store, mod);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => ok(req.result);
    t.onerror = () => greska(t.error);
  });
}

// ---- pretplata (brojač u zaglavlju, lista na kartici čestice) ----
const slusaci = new Set<() => void>();
let snimka: StavkaReda[] = [];
export function pretplati(cb: () => void): () => void {
  slusaci.add(cb);
  return () => slusaci.delete(cb);
}
export const stanjeReda = () => snimka;
async function obavijesti() {
  snimka = await tx(RED, 'readonly', (s) => s.getAll() as IDBRequest<StavkaReda[]>);
  for (const cb of slusaci) cb();
}

export const idbSpremiste: Spremiste = {
  sve: () => tx(RED, 'readonly', (s) => s.getAll() as IDBRequest<StavkaReda[]>),
  spremi: async (st) => {
    await tx(RED, 'readwrite', (s) => s.put(st));
    await obavijesti();
  },
  obrisi: async (id) => {
    await tx(RED, 'readwrite', (s) => s.delete(id));
    await obavijesti();
  },
};

export async function uRed(st: Omit<StavkaReda, 'dodano' | 'pokusaja'>): Promise<void> {
  await idbSpremiste.spremi({ ...st, dodano: new Date().toISOString(), pokusaja: 0 });
}

export async function ucitajRed(): Promise<void> {
  try {
    await obavijesti();
  } catch {
    // privatni prozor / IndexedDB nedostupan — aplikacija radi, samo bez offline reda
  }
}

// ---- zadnja učitana lista po čestici (za prikaz bez signala) ----
export async function spremiListu<T>(cesticaId: string, lista: T[]): Promise<void> {
  try {
    await tx(KES, 'readwrite', (s) => s.put(lista, cesticaId));
  } catch {
    /* nije kritično */
  }
}
export async function ucitajListu<T>(cesticaId: string): Promise<T[] | null> {
  try {
    return ((await tx(KES, 'readonly', (s) => s.get(cesticaId))) as T[] | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Server action bez mreže baca (TypeError: Failed to fetch). Sve ostalo je stvarna greška. */
export function jeGreskaMreze(err: unknown): boolean {
  return !navigator.onLine || err instanceof TypeError;
}
