-- Uvoz po ARKOD brojevima (zamjena za Python generator + QGIS): korisnik zalijepi brojeve iz ARKOD preglednika
-- (javna pretraga po MIBPG-u), a mi iz javnog sažetka vratimo točku, površinu i naziv za potvrdu.
-- Isti podaci su javno dostupni po broju u ARKOD pregledniku / WMS-u. Limit + audit.
create table private.arkod_upiti (
  user_id uuid not null references auth.users (id) on delete cascade,
  ts      timestamptz not null default now(),
  broj    integer not null
);
create index arkod_upiti_user_idx on private.arkod_upiti (user_id, ts desc);
revoke all on table private.arkod_upiti from public, anon, authenticated;

create or replace function public.arkod_po_brojevima(p_ids bigint[])
returns table (arkod_id bigint, lon real, lat real, ha real, land_use_id smallint, naziv text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Nisi prijavljen.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_ids, 1) > 500 then
    raise exception 'Najviše 500 ARKOD brojeva odjednom.' using errcode = '22023';
  end if;
  if (select count(*) from private.arkod_upiti u where u.user_id = v_uid and u.ts > now() - interval '1 day') >= 20 then
    raise exception 'Najviše 20 takvih upita dnevno.' using errcode = 'P0001';
  end if;
  insert into private.arkod_upiti (user_id, broj) values (v_uid, array_length(p_ids, 1));
  insert into public.audit_log (actor_id, actor_email, action, target_type, payload)
  values (v_uid, (select email from auth.users where id = v_uid), 'arkod.uvoz_po_brojevima', 'arkod', jsonb_build_object('broj', array_length(p_ids, 1)));
  return query
    select c.arkod_id, c.lon, c.lat, c.ha, c.land_use_id, c.naziv
    from private.arkod_cestice c
    where c.arkod_id = any (p_ids)
    order by c.naziv nulls last;
end;
$$;
revoke all on function public.arkod_po_brojevima(bigint[]) from public, anon;
grant execute on function public.arkod_po_brojevima(bigint[]) to authenticated;
