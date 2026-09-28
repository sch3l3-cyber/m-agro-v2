-- Uvoz čestica (RPC uvezi_cestice) — pgTAP. Pokretanje: `supabase test db`
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'farmer-a@test.hr'),
  ('00000000-0000-0000-0000-00000000000b', 'farmer-b@test.hr'),
  ('00000000-0000-0000-0000-00000000000c', 'clan-c@test.hr');

create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.c(p_naziv text, p_arkod text, dx float) returns jsonb language sql as $$
  select jsonb_build_object('naziv', p_naziv, 'arkodId', p_arkod, 'landUseId', 200, 'kultura', 'Oranice',
    'geom', extensions.st_asgeojson(extensions.st_multi(extensions.st_makeenvelope(18.30 + dx, 45.32, 18.305 + dx, 45.325, 4326)))::jsonb)
$$;

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into gospodarstva (id, naziv) values ('10000000-0000-0000-0000-00000000000a', 'OPG A');
insert into memberships (gospodarstvo_id, user_id, uloga)
  values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'clan');

select is(
  uvezi_cestice('10000000-0000-0000-0000-00000000000a', jsonb_build_array(pg_temp.c('Ciglana', '111', 0), pg_temp.c('Dolac', null, 0.01)), 'dodaj'),
  '{"dodano": 2, "azurirano": 0, "preskoceno": 0, "obrisano": 0}'::jsonb, 'dodaj: 2 nove čestice');

select is(
  uvezi_cestice('10000000-0000-0000-0000-00000000000a', jsonb_build_array(pg_temp.c('Ciglana', '111', 0), pg_temp.c('Dolac', null, 0.01)), 'dodaj'),
  '{"dodano": 0, "azurirano": 0, "preskoceno": 2, "obrisano": 0}'::jsonb, 'dodaj isto ponovo: ništa se ne duplira');

select is(
  uvezi_cestice('10000000-0000-0000-0000-00000000000a', jsonb_build_array(pg_temp.c('Ciglana NOVO', '111', 0.02), pg_temp.c('Treća', '333', 0.03)), 'azuriraj'),
  '{"dodano": 1, "azurirano": 1, "preskoceno": 0, "obrisano": 0}'::jsonb, 'ažuriraj: po ARKOD broju ažurira, novu dodaje');
select is((select naziv from cestice where arkod_id = '111'), 'Ciglana NOVO', 'ažurirani naziv spremljen');
select is((select count(*)::int from cestice), 3, 'ukupno 3 čestice');

select is((to_json(geom_arkod) ->> 'type'), 'MultiPolygon', 'PostgREST dobiva geometriju kao GeoJSON')
  from cestice where arkod_id = '111';

select ok((select povrsina_ha between 10 and 30 from cestice where arkod_id = '111'), 'površina izračunata u bazi');

-- samopresijecajući ("leptir") poligon se popravlja umjesto da padne
select lives_ok($$ select uvezi_cestice('10000000-0000-0000-0000-00000000000a',
  jsonb_build_array(jsonb_build_object('naziv', 'Leptir', 'arkodId', null,
    'geom', '{"type":"MultiPolygon","coordinates":[[[[18.4,45.3],[18.41,45.31],[18.41,45.3],[18.4,45.31],[18.4,45.3]]]]}'::jsonb)),
  'dodaj') $$, 'neispravan (samopresijecajući) poligon se automatski popravi');

select throws_ok($$ select uvezi_cestice('10000000-0000-0000-0000-00000000000a',
  jsonb_build_array(jsonb_build_object('naziv', 'Metri', 'arkodId', null,
    'geom', '{"type":"MultiPolygon","coordinates":[[[[641750,5022298],[641850,5022298],[641850,5022398],[641750,5022298]]]]}'::jsonb)),
  'dodaj') $$, '23514', null, 'neprojicirane koordinate odbijene i kroz RPC');

select throws_ok($$ select uvezi_cestice('10000000-0000-0000-0000-00000000000a', '[]'::jsonb, 'dodaj') $$,
  '22023', null, 'prazan uvoz odbijen');

-- ------------------------------------------------ autorizacija
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$ select uvezi_cestice('10000000-0000-0000-0000-00000000000a', jsonb_build_array(pg_temp.c('Upad', '999', 0.5)), 'dodaj') $$,
  '42501', null, 'farmer B ne može uvoziti u gospodarstvo A');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$ select uvezi_cestice('10000000-0000-0000-0000-00000000000a', jsonb_build_array(pg_temp.c('X', '998', 0.5)), 'zamijeni') $$,
  '42501', null, 'član (ne vlasnik) ne može zamijeniti sve čestice');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is(
  uvezi_cestice('10000000-0000-0000-0000-00000000000a', jsonb_build_array(pg_temp.c('Jedina', '777', 0)), 'zamijeni') ->> 'obrisano',
  '4', 'vlasnik: zamijeni briše sve postojeće (4) i uvozi nove');

select set_config('role', 'postgres', true);
select ok((select count(*) = 1 from audit_log where action = 'cestice.uvoz' and payload ->> 'mod' = 'zamijeni'),
  'uvoz zapisan u audit log');

select * from finish();
rollback;
