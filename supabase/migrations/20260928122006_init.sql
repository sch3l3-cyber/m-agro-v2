-- =============================================================================
-- M-AGRO v2 — 0001 init
-- Shema: profiles, app_admins, gospodarstva, memberships, cestice, operacije,
--        ndvi_cache, audit_log
-- Načela:
--   * Admin uloga je u zasebnoj tablici (app_admins) koju klijent NE MOŽE pisati.
--     (v1/brief: profiles.role + FOR ALL policy = farmer se sam promovira u admina)
--   * Pristup gospodarstvu ide isključivo preko memberships (vlasnik/clan/citanje).
--   * Helper funkcije su u schemi `private` (nije izložena preko PostgREST-a),
--     SECURITY DEFINER + prazan search_path.
--   * Geometrije: MultiPolygon, EPSG:4326. Reprojekcija se radi PRIJE inserta
--     (lib/proj4). CHECK ograničenja odbijaju koordinate izvan WGS84 raspona.
--   * NDVI cache je dijeljen po geom_hash + datum (ne po cestica_id), vidi
--     docs/adr/0002-ndvi-cache-kljuc.md.
-- =============================================================================

create extension if not exists postgis with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tipovi
-- -----------------------------------------------------------------------------
create type public.uloga_clanstva as enum ('citanje', 'clan', 'vlasnik');
create type public.tip_operacije as enum ('sjetva', 'prihrana', 'zastita', 'zetva', 'obrada', 'ostalo');

-- -----------------------------------------------------------------------------
-- Zajednički trigger: updated_at
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles (1:1 s auth.users) — BEZ role stupca
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  ime_prezime text check (char_length(ime_prezime) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Automatski profil pri registraciji (lekcija #9: brisanje auth.users kaskadno briše profil)
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- app_admins — dodjela samo preko SQL-a / service_role
-- -----------------------------------------------------------------------------
create table public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;

-- -----------------------------------------------------------------------------
-- gospodarstva + memberships
-- -----------------------------------------------------------------------------
create table public.gospodarstva (
  id         uuid primary key default gen_random_uuid(),
  mibpg      text check (mibpg ~ '^[0-9]{1,10}$'),
  naziv      text not null check (char_length(naziv) between 1 and 200),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- MIBPG je jedinstven u RH; parcijalni unique dopušta gospodarstva bez MIBPG-a
create unique index gospodarstva_mibpg_uq on public.gospodarstva (mibpg) where mibpg is not null;
create trigger gospodarstva_updated_at before update on public.gospodarstva
  for each row execute function private.set_updated_at();

create table public.memberships (
  gospodarstvo_id uuid not null references public.gospodarstva (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  uloga           public.uloga_clanstva not null default 'clan',
  created_at      timestamptz not null default now(),
  primary key (gospodarstvo_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- Razina pristupa trenutnog korisnika gospodarstvu (null = nema pristupa)
create or replace function private.uloga_u(p_gospodarstvo uuid)
returns public.uloga_clanstva
language sql
stable
security definer
set search_path = ''
as $$
  select m.uloga from public.memberships m
  where m.gospodarstvo_id = p_gospodarstvo and m.user_id = (select auth.uid());
$$;

create or replace function private.ima_pristup(p_gospodarstvo uuid, p_min public.uloga_clanstva)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
      or coalesce(private.uloga_u(p_gospodarstvo) >= p_min, false);
$$;

-- Kreator gospodarstva automatski postaje vlasnik
create or replace function private.gospodarstvo_dodaj_vlasnika()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.memberships (gospodarstvo_id, user_id, uloga)
  values (new.id, new.created_by, 'vlasnik');
  return new;
end;
$$;
create trigger gospodarstva_vlasnik after insert on public.gospodarstva
  for each row execute function private.gospodarstvo_dodaj_vlasnika();

-- Gospodarstvo ne smije ostati bez vlasnika
create or replace function private.zadnji_vlasnik_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.uloga = 'vlasnik'
     and (tg_op = 'DELETE' or new.uloga <> 'vlasnik')
     and exists (select 1 from public.gospodarstva g where g.id = old.gospodarstvo_id)
     and not exists (
       select 1 from public.memberships m
       where m.gospodarstvo_id = old.gospodarstvo_id
         and m.uloga = 'vlasnik'
         and m.user_id <> old.user_id
     ) then
    raise exception 'Gospodarstvo mora imati barem jednog vlasnika' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger memberships_zadnji_vlasnik before update or delete on public.memberships
  for each row execute function private.zadnji_vlasnik_guard();

-- -----------------------------------------------------------------------------
-- cestice
-- -----------------------------------------------------------------------------
create table public.cestice (
  id              uuid primary key default gen_random_uuid(),
  gospodarstvo_id uuid not null references public.gospodarstva (id) on delete cascade,
  arkod_id        text check (char_length(arkod_id) <= 50),        -- null za KML/ručni import
  naziv           text not null check (char_length(naziv) between 1 and 200),
  kultura         text check (char_length(kultura) <= 120),
  land_use_id     int,
  geom_arkod      extensions.geometry(MultiPolygon, 4326) not null,
  geom_precizna   extensions.geometry(MultiPolygon, 4326),
  -- Površina iz geometrije (geography => m²), nikad iz korisničkog unosa
  povrsina_ha     numeric(10, 4) generated always as
                    (round((extensions.st_area(geom_arkod::extensions.geography) / 10000)::numeric, 4)) stored,
  -- Ključ za dijeljeni NDVI cache (ADR-0002)
  geom_hash       text generated always as (md5(extensions.st_asbinary(geom_arkod))) stored,
  local_id        text check (char_length(local_id) <= 100),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (gospodarstvo_id, arkod_id),
  -- Lekcija #3: odbij geometriju koja nije u WGS84 (npr. neprojicirani EPSG:3765 metri)
  constraint cestice_geom_wgs84 check (
    extensions.st_xmin(geom_arkod) >= -180 and extensions.st_xmax(geom_arkod) <= 180 and
    extensions.st_ymin(geom_arkod) >=  -90 and extensions.st_ymax(geom_arkod) <=  90
  )
);
create index cestice_geom_gix on public.cestice using gist (geom_arkod);
create index cestice_gospodarstvo_idx on public.cestice (gospodarstvo_id);
create index cestice_geom_hash_idx on public.cestice (geom_hash);
create trigger cestice_updated_at before update on public.cestice
  for each row execute function private.set_updated_at();

create or replace function private.gospodarstvo_cestice(p_cestica uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select gospodarstvo_id from public.cestice where id = p_cestica;
$$;

-- -----------------------------------------------------------------------------
-- operacije
-- -----------------------------------------------------------------------------
create table public.operacije (
  id            uuid primary key default gen_random_uuid(),
  cestica_id    uuid not null references public.cestice (id) on delete cascade,
  tip           public.tip_operacije not null,
  datum         date not null,
  kultura       text check (char_length(kultura) <= 120),
  sorta         text check (char_length(sorta) <= 120),
  fert          text check (char_length(fert) <= 120),
  product       text check (char_length(product) <= 200),
  amount        numeric check (amount >= 0 and amount <= 100000),
  unit          text check (char_length(unit) <= 20),
  vlaga         numeric check (vlaga between 0 and 100),
  hektolitarska numeric check (hektolitarska between 0 and 150),
  dubina        numeric check (dubina between 0 and 200),
  note          text check (char_length(note) <= 2000),
  local_id      text check (char_length(local_id) <= 100),   -- idempotentnost offline synca
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index operacije_cestica_idx on public.operacije (cestica_id, datum desc);
create unique index operacije_local_id_uq on public.operacije (cestica_id, local_id) where local_id is not null;
create trigger operacije_updated_at before update on public.operacije
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- ndvi_cache — dijeljen, piše ga samo Worker (service_role)
-- -----------------------------------------------------------------------------
create table public.ndvi_cache (
  geom_hash    text not null,
  datum        date not null,
  mean         real,
  min          real,
  max          real,
  stdev        real,
  percentiles  jsonb,          -- {p10,p25,p50,p75,p90}
  sample_count int,
  cloud_pct    real,
  created_at   timestamptz not null default now(),
  primary key (geom_hash, datum)
);

-- -----------------------------------------------------------------------------
-- audit_log — append-only
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users (id) on delete set null,
  actor_email text,
  action      text not null,
  target_type text,
  target_id   uuid,
  payload     jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_action_idx on public.audit_log (action, created_at desc);

create or replace function private.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  -- geometrije ne logiramo (veličina); dovoljno je id + meta
  v_row := v_row - 'geom_arkod' - 'geom_precizna';
  insert into public.audit_log (actor_id, actor_email, action, target_type, target_id, payload)
  values (
    v_uid,
    (select email from auth.users where id = v_uid),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce((v_row ->> 'id')::uuid, (v_row ->> 'gospodarstvo_id')::uuid),
    case when tg_op = 'UPDATE'
         then jsonb_build_object('old', to_jsonb(old) - 'geom_arkod' - 'geom_precizna', 'new', v_row)
         else v_row end
  );
  return coalesce(new, old);
end;
$$;
create trigger gospodarstva_audit after insert or update or delete on public.gospodarstva
  for each row execute function private.audit();
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function private.audit();
create trigger cestice_audit_delete after delete on public.cestice
  for each row execute function private.audit();
create trigger operacije_audit_delete after delete on public.operacije
  for each row execute function private.audit();

-- =============================================================================
-- GRANTS — anon nema pristup ničemu; authenticated samo što RLS dopusti
-- =============================================================================
revoke all on all tables in schema public from anon;
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- profiles: korisnik smije mijenjati samo ime_prezime
revoke insert, update, delete on public.profiles from authenticated;
grant update (ime_prezime) on public.profiles to authenticated;

-- app_admins, ndvi_cache, audit_log: klijent samo čita (uz RLS)
revoke insert, update, delete, truncate on public.app_admins from authenticated;
revoke insert, update, delete, truncate on public.ndvi_cache from authenticated;
revoke insert, update, delete, truncate on public.audit_log from authenticated;

-- izračunata polja se ne pišu s klijenta
revoke insert, update on public.cestice from authenticated;
grant insert (gospodarstvo_id, arkod_id, naziv, kultura, land_use_id, geom_arkod, geom_precizna, local_id)
  on public.cestice to authenticated;
grant update (naziv, kultura, land_use_id, geom_arkod, geom_precizna, local_id)
  on public.cestice to authenticated;

-- gospodarstva: created_by se ne može podmetnuti drugom korisniku (vidi policy) ni promijeniti
revoke update on public.gospodarstva from authenticated;
grant update (mibpg, naziv) on public.gospodarstva to authenticated;

-- operacije: created_by se ne mijenja
revoke update on public.operacije from authenticated;
grant update (tip, datum, kultura, sorta, fert, product, amount, unit, vlaga, hektolitarska, dubina, note)
  on public.operacije to authenticated;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.profiles     enable row level security;
alter table public.app_admins   enable row level security;
alter table public.gospodarstva enable row level security;
alter table public.memberships  enable row level security;
alter table public.cestice      enable row level security;
alter table public.operacije    enable row level security;
alter table public.ndvi_cache   enable row level security;
alter table public.audit_log    enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin())
         or exists (  -- suradnici na istom gospodarstvu vide ime/email
           select 1 from public.memberships a
           join public.memberships b on a.gospodarstvo_id = b.gospodarstvo_id
           where a.user_id = (select auth.uid()) and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- app_admins: korisnik smije vidjeti samo je li SAM admin
create policy app_admins_select on public.app_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- gospodarstva
create policy gospodarstva_select on public.gospodarstva for select to authenticated
  using ((select private.ima_pristup(id, 'citanje')));
create policy gospodarstva_insert on public.gospodarstva for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy gospodarstva_update on public.gospodarstva for update to authenticated
  using ((select private.ima_pristup(id, 'vlasnik')))
  with check ((select private.ima_pristup(id, 'vlasnik')));
create policy gospodarstva_delete on public.gospodarstva for delete to authenticated
  using ((select private.ima_pristup(id, 'vlasnik')));

-- memberships: članovi vide članove; samo vlasnik (ili admin) upravlja
create policy memberships_select on public.memberships for select to authenticated
  using ((select private.ima_pristup(gospodarstvo_id, 'citanje')));
create policy memberships_insert on public.memberships for insert to authenticated
  with check ((select private.ima_pristup(gospodarstvo_id, 'vlasnik')));
create policy memberships_update on public.memberships for update to authenticated
  using ((select private.ima_pristup(gospodarstvo_id, 'vlasnik')))
  with check ((select private.ima_pristup(gospodarstvo_id, 'vlasnik')));
create policy memberships_delete on public.memberships for delete to authenticated
  using ((select private.ima_pristup(gospodarstvo_id, 'vlasnik')) or user_id = (select auth.uid()));

-- cestice: čitanje za sve članove, pisanje za clan+
create policy cestice_select on public.cestice for select to authenticated
  using ((select private.ima_pristup(gospodarstvo_id, 'citanje')));
create policy cestice_insert on public.cestice for insert to authenticated
  with check ((select private.ima_pristup(gospodarstvo_id, 'clan')));
create policy cestice_update on public.cestice for update to authenticated
  using ((select private.ima_pristup(gospodarstvo_id, 'clan')))
  with check ((select private.ima_pristup(gospodarstvo_id, 'clan')));
create policy cestice_delete on public.cestice for delete to authenticated
  using ((select private.ima_pristup(gospodarstvo_id, 'vlasnik')));

-- operacije
create policy operacije_select on public.operacije for select to authenticated
  using ((select private.ima_pristup(private.gospodarstvo_cestice(cestica_id), 'citanje')));
create policy operacije_insert on public.operacije for insert to authenticated
  with check ((select private.ima_pristup(private.gospodarstvo_cestice(cestica_id), 'clan'))
              and created_by = (select auth.uid()));
create policy operacije_update on public.operacije for update to authenticated
  using ((select private.ima_pristup(private.gospodarstvo_cestice(cestica_id), 'clan')))
  with check ((select private.ima_pristup(private.gospodarstvo_cestice(cestica_id), 'clan')));
create policy operacije_delete on public.operacije for delete to authenticated
  using ((select private.ima_pristup(private.gospodarstvo_cestice(cestica_id), 'clan')));

-- ndvi_cache: vidiš statistiku samo za geometriju koju i sam imaš
create policy ndvi_cache_select on public.ndvi_cache for select to authenticated
  using (exists (select 1 from public.cestice c where c.geom_hash = ndvi_cache.geom_hash));

-- audit_log: samo admin
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select private.is_admin()));
