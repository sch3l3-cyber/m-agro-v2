-- Globalna mjesečna zaštita Sentinel (Copernicus) kvote — 05_ROADMAP Faza 2, 07_FREE_TIER_STRATEGY.
-- Jedan red po mjesecu; worker (secret ključ = service_role) atomarno "troši" jedinice prije svakog
-- Sentinel poziva. Kad bi zbroj prešao limit, UPDATE se ne izvrši i funkcija vrati false.
create table private.sentinel_potrosnja (
  mjesec    date primary key,
  jedinice  integer not null default 0 check (jedinice >= 0),
  azurirano timestamptz not null default now()
);

create or replace function public.sentinel_potrosi(p_jedinice integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jedinice integer;
begin
  if p_jedinice < 1 or p_jedinice > p_limit then
    return false;
  end if;
  insert into private.sentinel_potrosnja as s (mjesec, jedinice)
  values (date_trunc('month', now())::date, p_jedinice)
  on conflict (mjesec) do update
    set jedinice = s.jedinice + excluded.jedinice, azurirano = now()
    where s.jedinice + excluded.jedinice <= p_limit
  returning s.jedinice into v_jedinice;
  return v_jedinice is not null;
end;
$$;

-- Samo worker (service_role). Farmer ne smije ni čitati ni trošiti kvotu.
revoke all on function public.sentinel_potrosi(integer, integer) from public, anon, authenticated;
grant execute on function public.sentinel_potrosi(integer, integer) to service_role;
revoke all on table private.sentinel_potrosnja from public, anon, authenticated;
