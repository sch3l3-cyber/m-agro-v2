-- Brisanje vlastitog računa (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'brisem-se@test.hr'),
  ('00000000-0000-0000-0000-0000000000b2', 'ostajem@test.hr'),
  ('00000000-0000-0000-0000-0000000000b3', 'admin-b@test.hr');
insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-0000000000b3');

insert into public.gospodarstva (id, naziv, created_by) values
  ('00000000-0000-0000-0000-00000000bb01', 'Moje', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-00000000bb02', 'Tuđe', '00000000-0000-0000-0000-0000000000b2');
-- vlasnika upisuje trigger pri stvaranju gospodarstva; dodajemo samo b1 kao člana tuđeg
insert into public.memberships (gospodarstvo_id, user_id, uloga) values
  ('00000000-0000-0000-0000-00000000bb02', '00000000-0000-0000-0000-0000000000b1', 'clan')
on conflict do nothing;

create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- anon ne smije
set local role anon;
select throws_ok($$ select public.obrisi_moj_racun() $$, '42501', null, 'Anon ne može pozvati brisanje');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000b3');
select throws_ok($$ select public.obrisi_moj_racun() $$, '42501', null, 'Admin se ne briše iz aplikacije');

-- vlasnik gospodarstva s drugim članom: blokirano
select pg_temp.login('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$ select public.obrisi_moj_racun() $$, 'P0001', null, 'Vlasnik s drugim članovima ne može obrisati račun');

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$ select public.obrisi_moj_racun() $$, 'Korisnik briše svoj račun');
reset role;

select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000000b1'), 0, 'auth.users obrisan');
select is((select count(*)::int from public.gospodarstva where id = '00000000-0000-0000-0000-00000000bb01'), 0, 'Vlastito gospodarstvo obrisano');
select is((select count(*)::int from public.gospodarstva where id = '00000000-0000-0000-0000-00000000bb02'), 1, 'Tuđe gospodarstvo ostaje');
select is((select count(*)::int from public.audit_log where actor_email = 'brisem-se@test.hr'), 0, 'Audit log anonimiziran');

select * from finish();
rollback;
