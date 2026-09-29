-- MIBPG provjera (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'pravi@test.hr'),
  ('00000000-0000-0000-0000-0000000000e2', 'lazni@test.hr');

create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select lives_ok($$ insert into public.gospodarstva (naziv, mibpg) values ('Lažno', '123456') $$, 'Neprovjereni upis MIBPG-a je dopušten');
select throws_ok($$ update public.gospodarstva set provjereno = true where naziv = 'Lažno' $$, '42501', null, 'Korisnik ne može sam označiti provjereno');

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$ insert into public.gospodarstva (naziv, mibpg) values ('Pravo', '123456') $$, 'Pravi vlasnik nije blokiran tuđim neprovjerenim upisom');
reset role;

update public.gospodarstva set provjereno = true where naziv = 'Pravo';
select throws_ok($$ update public.gospodarstva set provjereno = true where naziv = 'Lažno' $$, '23505', null, 'Samo jedno provjereno gospodarstvo po MIBPG-u');

select * from finish();
rollback;
