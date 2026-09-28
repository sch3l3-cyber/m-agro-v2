-- Globalna Sentinel kvota (pgTAP). Pokretanje: `supabase test db`
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(5);

set local role authenticated;
select throws_ok($$ select public.sentinel_potrosi(1, 100) $$, '42501', null, 'Prijavljeni korisnik ne može trošiti kvotu');
reset role;

set local role service_role;
select is(public.sentinel_potrosi(60, 100), true, 'Worker troši 60 od 100');
select is(public.sentinel_potrosi(40, 100), true, 'Točno do limita (100) je dopušteno');
select is(public.sentinel_potrosi(1, 100), false, 'Preko limita → false, ništa se ne zbraja');
reset role;

select is((select jedinice from private.sentinel_potrosnja where mjesec = date_trunc('month', now())::date), 100,
  'Brojač stoji na limitu nakon odbijenog poziva');

select * from finish();
rollback;
