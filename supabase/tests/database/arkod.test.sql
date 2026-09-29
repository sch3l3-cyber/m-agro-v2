-- ARKOD dodavanje / preklapanje (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'arkod1@test.hr'),
  ('00000000-0000-0000-0000-0000000000d2', 'arkod2@test.hr');
insert into public.gospodarstva (id, naziv, created_by) values
  ('00000000-0000-0000-0000-00000000dd01', 'A', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-00000000dd02', 'B', '00000000-0000-0000-0000-0000000000d2');
insert into public.cestice (id, gospodarstvo_id, naziv, geom_arkod) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-00000000dd01', 'Moja',
   st_multi(st_geomfromtext('POLYGON((18.30 45.30, 18.31 45.30, 18.31 45.31, 18.30 45.31, 18.30 45.30))', 4326))),
  ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-00000000dd02', 'Tuđa',
   st_multi(st_geomfromtext('POLYGON((18.30 45.30, 18.31 45.30, 18.31 45.31, 18.30 45.31, 18.30 45.30))', 4326)));

create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select ok(
  (select udio > 0.99 from public.cestice_preklapanje('00000000-0000-0000-0000-00000000dd01',
    '{"type":"Polygon","coordinates":[[[18.30,45.30],[18.31,45.30],[18.31,45.31],[18.30,45.31],[18.30,45.30]]]}') limit 1),
  'Ista geometrija = preklapanje ~100 %');
select is(
  (select count(*)::int from public.cestice_preklapanje('00000000-0000-0000-0000-00000000dd02',
    '{"type":"Polygon","coordinates":[[[18.30,45.30],[18.31,45.30],[18.31,45.31],[18.30,45.31],[18.30,45.30]]]}')),
  0, 'Tuđe gospodarstvo se ne vidi (RLS)');
select is(
  (select count(*)::int from public.cestice_preklapanje('00000000-0000-0000-0000-00000000dd01',
    '{"type":"Polygon","coordinates":[[[18.40,45.40],[18.41,45.40],[18.41,45.41],[18.40,45.41],[18.40,45.40]]]}')),
  0, 'Bez preklapanja → prazno');
select lives_ok(
  $$ update public.cestice set arkod_id = '123', arkod_atributi = '{"nagib":1.5}' where id = '00000000-0000-0000-0000-0000000d0001' $$,
  'Član smije povezati česticu s ARKOD-om');
select throws_ok(
  $$ update public.cestice set arkod_atributi = '[1]' where id = '00000000-0000-0000-0000-0000000d0001' $$,
  '23514', null, 'arkod_atributi mora biti objekt');
select ok(
  (select lon between 18.30 and 18.31 and lat between 45.30 and 45.31 from public.cestica_tocka('00000000-0000-0000-0000-0000000d0001')),
  'Točka je unutar čestice');
reset role;

select * from finish();
rollback;
