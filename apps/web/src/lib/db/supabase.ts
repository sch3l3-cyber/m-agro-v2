import 'server-only';
import { UlogaSchema } from '@m-agro/domain';
import { z } from 'zod';
import { supabaseForRequest } from '../auth/supabase-server';
import { DbError, type AdminPregled, type Cestica, type DbClient, type Operacija, type OperacijaSCesticom, type UvozIshod } from './types';
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
  async adminPregled(limitKvote) {
    const sb = await supabaseForRequest();
    const { data, error } = await sb.rpc('admin_pregled', { p_limit_kvote: limitKvote });
    if (error?.code === '42501') return null;
    if (error) fail('adminPregled', error);
    return data as unknown as AdminPregled;
  },

  async obrisiMojRacun() {
    const sb = await supabaseForRequest();
    const { error } = await sb.rpc('obrisi_moj_racun');
    if (error) fail('obrisiMojRacun', error);
  },

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

    async preklapanje(gospodarstvoId, geom) {
      const sb = await supabaseForRequest();
      const { data, error } = await sb.rpc('cestice_preklapanje', { p_gospodarstvo: gospodarstvoId, p_geom: geom as unknown as Json });
      if (error) fail('cestice.preklapanje', error);
      return (data ?? []).map((r) => ({ id: r.id, naziv: r.naziv, arkodId: r.arkod_id, udio: Number(r.udio ?? 0) }));
    },

    async tocka(id) {
      const sb = await supabaseForRequest();
      const { data, error } = await sb.rpc('cestica_tocka', { p_cestica: id });
      if (error) fail('cestice.tocka', error);
      const t = data?.[0];
      return t ? { lon: Number(t.lon), lat: Number(t.lat) } : null;
    },

    async poveziArkod(id, p) {
      const sb = await supabaseForRequest();
      const { error, count } = await sb
        .from('cestice')
        .update({ arkod_id: p.arkodId, land_use_id: p.landUseId, arkod_atributi: p.atributi as Json }, { count: 'exact' })
        .eq('id', id);
      if (error) fail('cestice.poveziArkod', error);
      if (count === 0) throw new DbError('cestice.poveziArkod: nema pristupa', 'not_found');
    },

    async postaviKulturuVise(ids, kultura) {
      const sb = await supabaseForRequest();
      let ukupno = 0;
      for (let i = 0; i < ids.length; i += 100) {
        const { error, count } = await sb.from('cestice').update({ kultura }, { count: 'exact' }).in('id', ids.slice(i, i + 100));
        if (error) fail('cestice.postaviKulturuVise', error);
        ukupno += count ?? 0;
      }
      return ukupno;
    },

    async postaviKulturu(id, kultura) {
      const sb = await supabaseForRequest();
      const { error } = await sb.from('cestice').update({ kultura }).eq('id', id);
      if (error) fail('cestice.postaviKulturu', error);
    },

    async remove(id) {
      const sb = await supabaseForRequest();
      const { error, count } = await sb.from('cestice').delete({ count: 'exact' }).eq('id', id);
      if (error) fail('cestice.remove', error);
      if (count === 0) throw new DbError('cestice.remove: nema pristupa ili zapis ne postoji', 'not_found');
    },

    async ndviNedavno(gospodarstvoId, odDatum) {
      const sb = await supabaseForRequest();
      const { data: c, error } = await sb.from('cestice').select('id, geom_hash').eq('gospodarstvo_id', gospodarstvoId);
      if (error) fail('cestice.ndviNedavno', error);
      const poHashu = new Map<string, string[]>();
      for (const r of c) if (r.geom_hash) poHashu.set(r.geom_hash, [...(poHashu.get(r.geom_hash) ?? []), r.id]);
      const ishod: Record<string, { datum: string; mean: number }[]> = {};
      const hashevi = [...poHashu.keys()];
      // u serijama — URL PostgREST upita ima granicu duljine
      for (let i = 0; i < hashevi.length; i += 100) {
        const { data: n, error: e2 } = await sb
          .from('ndvi_cache')
          .select('geom_hash, datum, mean')
          .in('geom_hash', hashevi.slice(i, i + 100))
          .eq('status', 'ok')
          .gte('datum', odDatum)
          .not('mean', 'is', null);
        if (e2) fail('cestice.ndviNedavno.ndvi', e2);
        for (const t of n) for (const id of poHashu.get(t.geom_hash) ?? []) (ishod[id] ??= []).push({ datum: t.datum, mean: Number(t.mean) });
      }
      return ishod;
    },

    async kontekst(id, brojSnimki) {
      const sb = await supabaseForRequest();
      const { data: c, error } = await sb
        .from('cestice')
        .select('id, naziv, arkod_id, kultura, land_use_id, povrsina_ha, geom_arkod, geom_hash')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        if (error.code === '22P02') return null;
        fail('cestice.kontekst', error);
      }
      if (!c) return null;
      const cestica = {
        id: c.id,
        naziv: c.naziv,
        arkodId: c.arkod_id,
        kultura: c.kultura,
        landUseId: c.land_use_id,
        povrsinaHa: Number(c.povrsina_ha ?? 0),
        geom: GeomSchema.parse(c.geom_arkod),
      };
      if (!c.geom_hash) return { cestica, ndvi: [] };
      const { data: n, error: e2 } = await sb
        .from('ndvi_cache')
        .select('datum, mean, percentiles, cloud_pct')
        .eq('geom_hash', c.geom_hash)
        .eq('status', 'ok')
        .not('mean', 'is', null)
        .order('datum', { ascending: false })
        .limit(brojSnimki);
      if (e2) fail('cestice.kontekst.ndvi', e2);
      const pct = (p: unknown, k: string): number | null => {
        const o = p as Record<string, unknown> | null;
        const v = o?.[`${k}.0`] ?? o?.[k]; // Sentinel ključevi su "10.0", "90.0"
        return typeof v === 'number' ? v : null;
      };
      return {
        cestica,
        ndvi: n
          .map((t) => ({ datum: t.datum, mean: Number(t.mean), p10: pct(t.percentiles, '10'), p90: pct(t.percentiles, '90'), oblacnoPct: t.cloud_pct }))
          .reverse(),
      };
    },
  },

  profil: {
    async nacin(userId) {
      const sb = await supabaseForRequest();
      const { data, error } = await sb.from('profiles').select('nacin').eq('id', userId).maybeSingle();
      if (error) fail('profil.nacin', error);
      return data?.nacin === 'jednostavni' ? 'jednostavni' : 'napredni';
    },
    async postaviNacin(userId, nacin) {
      const sb = await supabaseForRequest();
      const { error, count } = await sb.from('profiles').update({ nacin }, { count: 'exact' }).eq('id', userId);
      if (error) fail('profil.postaviNacin', error);
      if (count === 0) throw new DbError('profil.postaviNacin: profil ne postoji', 'not_found');
    },
  },

  ai: {
    async rezerviraj(limitUsd, poSatu) {
      const sb = await supabaseForRequest();
      const { data, error } = await sb.rpc('ai_rezerviraj', { p_limit_usd: limitUsd, p_po_satu: poSatu });
      if (error) fail('ai.rezerviraj', error);
      if (data !== 'ok' && data !== 'sat' && data !== 'mjesec') throw new DbError(`ai.rezerviraj: neočekivano ${String(data)}`, undefined);
      return data;
    },
    async evidentiraj(usd) {
      const sb = await supabaseForRequest();
      const { error } = await sb.rpc('ai_evidentiraj', { p_usd: Math.min(0.1, Math.max(0, Math.round(usd * 10000) / 10000)) });
      if (error) fail('ai.evidentiraj', error);
    },
  },

  operacije: {
    async listByGospodarstvo(gospodarstvoId, od, doDatum) {
      const sb = await supabaseForRequest();
      const { data, error } = await sb
        .from('operacije')
        .select('id, cestica_id, tip, datum, kultura, sorta, fert, product, amount, unit, vlaga, hektolitarska, dubina, note, created_at, cestice!inner(naziv, povrsina_ha, gospodarstvo_id)')
        .eq('cestice.gospodarstvo_id', gospodarstvoId)
        .gte('datum', od)
        .lte('datum', doDatum)
        .order('datum', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) fail('operacije.listByGospodarstvo', error);
      const n = (v: number | null) => (v === null ? null : Number(v));
      return data.map(
        (o): OperacijaSCesticom => ({
          id: o.id,
          cesticaId: o.cestica_id,
          tip: o.tip,
          datum: o.datum,
          kultura: o.kultura,
          sorta: o.sorta,
          fert: o.fert,
          product: o.product,
          amount: n(o.amount),
          unit: o.unit,
          vlaga: n(o.vlaga),
          hektolitarska: n(o.hektolitarska),
          dubina: n(o.dubina),
          note: o.note,
          createdAt: o.created_at,
          cesticaNaziv: o.cestice.naziv,
          cesticaHa: Number(o.cestice.povrsina_ha ?? 0),
        }),
      );
    },

    async listByCestica(cesticaId) {
      const sb = await supabaseForRequest();
      const { data, error } = await sb
        .from('operacije')
        .select('id, cestica_id, tip, datum, kultura, sorta, fert, product, amount, unit, vlaga, hektolitarska, dubina, note, created_at')
        .eq('cestica_id', cesticaId)
        .order('datum', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) fail('operacije.listByCestica', error);
      const n = (v: number | null) => (v === null ? null : Number(v));
      return data.map(
        (o): Operacija => ({
          id: o.id,
          cesticaId: o.cestica_id,
          tip: o.tip,
          datum: o.datum,
          kultura: o.kultura,
          sorta: o.sorta,
          fert: o.fert,
          product: o.product,
          amount: n(o.amount),
          unit: o.unit,
          vlaga: n(o.vlaga),
          hektolitarska: n(o.hektolitarska),
          dubina: n(o.dubina),
          note: o.note,
          createdAt: o.created_at,
        }),
      );
    },

    async create(cesticaId, o) {
      const sb = await supabaseForRequest();
      // eksplicitno po vrsti — polja druge vrste ne mogu "procuriti" u red
      const red = {
        cestica_id: cesticaId,
        tip: o.tip,
        datum: o.datum,
        note: o.note,
        local_id: o.localId,
        ...(o.tip === 'sjetva' && { kultura: o.kultura, sorta: o.sorta, amount: o.amount, unit: o.unit, dubina: o.dubina }),
        ...(o.tip === 'prihrana' && { fert: o.fert, amount: o.amount, unit: o.unit }),
        ...(o.tip === 'zastita' && { product: o.product, amount: o.amount, unit: o.unit }),
        ...(o.tip === 'zetva' && { kultura: o.kultura, amount: o.amount, unit: o.unit, vlaga: o.vlaga, hektolitarska: o.hektolitarska }),
        ...(o.tip === 'obrada' && { product: o.product, dubina: o.dubina }),
      };
      const { data, error } = await sb.from('operacije').insert(red).select('id').single();
      if (error?.code === '23505') {
        // isti localId već spremljen (dvostruki klik / ponovljeni sync) → vrati postojeći
        const { data: postojeci, error: e2 } = await sb.from('operacije').select('id').eq('cestica_id', cesticaId).eq('local_id', o.localId).single();
        if (e2) fail('operacije.create(dup)', e2);
        return { id: postojeci.id };
      }
      if (error) fail('operacije.create', error);
      return { id: data.id };
    },

    async remove(id) {
      const sb = await supabaseForRequest();
      const { error, count } = await sb.from('operacije').delete({ count: 'exact' }).eq('id', id);
      if (error) fail('operacije.remove', error);
      if (count === 0) throw new DbError('operacije.remove: nema pristupa ili zapis ne postoji', 'not_found');
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
