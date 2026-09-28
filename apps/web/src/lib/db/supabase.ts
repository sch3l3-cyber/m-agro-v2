import 'server-only';
import { UlogaSchema } from '@m-agro/domain';
import { z } from 'zod';
import { supabaseForRequest } from '../auth/supabase-server';
import { DbError, type Cestica, type DbClient, type UvozIshod } from './types';
import type { Json } from './database.types';

const GeomSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))),
});
const IshodSchema = z.object({ dodano: z.number(), azurirano: z.number(), preskoceno: z.number(), obrisano: z.number() });

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

    async get(id, userId) {
      const sb = await supabaseForRequest();
      const { data, error } = await sb
        .from('gospodarstva')
        .select('id, naziv, mibpg, memberships ( uloga, user_id )')
        .eq('id', id)
        .eq('memberships.user_id', userId)
        .maybeSingle();
      if (error) {
        // neispravan UUID u URL-u → tretiramo kao "ne postoji"
        if (error.code === '22P02') return null;
        fail('gospodarstva.get', error);
      }
      if (!data) return null;
      const m = data.memberships[0];
      // admin vidi gospodarstvo bez članstva — prikazujemo ga kao "citanje" (UI ne nudi izmjene)
      return { id: data.id, naziv: data.naziv, mibpg: data.mibpg, uloga: m ? UlogaSchema.parse(m.uloga) : 'citanje' };
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

  cestice: {
    async listByGospodarstvo(gospodarstvoId) {
      const sb = await supabaseForRequest();
      const { data, error } = await sb
        .from('cestice')
        .select('id, naziv, arkod_id, kultura, land_use_id, povrsina_ha, geom_arkod')
        .eq('gospodarstvo_id', gospodarstvoId)
        .order('naziv');
      if (error) fail('cestice.listByGospodarstvo', error);
      return data.map(
        (c): Cestica => ({
          id: c.id,
          naziv: c.naziv,
          arkodId: c.arkod_id,
          kultura: c.kultura,
          landUseId: c.land_use_id,
          povrsinaHa: Number(c.povrsina_ha ?? 0),
          // PostgREST serijalizira PostGIS geometry kao GeoJSON (geometry::json, PostGIS 3+)
          geom: GeomSchema.parse(c.geom_arkod),
        }),
      );
    },

    async uvezi(gospodarstvoId, cestice, mod) {
      const sb = await supabaseForRequest();
      const { data, error } = await sb.rpc('uvezi_cestice', {
        p_gospodarstvo: gospodarstvoId,
        p_cestice: cestice as unknown as Json,
        p_mod: mod,
      });
      if (error) fail('cestice.uvezi', error);
      return IshodSchema.parse(data) satisfies UvozIshod;
    },

    async update(id, patch) {
      const sb = await supabaseForRequest();
      const { error, count } = await sb.from('cestice').update({ naziv: patch.naziv, kultura: patch.kultura }, { count: 'exact' }).eq('id', id);
      if (error) fail('cestice.update', error);
      // RLS tiho filtrira na 0 redaka (npr. uloga "citanje") — ne smije izgledati kao uspjeh
      if (count === 0) throw new DbError('cestice.update: nema pristupa ili zapis ne postoji', 'not_found');
    },

    async remove(id) {
      const sb = await supabaseForRequest();
      const { error, count } = await sb.from('cestice').delete({ count: 'exact' }).eq('id', id);
      if (error) fail('cestice.remove', error);
      if (count === 0) throw new DbError('cestice.remove: nema pristupa ili zapis ne postoji', 'not_found');
    },
  },

  async ping() {
    const sb = await supabaseForRequest();
    // GET (ne HEAD — HEAD odgovor nema tijelo pa se kod greške ne može pročitati).
    // Anon nema grant: 42501 "permission denied" dokazuje da je PostgREST + baza gore.
    const { error } = await sb.from('gospodarstva').select('id').limit(1);
    return !error || error.code === '42501';
  },
};
