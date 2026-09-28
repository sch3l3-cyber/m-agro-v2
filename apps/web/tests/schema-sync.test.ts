import { describe, expect, it } from 'vitest';
import { TIPOVI_OPERACIJA, ULOGE } from '@m-agro/domain';
import { Constants } from '../src/lib/db/database.types';

// Domain enumi i Postgres enumi moraju biti identični (i po redoslijedu — određuje razinu ovlasti)
describe('domain ↔ baza', () => {
  it('uloge', () => expect([...ULOGE]).toEqual([...Constants.public.Enums.uloga_clanstva]));
  it('tipovi operacija', () => expect([...TIPOVI_OPERACIJA]).toEqual([...Constants.public.Enums.tip_operacije]));
});
