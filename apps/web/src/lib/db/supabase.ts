import 'server-only';
import { UlogaSchema } from '@m-agro/domain';
import { supabaseForRequest } from '../auth/supabase-server';
import { DbError, type DbClient } from './types';

function fail(ctx: string, err: { message: string; code?: string }): never {
  // Fail loud (lekcija #14): nikad tihi prazan rezultat kad upit pukne
  throw new DbError(`${ctx}: ${err.message}`, err.code);
}

export const supabaseDb: DbClient = {
  gospodarstva: {
    async listMine(userId) {
      const sb = await supabaseForRequest();
      const { data, error } = await sb
        .from('memberships')
        .select('uloga, gospodarstva ( id, naziv, mibpg )')
        .eq('user_id', userId)
        .order('created_at');
      if (error) fail('gospodarstva.listMine', error);
      return data.flatMap((m) =>
        m.gospodarstva
          ? [{ id: m.gospodarstva.id, naziv: m.gospodarstva.naziv, mibpg: m.gospodarstva.mibpg, uloga: UlogaSchema.parse(m.uloga) }]
          : [],
      );
    },

    async create(input) {
      const sb = await supabaseForRequest();
      const { data, error } = await sb
        .from('gospodarstva')
        .insert({ naziv: input.naziv, mibpg: input.mibpg ?? null })
        .select('id')
        .single();
      if (error) fail('gospodarstva.create', error);
      return { id: data.id };
    },

    async update(id, patch) {
      const sb = await supabaseForRequest();
      const { error, count } = await sb
        .from('gospodarstva')
        .update({ ...(patch.naziv !== undefined && { naziv: patch.naziv }), ...(patch.mibpg !== undefined && { mibpg: patch.mibpg }) }, { count: 'exact' })
        .eq('id', id);
      if (error) fail('gospodarstva.update', error);
      if (count === 0) throw new DbError('gospodarstva.update: nema pristupa ili zapis ne postoji', 'not_found');
    },
  },

  async ping() {
    const sb = await supabaseForRequest();
    // HEAD upit — ne vraća redove; anon nema grant pa 401/42501 također znači "baza je gore"
    const { error } = await sb.from('gospodarstva').select('id', { head: true, count: 'planned' }).limit(1);
    return !error || error.code === '42501';
  },
};
