-- ADR-0010: dodavanje čestica dodirom na ARKOD + „Poveži s ARKOD-om”.
alter table public.cestice add column arkod_atributi jsonb check (arkod_atributi is null or jsonb_typeof(arkod_atributi) = 'object');
comment on column public.cestice.arkod_atributi is 'Iz javnog ARKOD sloja: nagib, visina, vodozaštitna/sanitarna zona, Natura 2000, navodnjavanje (ADR-0010). Bez jpaid-a.';

grant insert (arkod_atributi) on public.cestice to authenticated;
grant update (arkod_id, arkod_atributi) on public.cestice to authenticated;

-- Preklapanje nove geometrije s česticama gospodarstva (za „Već imaš ovu česticu” i povezivanje).
-- udio = presjek / manja od dviju površina (0–1). security invoker → RLS: vidiš samo svoja gospodarstva.
create or replace function public.cestice_preklapanje(p_gospodarstvo uuid, p_geom jsonb)
returns table (id uuid, naziv text, arkod_id text, udio real)
language sql
stable
security invoker
set search_path = ''
as $$
  with g as (
    select extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(p_geom::text), 4326)) as geom
  )
  select c.id, c.naziv, c.arkod_id,
    (extensions.st_area(extensions.st_intersection(extensions.st_makevalid(c.geom_arkod), g.geom)::extensions.geography)
      / nullif(least(extensions.st_area(c.geom_arkod::extensions.geography), extensions.st_area(g.geom::extensions.geography)), 0))::real as udio
  from public.cestice c, g
  where c.gospodarstvo_id = p_gospodarstvo
    and extensions.st_intersects(c.geom_arkod, g.geom)
  order by 4 desc nulls last
  limit 5;
$$;
revoke all on function public.cestice_preklapanje(uuid, jsonb) from public, anon;
grant execute on function public.cestice_preklapanje(uuid, jsonb) to authenticated;

-- Točka sigurno unutar čestice (za „Poveži s ARKOD-om” bez dodira). security invoker → RLS.
create or replace function public.cestica_tocka(p_cestica uuid)
returns table (lon double precision, lat double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select extensions.st_x(p), extensions.st_y(p)
  from (select extensions.st_pointonsurface(extensions.st_makevalid(geom_arkod)) as p from public.cestice where id = p_cestica) t;
$$;
revoke all on function public.cestica_tocka(uuid) from public, anon;
grant execute on function public.cestica_tocka(uuid) to authenticated;
