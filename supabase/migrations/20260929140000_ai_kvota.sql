-- AI savjetnik: tvrdi mjesečni budžet (07_FREE_TIER_STRATEGY: AI_MONTHLY_BUDGET_USD) + 20 poruka/h po korisniku (03_SIGURNOST).
-- Tok: web server prije poziva Claudea zove ai_rezerviraj() (provjera limita + upis poziva),
-- nakon odgovora ai_evidentiraj() upisuje stvarni trošak NA TU rezervaciju (jednom, najviše 0,10 USD).
create table private.ai_potrosnja (
  mjesec    date primary key,
  usd       numeric(10, 4) not null default 0 check (usd >= 0),
  poruka    integer not null default 0,
  azurirano timestamptz not null default now()
);

create table private.ai_pozivi (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  ts           timestamptz not null default now(),
  evidentirano boolean not null default false
);
create index ai_pozivi_user_ts_idx on private.ai_pozivi (user_id, ts desc);

revoke all on table private.ai_potrosnja, private.ai_pozivi from public, anon, authenticated;

-- 'ok' | 'sat' (previše poruka u satu) | 'mjesec' (mjesečni budžet potrošen)
create or replace function public.ai_rezerviraj(p_limit_usd numeric, p_po_satu integer default 20)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Nisi prijavljen.' using errcode = '42501';
  end if;
  if (select count(*) from private.ai_pozivi where user_id = v_uid and ts > now() - interval '1 hour') >= least(p_po_satu, 60) then
    return 'sat';
  end if;
  if coalesce((select usd from private.ai_potrosnja where mjesec = date_trunc('month', now())::date), 0) >= p_limit_usd then
    return 'mjesec';
  end if;
  delete from private.ai_pozivi where user_id = v_uid and ts < now() - interval '2 days';
  insert into private.ai_pozivi (user_id) values (v_uid);
  return 'ok';
end;
$$;

create or replace function public.ai_evidentiraj(p_usd numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  bigint;
begin
  if v_uid is null then
    raise exception 'Nisi prijavljen.' using errcode = '42501';
  end if;
  if p_usd is null or p_usd < 0 or p_usd > 0.10 then
    raise exception 'Neispravan iznos.' using errcode = '22023';
  end if;
  select id into v_id from private.ai_pozivi
  where user_id = v_uid and not evidentirano and ts > now() - interval '10 minutes'
  order by ts desc limit 1 for update;
  if v_id is null then
    return; -- nema otvorene rezervacije → ništa (sprječava napuhavanje troška)
  end if;
  update private.ai_pozivi set evidentirano = true where id = v_id;
  insert into private.ai_potrosnja as p (mjesec, usd, poruka)
  values (date_trunc('month', now())::date, p_usd, 1)
  on conflict (mjesec) do update set usd = p.usd + excluded.usd, poruka = p.poruka + 1, azurirano = now();
end;
$$;

revoke all on function public.ai_rezerviraj(numeric, integer) from public, anon;
revoke all on function public.ai_evidentiraj(numeric) from public, anon;
grant execute on function public.ai_rezerviraj(numeric, integer) to authenticated;
grant execute on function public.ai_evidentiraj(numeric) to authenticated;
