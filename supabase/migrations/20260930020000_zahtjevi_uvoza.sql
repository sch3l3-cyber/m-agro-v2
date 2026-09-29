-- Učitavanje čestica po MIBPG-u (ADR-0011): korisnik upiše MIBPG → zahtjev → admin učita ARKOD čestice u 24 h.
-- Kad APPRRR ponudi službeni servis MIBPG → ARKOD brojevi, isti red obrađuje automatika umjesto admina.
create table public.zahtjevi_uvoza (
  id              uuid primary key default gen_random_uuid(),
  gospodarstvo_id uuid not null references public.gospodarstva (id) on delete cascade,
  mibpg           text not null check (mibpg ~ '^[0-9]{1,10}$'),
  status          text not null default 'ceka' check (status in ('ceka', 'gotovo')),
  dodano          integer not null default 0,
  created_at      timestamptz not null default now(),
  rijeseno_at     timestamptz
);
create index zahtjevi_uvoza_gosp_idx on public.zahtjevi_uvoza (gospodarstvo_id);
create unique index zahtjevi_uvoza_ceka_uq on public.zahtjevi_uvoza (gospodarstvo_id) where status = 'ceka';
alter table public.zahtjevi_uvoza enable row level security;
revoke all on public.zahtjevi_uvoza from anon, authenticated;
grant select on public.zahtjevi_uvoza to authenticated;
create policy zahtjevi_uvoza_select on public.zahtjevi_uvoza for select to authenticated
  using ((select private.ima_pristup(gospodarstvo_id, 'citanje')));
create policy mfa_obavezan on public.zahtjevi_uvoza as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- Novi MIBPG na gospodarstvu → zahtjev (ako već ne čeka)
create or replace function private.zahtjev_uvoza_iz_mibpg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mibpg is not null and (tg_op = 'INSERT' or new.mibpg is distinct from old.mibpg) then
    insert into public.zahtjevi_uvoza (gospodarstvo_id, mibpg) values (new.id, new.mibpg)
    on conflict (gospodarstvo_id) where status = 'ceka' do update set mibpg = excluded.mibpg, created_at = now();
  end if;
  return new;
end;
$$;
create trigger gospodarstva_zahtjev_uvoza after insert or update of mibpg on public.gospodarstva
  for each row execute function private.zahtjev_uvoza_iz_mibpg();

-- Admin: zahtjevi koji čekaju (+ zadnjih 20 riješenih)
create or replace function public.admin_zahtjevi_uvoza()
returns table (id uuid, gospodarstvo_id uuid, gospodarstvo text, email text, mibpg text, status text, dodano integer, created_at timestamptz, cestica integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) or not (select private.mfa_ok()) then
    raise exception 'samo admin' using errcode = '42501';
  end if;
  return query
    select z.id, z.gospodarstvo_id, g.naziv, u.email::text, z.mibpg, z.status, z.dodano, z.created_at,
           (select count(*)::int from public.cestice c where c.gospodarstvo_id = z.gospodarstvo_id)
    from public.zahtjevi_uvoza z
    join public.gospodarstva g on g.id = z.gospodarstvo_id
    left join auth.users u on u.id = g.created_by
    where z.status = 'ceka' or z.id in (select id from public.zahtjevi_uvoza where status = 'gotovo' order by rijeseno_at desc limit 20)
    order by z.status desc, z.created_at;
end;
$$;

-- Admin dodaje JEDNU ARKOD česticu u gospodarstvo koje je zatražilo učitavanje (granicu dohvaća poslužitelj iz ARKOD WMS-a).
-- Samo za zahtjev koji čeka; preskače duplikate (isti ARKOD broj ili > 50 % preklapanja). Vraća true ako je dodana.
create or replace function public.admin_dodaj_arkod_cesticu(p_zahtjev uuid, p_cestica jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gosp  uuid;
  v_geom  extensions.geometry;
  v_arkod text := nullif(trim(p_cestica ->> 'arkodId'), '');
begin
  if not (select private.is_admin()) or not (select private.mfa_ok()) then
    raise exception 'samo admin' using errcode = '42501';
  end if;
  select gospodarstvo_id into v_gosp from public.zahtjevi_uvoza where id = p_zahtjev and status = 'ceka';
  if v_gosp is null then
    raise exception 'Zahtjev ne postoji ili je već riješen' using errcode = 'P0001';
  end if;
  v_geom := extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromgeojson((p_cestica -> 'geom')::text), 4326));
  if exists (select 1 from public.cestice c where c.gospodarstvo_id = v_gosp and (c.arkod_id = v_arkod
       or (extensions.st_intersects(c.geom_arkod, v_geom)
           and extensions.st_area(extensions.st_intersection(extensions.st_makevalid(c.geom_arkod), extensions.st_makevalid(v_geom))::extensions.geography)
               > 0.5 * least(extensions.st_area(c.geom_arkod::extensions.geography), extensions.st_area(v_geom::extensions.geography))))) then
    return false;
  end if;
  insert into public.cestice (gospodarstvo_id, arkod_id, naziv, land_use_id, geom_arkod, arkod_atributi)
  values (v_gosp, v_arkod, left(coalesce(nullif(trim(p_cestica ->> 'naziv'), ''), 'ARKOD ' || v_arkod), 200),
          (p_cestica ->> 'landUseId')::int, v_geom, p_cestica -> 'atributi');
  update public.zahtjevi_uvoza set dodano = dodano + 1 where id = p_zahtjev;
  return true;
end;
$$;

create or replace function public.admin_zahtjev_gotov(p_zahtjev uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) or not (select private.mfa_ok()) then
    raise exception 'samo admin' using errcode = '42501';
  end if;
  update public.zahtjevi_uvoza set status = 'gotovo', rijeseno_at = now() where id = p_zahtjev and status = 'ceka';
  insert into public.audit_log (actor_id, actor_email, action, target_type, target_id, payload)
  values ((select auth.uid()), (select email from auth.users where id = (select auth.uid())), 'zahtjev_uvoza.gotov', 'zahtjevi_uvoza', p_zahtjev,
          (select jsonb_build_object('dodano', dodano, 'mibpg', mibpg) from public.zahtjevi_uvoza where id = p_zahtjev));
end;
$$;

revoke all on function public.admin_zahtjevi_uvoza(), public.admin_dodaj_arkod_cesticu(uuid, jsonb), public.admin_zahtjev_gotov(uuid) from public, anon;
grant execute on function public.admin_zahtjevi_uvoza(), public.admin_dodaj_arkod_cesticu(uuid, jsonb), public.admin_zahtjev_gotov(uuid) to authenticated;
