-- ADR-0011 (dopuna): MIBPG je javan pa nije dokaz vlasništva.
-- Jedinstvenost MIBPG-a vrijedi samo za PROVJERENA gospodarstva — inače bi prvi koji upiše tuđi MIBPG blokirao pravog vlasnika.
alter table public.gospodarstva add column provjereno boolean not null default false;
comment on column public.gospodarstva.provjereno is 'MIBPG potvrđen (zasad ručno, admin). Korisnik ga ne može sam postaviti.';

drop index if exists public.gospodarstva_mibpg_uq;
create unique index gospodarstva_mibpg_provjereno_uq on public.gospodarstva (mibpg) where mibpg is not null and provjereno;
create index gospodarstva_mibpg_idx on public.gospodarstva (mibpg) where mibpg is not null;
-- namjerno BEZ grant update (provjereno) za authenticated
