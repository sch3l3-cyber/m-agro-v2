/**
 * Red operacija upisanih bez signala — čista logika (testira se bez browsera).
 * Spremište i slanje se ubrizgavaju: u aplikaciji IndexedDB + server action, u testu memorija.
 */
export interface StavkaReda {
  localId: string;
  cesticaId: string;
  gospodarstvoId: string;
  /** sirovi podaci obrasca — server ih ponovo validira (NovaOperacijaSchema) */
  operacija: Record<string, unknown> & { tip: string; datum: string; localId: string };
  dodano: string;
  pokusaja: number;
  /** trajna greška (npr. validacija, nema prava) — korisnik je vidi i može obrisati stavku */
  greska?: string;
}

export interface Spremiste {
  sve(): Promise<StavkaReda[]>;
  spremi(s: StavkaReda): Promise<void>;
  obrisi(localId: string): Promise<void>;
}

/** 'ok' = spremljeno; { greska } = server odbio (neće proći ni ponovo); throw = nema mreže (pokušaj kasnije). */
export type Posalji = (s: StavkaReda) => Promise<'ok' | { greska: string }>;

export interface IshodSinka {
  poslano: number;
  greske: number;
  /** prekinuto jer mreža ne radi — ostatak čeka */
  bezMreze: boolean;
}

/**
 * Šalje redom od najstarije. Stavke s trajnom greškom preskače (ne vrti ih u beskonačnost).
 * Idempotentno: server prepoznaje localId, pa ponovljeno slanje iste stavke ne stvara duplikat.
 */
export async function sinkroniziraj(spremiste: Spremiste, posalji: Posalji): Promise<IshodSinka> {
  const ishod: IshodSinka = { poslano: 0, greske: 0, bezMreze: false };
  const red = (await spremiste.sve()).filter((s) => !s.greska).sort((a, b) => a.dodano.localeCompare(b.dodano));
  for (const s of red) {
    let r: Awaited<ReturnType<Posalji>>;
    try {
      r = await posalji(s);
    } catch {
      await spremiste.spremi({ ...s, pokusaja: s.pokusaja + 1 });
      ishod.bezMreze = true;
      break;
    }
    if (r === 'ok') {
      await spremiste.obrisi(s.localId);
      ishod.poslano++;
    } else {
      await spremiste.spremi({ ...s, pokusaja: s.pokusaja + 1, greska: r.greska });
      ishod.greske++;
    }
  }
  return ishod;
}
