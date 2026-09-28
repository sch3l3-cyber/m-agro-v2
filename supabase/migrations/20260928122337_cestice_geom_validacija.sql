-- Lekcija #3: geometrija mora biti u WGS84 PRIJE nego što se izračunaju generirani
-- stupci (povrsina_ha). Bez ovoga neprojicirani EPSG:3765 metri padaju na
-- "numeric field overflow" umjesto na jasnu poruku.
-- BEFORE trigger se izvršava prije izračuna STORED generiranih stupaca.
create or replace function private.cestice_validiraj_geom()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  g extensions.geometry;
begin
  foreach g in array array[new.geom_arkod, new.geom_precizna] loop
    continue when g is null;
    if extensions.st_isempty(g) then
      raise exception 'Geometrija čestice je prazna' using errcode = '23514';
    end if;
    if extensions.st_xmin(g) < -180 or extensions.st_xmax(g) > 180
       or extensions.st_ymin(g) < -90 or extensions.st_ymax(g) > 90 then
      raise exception 'Geometrija nije u WGS84 (EPSG:4326) — reprojicirati prije spremanja (lib/proj4)'
        using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

create trigger cestice_validiraj_geom
  before insert or update of geom_arkod, geom_precizna on public.cestice
  for each row execute function private.cestice_validiraj_geom();

revoke all on function private.cestice_validiraj_geom() from public, anon;
