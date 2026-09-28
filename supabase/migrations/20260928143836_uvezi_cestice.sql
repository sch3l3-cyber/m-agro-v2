-- =============================================================================
-- Uvoz čestica — jedna transakcija (sve ili ništa), tri moda (brief 02: merge/update/replace)
--   dodaj     — nove čestice se dodaju, postojeće se NE diraju
--   azuriraj  — postojeće (isti ARKOD broj, ili isti naziv kad ARKOD nema) se ažuriraju, nove dodaju
--   zamijeni  — SVE čestice gospodarstva se brišu pa uvoze nove (samo vlasnik; briše i njihove operacije!)
--
-- SECURITY INVOKER: sve provjere prolaze kroz RLS pozivatelja — funkcija ne zaobilazi ništa.
-- Lekcija #2: nema traženja po owner_id; usporedba je isključivo unutar zadanog gospodarstva.
-- =============================================================================

create or replace function private.zapisi_audit(p_action text, p_target_type text, p_target_id uuid, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, actor_email, action, target_type, target_id, payload)
  values ((select auth.uid()), (select email from auth.users where id = (select auth.uid())),
          p_action, p_target_type, p_target_id, p_payload);
$$;
revoke all on function private.zapisi_audit(text, text, uuid, jsonb) from public, anon;
grant execute on function private.zapisi_audit(text, text, uuid, jsonb) to authenticated;

create or replace function public.uvezi_cestice(p_gospodarstvo uuid, p_cestice jsonb, p_mod text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c            jsonb;
  v_geom       extensions.geometry;
  v_postojeca  uuid;
  v_arkod      text;
  v_naziv      text;
  v_dodano     int := 0;
  v_azurirano  int := 0;
  v_preskoceno int := 0;
  v_obrisano   int := 0;
begin
  if p_mod is null or p_mod not in ('dodaj', 'azuriraj', 'zamijeni') then
    raise exception 'Nepoznat mod uvoza: %', p_mod using errcode = '22023';
  end if;
  if jsonb_typeof(p_cestice) is distinct from 'array' or jsonb_array_length(p_cestice) = 0 then
    raise exception 'Nema čestica za uvoz' using errcode = '22023';
  end if;
  if jsonb_array_length(p_cestice) > 5000 then
    raise exception 'Najviše 5000 čestica po uvozu' using errcode = '22023';
  end if;
  -- Rana, jasna poruka (RLS bi ionako odbio, ali s generičkom greškom)
  if not private.ima_pristup(p_gospodarstvo, 'clan') then
    raise exception 'Nemaš pravo uvoziti čestice u ovo gospodarstvo' using errcode = '42501';
  end if;

  if p_mod = 'zamijeni' then
    if not private.ima_pristup(p_gospodarstvo, 'vlasnik') then
      raise exception 'Samo vlasnik može zamijeniti sve čestice' using errcode = '42501';
    end if;
    delete from public.cestice where gospodarstvo_id = p_gospodarstvo;
    get diagnostics v_obrisano = row_count;
  end if;

  for c in select value from jsonb_array_elements(p_cestice) loop
    v_arkod := nullif(trim(c ->> 'arkodId'), '');
    v_naziv := nullif(trim(c ->> 'naziv'), '');
    if v_naziv is null then
      raise exception 'Čestica bez naziva' using errcode = '22023';
    end if;

    v_geom := extensions.st_setsrid(extensions.st_geomfromgeojson(c -> 'geom'), 4326);
    if not extensions.st_isvalid(v_geom) then
      -- KML/ručno crtani poligoni često imaju samopresijecanja; popravak zadržava samo poligone
      v_geom := extensions.st_collectionextract(extensions.st_makevalid(v_geom), 3);
    end if;
    v_geom := extensions.st_multi(v_geom);
    if extensions.st_isempty(v_geom) then
      raise exception 'Čestica "%" ima praznu geometriju', v_naziv using errcode = '22023';
    end if;

    v_postojeca := null;
    if v_arkod is not null then
      select id into v_postojeca from public.cestice
       where gospodarstvo_id = p_gospodarstvo and arkod_id = v_arkod;
    else
      select id into v_postojeca from public.cestice
       where gospodarstvo_id = p_gospodarstvo and arkod_id is null and naziv = v_naziv
       order by created_at limit 1;
    end if;

    if v_postojeca is null then
      insert into public.cestice (gospodarstvo_id, arkod_id, naziv, kultura, land_use_id, geom_arkod)
      values (p_gospodarstvo, v_arkod, v_naziv, nullif(c ->> 'kultura', ''), (c ->> 'landUseId')::int, v_geom);
      v_dodano := v_dodano + 1;
    elsif p_mod = 'azuriraj' then
      update public.cestice
         set naziv = v_naziv,
             kultura = coalesce(nullif(c ->> 'kultura', ''), kultura),
             land_use_id = coalesce((c ->> 'landUseId')::int, land_use_id),
             geom_arkod = v_geom
       where id = v_postojeca;
      v_azurirano := v_azurirano + 1;
    else
      v_preskoceno := v_preskoceno + 1;
    end if;
  end loop;

  perform private.zapisi_audit('cestice.uvoz', 'gospodarstvo', p_gospodarstvo,
    jsonb_build_object('mod', p_mod, 'dodano', v_dodano, 'azurirano', v_azurirano,
                       'preskoceno', v_preskoceno, 'obrisano', v_obrisano));

  return jsonb_build_object('dodano', v_dodano, 'azurirano', v_azurirano,
                            'preskoceno', v_preskoceno, 'obrisano', v_obrisano);
end;
$$;

revoke all on function public.uvezi_cestice(uuid, jsonb, text) from public, anon;
grant execute on function public.uvezi_cestice(uuid, jsonb, text) to authenticated;
