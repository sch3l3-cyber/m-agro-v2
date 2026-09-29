-- Faza 6 (docs/PLAN.md, ADR-0009): jednostavni / napredni način sučelja po korisniku.
-- Postojeći računi ostaju u naprednom (ne mijenjamo im ekran preko noći); novi dobivaju jednostavni.
alter table public.profiles
  add column nacin text not null default 'napredni' check (nacin in ('jednostavni', 'napredni'));
alter table public.profiles alter column nacin set default 'jednostavni';

-- korisnik smije mijenjati samo svoj način (RLS profiles_update već ograničava na vlastiti red)
grant update (nacin) on public.profiles to authenticated;
