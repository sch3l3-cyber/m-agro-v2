-- Atomarna zamjena sažetka (psql). Ništa se ne ispisuje osim broja redaka.
\set ON_ERROR_STOP on
begin;
create temp table s (like private.arkod_cestice) on commit drop;
\copy s from 'arkod.csv' with (format csv)
truncate private.arkod_cestice;
insert into private.arkod_cestice select distinct on (arkod_id) * from s order by arkod_id;
insert into private.arkod_meta (id, osvjezeno, broj) values (true, now(), (select count(*) from private.arkod_cestice))
  on conflict (id) do update set osvjezeno = excluded.osvjezeno, broj = excluded.broj;
select broj as ucitano from private.arkod_meta;
commit;
