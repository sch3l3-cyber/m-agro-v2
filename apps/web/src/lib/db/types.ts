import type { NovaOperacija, RawMultiPolygon, TipOperacije, Uloga, UvozCesticaDto, UvozMod } from '@m-agro/domain';

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
  /** Naziv/kultura. RLS: član+. 0 izmijenjenih redaka → DbError 'not_found'. */
  update(id: string, patch: { naziv: string; kultura: string | null }): Promise<void>;
  /** Čestice gospodarstva koje se preklapaju s geometrijom; udio = presjek / manja površina (0–1). */
  preklapanje(gospodarstvoId: string, geom: RawMultiPolygon): Promise<{ id: string; naziv: string; arkodId: string | null; udio: number }[]>;
  /** Točka sigurno unutar čestice (null = nema pristupa). */
  tocka(id: string): Promise<{ lon: number; lat: number } | null>;
  /** Dopuna ARKOD podataka (bez promjene geometrije — čuva NDVI povijest). RLS: član+. 23505 = ARKOD već na drugoj čestici. */
  poveziArkod(id: string, p: { arkodId: string; landUseId: number | null; atributi: Record<string, unknown> }): Promise<void>;
  /** Ista kultura (ili null = bez kulture) na više čestica. RLS: član+. Vraća broj izmijenjenih. */
  postaviKulturuVise(ids: string[], kultura: string | null): Promise<number>;
  /** Samo kultura (npr. nakon upisa sjetve). RLS: član+. */
  postaviKulturu(id: string, kultura: string): Promise<void>;
  /** RLS: samo vlasnik. Kaskadno briše operacije; audit trigger bilježi brisanje. */
  remove(id: string): Promise<void>;
  /** Čiste NDVI snimke od datuma za sve čestice gospodarstva (za semafor). Ključ = id čestice. */
  ndviNedavno(gospodarstvoId: string, odDatum: string): Promise<Record<string, { datum: string; mean: number }[]>>;
  /** Čestica + NDVI povijest iz dijeljenog cachea. null = nema pristupa. */
  kontekst(id: string, brojSnimki: number): Promise<KontekstCestice | null>;
}

export interface Operacija {
  id: string;
  cesticaId: string;
  tip: TipOperacije;
  datum: string;
  kultura: string | null;
  sorta: string | null;
  fert: string | null;
  product: string | null;
  amount: number | null;
  unit: string | null;
  vlaga: number | null;
  hektolitarska: number | null;
  dubina: number | null;
  note: string | null;
  createdAt: string;
}

export interface OperacijaSCesticom extends Operacija {
  cesticaNaziv: string;
  cesticaHa: number;
}

export interface OperacijeRepo {
  /** Sve operacije gospodarstva u rasponu datuma (uključivo), najnovije prve. RLS: čitanje+. */
  listByGospodarstvo(gospodarstvoId: string, od: string, doDatum: string): Promise<OperacijaSCesticom[]>;
  /** Najnovije prve. RLS: čitanje+. */
  listByCestica(cesticaId: string): Promise<Operacija[]>;
  /** RLS: član+. Isti localId na istoj čestici = ista operacija (idempotentno, bez duplikata). */
  create(cesticaId: string, o: NovaOperacija): Promise<{ id: string }>;
  /** RLS: član+. 0 obrisanih → DbError 'not_found'. */
  remove(id: string): Promise<void>;
}

export interface NdviTocka {
  datum: string;
  mean: number;
  p10: number | null;
  p90: number | null;
  oblacnoPct: number | null;
}

export interface KontekstCestice {
  cestica: Cestica;
  /** Zadnje čiste snimke (status ok), najstarije prve. */
  ndvi: NdviTocka[];
}

export interface ArkodSazetak {
  arkodId: string;
  lon: number;
  lat: number;
  ha: number | null;
  landUseId: number | null;
  naziv: string | null;
}

export interface ArkodRepo {
  /** Sve čestice istog nositelja kao zadana ARKOD čestica (ADR-0011). Najviše 5 upita dnevno (P0001). */
  gospodarstvo(arkodId: string): Promise<ArkodSazetak[]>;
  /** ARKOD id-evi koje gospodarstvo već ima. */
  postojeci(gospodarstvoId: string): Promise<Set<string>>;
}

export type NacinRada = 'jednostavni' | 'napredni';

export interface ProfilRepo {
  nacin(userId: string): Promise<NacinRada>;
  postaviNacin(userId: string, nacin: NacinRada): Promise<void>;
}

export type AiRezervacija = 'ok' | 'sat' | 'mjesec';

export interface AiRepo {
  /** Provjera limita (po satu, mjesečni budžet) i upis poziva. */
  rezerviraj(limitUsd: number, poSatu: number): Promise<AiRezervacija>;
  /** Stvarni trošak zadnje rezervacije (≤ 0,10 USD). */
  evidentiraj(usd: number): Promise<void>;
}

export interface AdminPregled {
  kvota: { mjesec: string; potroseno: number; limit: number; povijest: { mjesec: string; jedinice: number }[] };
  brojke: {
    korisnika: number;
    korisnika_7d: number;
    mfa_ukljuceno: number;
    gospodarstava: number;
    cestica: number;
    hektara: number;
    operacija: number;
    operacija_30d: number;
    ndvi_cache: number;
  };
  audit: { created_at: string; actor_email: string | null; action: string; target_type: string | null; target_id: string | null }[];
}

export interface DbClient {
  /** null = korisnik nije admin (ili je admin s MFA-om bez koda) */
  adminPregled(limitKvote: number): Promise<AdminPregled | null>;
  /** Trajno briše račun prijavljenog korisnika i gospodarstva koja vodi sam. Baca DbError s porukom za korisnika. */
  obrisiMojRacun(): Promise<void>;
  gospodarstva: GospodarstvaRepo;
  cestice: CesticeRepo;
  operacije: OperacijeRepo;
  ai: AiRepo;
  profil: ProfilRepo;
  arkod: ArkodRepo;
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
