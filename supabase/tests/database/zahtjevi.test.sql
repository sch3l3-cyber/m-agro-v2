-- Zahtjevi za učitavanje čestica (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b7', 'farmer-z@test.hr'),
  ('00000000-0000-0000-0000-0000000000b8', 'admin-z@test.hr');
insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-0000000000b8');

create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000000b7');
insert into public.gospodarstva (id, naziv, mibpg) values ('00000000-0000-0000-0000-00000000bb77', 'Farma Z', '158520');
select is((select status from public.zahtjevi_uvoza where gospodarstvo_id = '00000000-0000-0000-0000-00000000bb77'), 'ceka', 'MIBPG pri stvaranju → zahtjev čeka');
select throws_ok($$ update public.zahtjevi_uvoza set status = 'gotovo' $$, '42501', null, 'Farmer ne mijenja zahtjev');
select throws_ok($$ select * from public.admin_zahtjevi_uvoza() $$, '42501', null, 'Farmer ne vidi admin popis');

select pg_temp.login('00000000-0000-0000-0000-0000000000b8');
select is((select count(*)::int from public.admin_zahtjevi_uvoza() where mibpg = '158520'), 1, 'Admin vidi zahtjev');
select ok(public.admin_dodaj_arkod_cesticu(
  (select id from public.zahtjevi_uvoza where mibpg = '158520'),
  '{"arkodId":"777","naziv":"Nova","landUseId":200,"atributi":{"nagib":1},"geom":{"type":"Polygon","coordinates":[[[18.30,45.30],[18.31,45.30],[18.31,45.31],[18.30,45.31],[18.30,45.30]]]}}'),
  'Admin dodaje česticu u zatraženo gospodarstvo');
select ok(not public.admin_dodaj_arkod_cesticu(
  (select id from public.zahtjevi_uvoza where mibpg = '158520'),
  '{"arkodId":"778","naziv":"Duplikat","landUseId":200,"geom":{"type":"Polygon","coordinates":[[[18.30,45.30],[18.31,45.30],[18.31,45.31],[18.30,45.31],[18.30,45.30]]]}}'),
  'Preklapanje > 50 % se preskače');
select lives_ok($$ select public.admin_zahtjev_gotov((select id from public.zahtjevi_uvoza where mibpg = '158520')) $$, 'Admin označi gotovo');
select throws_ok($$ select public.admin_dodaj_arkod_cesticu((select id from public.zahtjevi_uvoza where mibpg = '158520'), '{"arkodId":"9","geom":{"type":"Polygon","coordinates":[[[18.4,45.4],[18.41,45.4],[18.41,45.41],[18.4,45.41],[18.4,45.4]]]}}') $$,
  'P0001', null, 'Riješen zahtjev se više ne puni');
reset role;
select is((select dodano from public.zahtjevi_uvoza where mibpg = '158520'), 1, 'Brojač dodanih');

select * from finish();
rollback;
