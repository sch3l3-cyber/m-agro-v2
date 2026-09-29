-- AI kvota (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(8);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'ai@test.hr');

create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

set local role anon;
select throws_ok($$ select public.ai_rezerviraj(5) $$, '42501', null, 'Anon ne može rezervirati');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select is(public.ai_rezerviraj(5, 2), 'ok', 'Prva poruka prolazi');
select lives_ok($$ select public.ai_evidentiraj(0.05) $$, 'Trošak se upisuje');
select is(public.ai_rezerviraj(5, 2), 'ok', 'Druga poruka prolazi');
select is(public.ai_rezerviraj(5, 2), 'sat', 'Treća u satu je odbijena (limit 2/h)');
select throws_ok($$ select public.ai_evidentiraj(5) $$, '22023', null, 'Prevelik iznos se odbija');
select is(public.ai_rezerviraj(0.04, 10), 'mjesec', 'Potrošen budžet blokira');
reset role;
select is((select usd from private.ai_potrosnja where mjesec = date_trunc('month', now())::date), 0.05::numeric, 'Napuhavanje bez rezervacije ne povećava trošak');

select * from finish();
rollback;
