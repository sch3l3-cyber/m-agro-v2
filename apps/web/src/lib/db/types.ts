import type { Uloga } from '@m-agro/domain';

/**
 * DbClient (01_ARHITEKTURA_v2.md). Feature kod vidi SAMO ovo sučelje.
 * Repozitoriji rastu po fazama; u Fazi 0 samo ono što treba dashboardu.
 *
 * Lekcija #2 je ugrađena u oblik API-ja: ne postoji "findOrCreate po vlasniku".
 * create() uvijek radi INSERT, update() uvijek traži id.
 */
export interface GospodarstvoSazetak {
  id: string;
  naziv: string;
  mibpg: string | null;
  uloga: Uloga;
}

export interface NovoGospodarstvo {
  naziv: string;
  mibpg?: string | undefined;
}

export interface GospodarstvaRepo {
  /** Sva gospodarstva na kojima je trenutni korisnik član (RLS filtrira). */
  listMine(userId: string): Promise<GospodarstvoSazetak[]>;
  create(input: NovoGospodarstvo): Promise<{ id: string }>;
  update(id: string, patch: Partial<NovoGospodarstvo>): Promise<void>;
}

export interface DbClient {
  gospodarstva: GospodarstvaRepo;
  /** Za /api/health — jeftin upit koji dokazuje da je baza dostupna. */
  ping(): Promise<boolean>;
}

export class DbError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
    this.name = 'DbError';
  }
}
