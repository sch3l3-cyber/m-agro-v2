-- MFA politike (pgTAP). Pokretanje: `supabase test db`
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'mfa@test.hr');

create or replace function pg_temp.login(p_uid uuid, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
end $$;

-- korisnik kreira gospodarstvo dok još nema MFA
select pg_temp.login('00000000-0000-0000-0000-0000000000e1', 'aal1');
insert into gospodarstva (id, naziv) values ('10000000-0000-0000-0000-0000000000e1', 'OPG MFA');
select is((select count(*)::int from gospodarstva), 1, 'Bez MFA faktora: aal1 vidi svoje podatke');

-- uključi MFA (potvrđen TOTP faktor)
select set_config('role', 'postgres', true);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000e1', 'test', 'totp', 'verified', now(), now());

select pg_temp.login('00000000-0000-0000-0000-0000000000e1', 'aal1');
select is((select count(*)::int from gospodarstva), 0, 'S MFA faktorom: samo lozinka (aal1) ne vidi ništa');
select throws_ok($$ insert into gospodarstva (naziv) values ('Upad') $$, '42501', null, 'S MFA faktorom: aal1 ne može ni pisati');

select pg_temp.login('00000000-0000-0000-0000-0000000000e1', 'aal2');
select is((select count(*)::int from gospodarstva), 1, 'S MFA faktorom: nakon koda (aal2) vidi podatke');

select * from finish();
rollback;
