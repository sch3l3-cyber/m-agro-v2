-- ARKOD grupni uvoz (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(7);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f7', 'grupa@test.hr');
insert into private.arkod_cestice (arkod_id, nositelj, lon, lat, ha, land_use_id, naziv) values
  (1, 10, 18.3, 45.3, 2.5, 200, 'A'),
  (2, 10, 18.31, 45.31, 1.0, 200, 'B'),
  (3, 20, 18.4, 45.4, 3.0, 200, 'Tuđa');

create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000000f7');
select throws_ok($$ select * from private.arkod_cestice $$, '42501', null, 'Privatna tablica nije dostupna izvana');
select is((select array_agg(naziv order by naziv) from public.arkod_gospodarstvo(1)), array['A', 'B'], 'Vraća samo čestice istog nositelja');
select is((select count(*)::int from public.arkod_gospodarstvo(999)), 0, 'Nepoznata čestica → ništa');
select lives_ok($$ select * from public.arkod_gospodarstvo(3) $$, '3. upit');
select lives_ok($$ select * from public.arkod_gospodarstvo(3) $$, '4. upit');
select lives_ok($$ select * from public.arkod_gospodarstvo(3) $$, '5. upit');
select throws_ok($$ select * from public.arkod_gospodarstvo(1) $$, 'P0001', null, 'Nakon 5 upita dnevno → odbijeno');
reset role;

select * from finish();
rollback;
