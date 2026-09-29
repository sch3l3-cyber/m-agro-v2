/** AIClient (01_ARHITEKTURA_v2.md). Feature kod vidi samo ovo; zamjena modela/pružatelja = novi fajl u lib/ai. */
export interface Poruka {
  uloga: 'korisnik' | 'asistent';
  tekst: string;
}

export interface ChatOpts {
  sustav: string;
  maxTokena?: number;
  signal?: AbortSignal;
}

export type ChatDio = { vrsta: 'tekst'; tekst: string } | { vrsta: 'kraj'; ulazTokena: number; izlazTokena: number; usd: number };

export interface AIClient {
  readonly model: string;
  stream(poruke: Poruka[], opts: ChatOpts): AsyncIterable<ChatDio>;
}

export class AIGreska extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
