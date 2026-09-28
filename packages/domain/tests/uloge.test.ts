import { describe, expect, it } from 'vitest';
import { imaOvlast } from '../src/uloge';
import { LozinkaSchema, RegistracijaSchema } from '../src/auth';

describe('uloge (usklađeno s public.uloga_clanstva)', () => {
  it.each([
    ['citanje', 'citanje', true],
    ['citanje', 'clan', false],
    ['clan', 'citanje', true],
    ['clan', 'vlasnik', false],
    ['vlasnik', 'clan', true],
  ] as const)('%s >= %s → %s', (u, min, ok) => expect(imaOvlast(u, min)).toBe(ok));

  it('bez članstva nema ovlasti', () => expect(imaOvlast(null, 'citanje')).toBe(false));
});

describe('lozinka (03_SIGURNOST.md)', () => {
  it.each(['kratka1', 'samoslova', '12345678'])('odbija %s', (p) => expect(LozinkaSchema.safeParse(p).success).toBe(false));
  it('prihvaća žito2026', () => expect(LozinkaSchema.safeParse('žito2026').success).toBe(true));
  it('normalizira email', () => {
    const r = RegistracijaSchema.parse({ email: '  Ivan@Example.HR ', lozinka: 'psenica99' });
    expect(r.email).toBe('ivan@example.hr');
  });
});
