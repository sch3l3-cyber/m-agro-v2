-- Admin pregled (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(3);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'farmer-f@test.hr'),
  ('00000000-0000-0000-0000-0000000000f2', 'admin-f@test.hr');
insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-0000000000f2');

create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select throws_ok($$ select public.admin_pregled() $$, '42501', null, 'Farmer ne vidi admin pregled');

select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select ok((public.admin_pregled() -> 'brojke' ->> 'korisnika')::int >= 2, 'Admin vidi broj korisnika');
select is((public.admin_pregled(500) -> 'kvota' ->> 'limit')::int, 500, 'Limit kvote se prosljeđuje');

select * from finish();
rollback;
