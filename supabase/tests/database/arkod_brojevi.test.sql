-- Uvoz po ARKOD brojevima (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(5);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a9', 'brojevi@test.hr');
insert into private.arkod_cestice (arkod_id, nositelj, lon, lat, ha, land_use_id, naziv) values
  (91, 1, 18.3, 45.3, 2.5, 200, 'A'), (92, 1, 18.31, 45.31, 1.0, 200, 'B'), (93, 2, 18.4, 45.4, 3.0, 200, 'C');

create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

set local role anon;
select throws_ok($$ select * from public.arkod_po_brojevima(array[91]::bigint[]) $$, '42501', null, 'Anon ne smije');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a9');
select is((select array_agg(naziv order by naziv) from public.arkod_po_brojevima(array[91, 93, 999]::bigint[])), array['A', 'C'], 'Vraća samo tražene postojeće');
select is((select count(*)::int from public.arkod_po_brojevima(array[]::bigint[])), 0, 'Prazan popis → ništa');
select throws_ok($$ select * from public.arkod_po_brojevima((select array_agg(g)::bigint[] from generate_series(1, 501) g)) $$, '22023', null, 'Najviše 500 brojeva');
reset role;
select is((select count(*)::int from public.audit_log where action = 'arkod.uvoz_po_brojevima'), 1, 'Upit je u audit logu');

select * from finish();
rollback;
