-- RLS / autorizacijski testovi (pgTAP). Pokretanje: `supabase test db`
-- Sve se događa u transakciji i vraća na kraju (rollback).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(28);

-- ---------------------------------------------------------------- fixture
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'farmer-a@test.hr'),
  ('00000000-0000-0000-0000-00000000000b', 'farmer-b@test.hr'),
  ('00000000-0000-0000-0000-00000000000c', 'citac-c@test.hr'),
  ('00000000-0000-0000-0000-00000000000d', 'admin-d@test.hr');
insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-00000000000d');

create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Mali pravokutnik kod Satnice Đakovačke (WGS84)
create or replace function pg_temp.poly(dx float) returns extensions.geometry language sql as $$
  select extensions.st_multi(extensions.st_makeenvelope(18.30 + dx, 45.32, 18.31 + dx, 45.33, 4326))
$$;

-- A i B kreiraju svoja gospodarstva i čestice
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into gospodarstva (id, naziv, mibpg) values ('10000000-0000-0000-0000-00000000000a', 'OPG A', '111');
insert into cestice (id, gospodarstvo_id, arkod_id, naziv, geom_arkod)
  values ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'A-1', 'Ciglana', pg_temp.poly(0));

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into gospodarstva (id, naziv) values ('10000000-0000-0000-0000-00000000000b', 'OPG B');
insert into cestice (id, gospodarstvo_id, arkod_id, naziv, geom_arkod)
  values ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'B-1', 'Dolac', pg_temp.poly(0.05));

select pg_temp.logout();
insert into ndvi_cache (geom_hash, datum, mean)
  select geom_hash, '2026-05-15', 0.71 from cestice where id = '20000000-0000-0000-0000-00000000000b';

-- Regresija: aplikacija radi INSERT ... RETURNING (supabase .insert().select())
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into gospodarstva (naziv) values ('OPG A2') returning id $$,
  'Kreiranje gospodarstva s RETURNING radi (bug 2026-09-28)');
delete from gospodarstva where naziv = 'OPG A2';

-- ---------------------------------------------------------------- izolacija A/B
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

select is((select count(*)::int from gospodarstva), 1, 'A vidi samo svoje gospodarstvo');
select is((select count(*)::int from cestice), 1, 'A vidi samo svoje čestice');
select is((select count(*)::int from cestice where gospodarstvo_id = '10000000-0000-0000-0000-00000000000b'), 0,
  'A ne vidi čestice gospodarstva B');
select is((select count(*)::int from ndvi_cache), 0, 'A ne vidi NDVI cache za tuđu geometriju');
select is((select count(*)::int from memberships), 1, 'A vidi samo članstvo svog gospodarstva');

select throws_ok(
  $$ insert into cestice (gospodarstvo_id, naziv, geom_arkod)
     values ('10000000-0000-0000-0000-00000000000b', 'Upad', extensions.st_multi(extensions.st_makeenvelope(18.3,45.3,18.31,45.31,4326))) $$,
  '42501', null, 'A ne može dodati česticu u gospodarstvo B');

update cestice set naziv = 'hack' where id = '20000000-0000-0000-0000-00000000000b';
delete from cestice where id = '20000000-0000-0000-0000-00000000000b';

-- ---------------------------------------------------------------- eskalacija privilegija
select throws_ok(
  $$ insert into app_admins (user_id) values ('00000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'Farmer se ne može sam dodati u app_admins');
select throws_ok(
  $$ insert into memberships (gospodarstvo_id, user_id, uloga)
     values ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'vlasnik') $$,
  '42501', null, 'A se ne može upisati kao vlasnik gospodarstva B');
select throws_ok(
  $$ insert into gospodarstva (naziv, created_by) values ('Podmetnuto', '00000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'A ne može kreirati gospodarstvo u ime B');
select throws_ok(
  $$ update profiles set email = 'x@x.hr' where id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'Email u profilu nije izmjenjiv s klijenta');
select throws_ok(
  $$ update cestice set povrsina_ha = 999 $$,
  '428C9', null, 'Površina se ne može ručno prepisati (generirani stupac)');
select throws_ok(
  $$ delete from memberships where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  'P0001', null, 'Zadnji vlasnik ne može napustiti gospodarstvo');

-- ---------------------------------------------------------------- geometrija
select throws_ok(
  $$ insert into cestice (gospodarstvo_id, naziv, geom_arkod)
     values ('10000000-0000-0000-0000-00000000000a', 'EPSG3765',
             extensions.st_multi(extensions.st_makeenvelope(641750, 5022298, 641850, 5022398, 4326))) $$,
  '23514', null, 'Neprojicirane (EPSG:3765) koordinate su odbijene (lekcija #3)');
select ok((select povrsina_ha between 80 and 90 from cestice where id = '20000000-0000-0000-0000-00000000000a'),
  'Površina 0.01°×0.01° kod 45°N ≈ 87 ha izračunata iz geometrije');

-- ---------------------------------------------------------------- uloga "citanje"
insert into memberships (gospodarstvo_id, user_id, uloga)
  values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'citanje');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from cestice), 1, 'Čitač vidi čestice gospodarstva A');
select throws_ok(
  $$ insert into cestice (gospodarstvo_id, naziv, geom_arkod)
     values ('10000000-0000-0000-0000-00000000000a', 'X', extensions.st_multi(extensions.st_makeenvelope(18.3,45.3,18.31,45.31,4326))) $$,
  '42501', null, 'Čitač ne može dodati česticu');
select throws_ok(
  $$ insert into operacije (cestica_id, tip, datum) values ('20000000-0000-0000-0000-00000000000a', 'prihrana', '2026-03-01') $$,
  '42501', null, 'Čitač ne može upisati operaciju');
-- RLS filtrira UPDATE na 0 redaka (bez greške) — provjeravamo ishod, ne iznimku
update memberships set uloga = 'vlasnik' where user_id = '00000000-0000-0000-0000-00000000000c';
select is((select count(*)::int from memberships where user_id = '00000000-0000-0000-0000-00000000000c' and uloga = 'vlasnik'), 0,
  'Čitač se ne može sam promovirati u vlasnika');
select throws_ok(
  $$ insert into memberships (gospodarstvo_id, user_id, uloga)
     values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'vlasnik') $$,
  '42501', null, 'Čitač ne može dodavati članove');

delete from cestice where id = '20000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from cestice where id = '20000000-0000-0000-0000-00000000000a'), 1,
  'Čitač ne može obrisati česticu (samo vlasnik)');

-- ---------------------------------------------------------------- anon
select pg_temp.logout();
set local role anon;
select throws_ok($$ select count(*) from cestice $$, '42501', null, 'anon nema pristup česticama');
reset role;

-- ---------------------------------------------------------------- stanje nakon napada (kao postgres)
select is((select naziv from cestice where id = '20000000-0000-0000-0000-00000000000b'), 'Dolac',
  'A nije uspio preimenovati česticu B');
select is((select count(*)::int from app_admins), 1, 'app_admins nepromijenjen');

-- ---------------------------------------------------------------- admin
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from cestice), 2, 'Admin vidi sve čestice');
select ok((select count(*) > 0 from audit_log where action = 'gospodarstva.insert'), 'Audit log bilježi kreiranje gospodarstva');

-- ---------------------------------------------------------------- uređivanje čestice (naziv, kultura)
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update cestice set naziv = 'Ciglana istok', kultura = 'Pšenica' where id = '20000000-0000-0000-0000-00000000000a';
select is((select naziv || '/' || kultura from cestice where id = '20000000-0000-0000-0000-00000000000a'), 'Ciglana istok/Pšenica',
  'Vlasnik mijenja naziv i kulturu čestice');

-- ---------------------------------------------------------------- brisanje gospodarstva (kaskada + guard)
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ delete from gospodarstva where id = '10000000-0000-0000-0000-00000000000a' $$,
  'Vlasnik može obrisati gospodarstvo (kaskada ne okida guard)');

select * from finish();
rollback;
