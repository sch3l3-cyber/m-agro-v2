-- Način sučelja (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'nacin1@test.hr'),
  ('00000000-0000-0000-0000-0000000000c2', 'nacin2@test.hr');

select is((select nacin from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'), 'jednostavni', 'Novi račun je u jednostavnom načinu');

create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
update public.profiles set nacin = 'napredni' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set nacin = 'napredni' where id = '00000000-0000-0000-0000-0000000000c2';
select throws_ok($$ update public.profiles set nacin = 'bilo_sto' where id = '00000000-0000-0000-0000-0000000000c1' $$, '23514', null, 'Nepoznat način se odbija');
select throws_ok($$ update public.profiles set email = 'x@y.hr' where id = '00000000-0000-0000-0000-0000000000c1' $$, '42501', null, 'Email se ne smije mijenjati');
reset role;

select is(
  (select array_agg(nacin order by email) from public.profiles where id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2')),
  array['napredni', 'jednostavni'],
  'Korisnik mijenja samo svoj način'
);

select * from finish();
rollback;
