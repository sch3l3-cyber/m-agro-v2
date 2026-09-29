-- ADR-0011: „Dodaj cijelo gospodarstvo”. Sažetak javnog ARKOD sloja (istočna Hrvatska) u PRIVATNOJ shemi.
-- jpaid se NE sprema: punjač (GitHub Actions) ga pretvara u interni broj nositelja koji se mijenja pri svakom punjenju.
create table private.arkod_cestice (
  arkod_id    bigint primary key,
  nositelj    integer not null,
  lon         real not null,
  lat         real not null,
  ha          real,
  land_use_id smallint,
  naziv       text
);
create index arkod_cestice_nositelj_idx on private.arkod_cestice (nositelj);

create table private.arkod_meta (
  id         boolean primary key default true check (id),
  osvjezeno  timestamptz not null,
  broj       integer not null
);

-- Svaki grupni upit se bilježi (ograničenje + audit)
create table private.arkod_grupni_upiti (
  user_id  uuid not null references auth.users (id) on delete cascade,
  arkod_id bigint not null,
  ts       timestamptz not null default now()
);
create index arkod_grupni_upiti_user_idx on private.arkod_grupni_upiti (user_id, ts desc);

revoke all on table private.arkod_cestice, private.arkod_meta, private.arkod_grupni_upiti from public, anon, authenticated;

/**
 * Sve ARKOD čestice istog nositelja kao dodirnuta čestica. Najviše 5 grupnih upita dnevno po korisniku; svaki u audit logu.
 * Vraća samo ono što je javno u ARKOD WMS-u (id, točka, površina, vrsta uporabe, naziv) — bez jpaid-a.
 */
create or replace function public.arkod_gospodarstvo(p_arkod_id bigint)
returns table (arkod_id bigint, lon real, lat real, ha real, land_use_id smallint, naziv text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_nositelj integer;
begin
  if v_uid is null then
    raise exception 'Nisi prijavljen.' using errcode = '42501';
  end if;
  if (select count(*) from private.arkod_grupni_upiti g where g.user_id = v_uid and g.ts > now() - interval '1 day') >= 5 then
    raise exception 'Najviše 5 takvih upita dnevno.' using errcode = 'P0001';
  end if;
  select c.nositelj into v_nositelj from private.arkod_cestice c where c.arkod_id = p_arkod_id;
  insert into private.arkod_grupni_upiti (user_id, arkod_id) values (v_uid, p_arkod_id);
  insert into public.audit_log (actor_id, actor_email, action, target_type, payload)
  values (v_uid, (select email from auth.users where id = v_uid), 'arkod.grupni_upit', 'arkod', jsonb_build_object('arkod_id', p_arkod_id, 'pronadeno', v_nositelj is not null));
  if v_nositelj is null then
    return;
  end if;
  return query
    select c.arkod_id, c.lon, c.lat, c.ha, c.land_use_id, c.naziv
    from private.arkod_cestice c
    where c.nositelj = v_nositelj
    order by c.naziv nulls last
    limit 2000;
end;
$$;
revoke all on function public.arkod_gospodarstvo(bigint) from public, anon;
grant execute on function public.arkod_gospodarstvo(bigint) to authenticated;
