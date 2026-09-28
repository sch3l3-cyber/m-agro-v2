import type { RawMultiPolygon, Uloga, UvozCesticaDto, UvozMod } from '@m-agro/domain';

/**
 * DbClient (01_ARHITEKTURA_v2.md). Feature kod vidi SAMO ovo sučelje.
 *
 * Lekcija #2 je ugrađena u oblik API-ja: ne postoji "findOrCreate po vlasniku".
 * create() uvijek radi INSERT, update() uvijek traži id, uvoz radi unutar JEDNOG gospodarstva.
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
  /** null = ne postoji ILI korisnik nema pristup (RLS ne razlikuje — namjerno). */
  get(id: string, userId: string): Promise<GospodarstvoSazetak | null>;
  create(input: NovoGospodarstvo): Promise<{ id: string }>;
  update(id: string, patch: Partial<NovoGospodarstvo>): Promise<void>;
}

export interface Cestica {
  id: string;
  naziv: string;
  arkodId: string | null;
  kultura: string | null;
  landUseId: number | null;
  povrsinaHa: number;
  /** WGS84 — baza odbija sve ostalo (trigger cestice_validiraj_geom) */
  geom: RawMultiPolygon;
}

export interface UvozIshod {
  dodano: number;
  azurirano: number;
  preskoceno: number;
  obrisano: number;
}

export interface CesticeRepo {
  listByGospodarstvo(gospodarstvoId: string): Promise<Cestica[]>;
  /** Transakcijski uvoz (sve ili ništa). */
  uvezi(gospodarstvoId: string, cestice: UvozCesticaDto[], mod: UvozMod): Promise<UvozIshod>;
}

export interface DbClient {
  gospodarstva: GospodarstvaRepo;
  cestice: CesticeRepo;
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
