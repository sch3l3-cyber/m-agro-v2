-- ADR-0011 ispravak: jpaid NIJE oznaka gospodarstva (361 450 čestica → samo 2 015 grupa; grupa ~800 čestica ≈ područje).
-- „Dodaj cijelo gospodarstvo” preko jpaid-a bi nudio tuđe čestice → funkcija se ukida.
drop function if exists public.arkod_gospodarstvo(bigint);
drop table if exists private.arkod_grupni_upiti;
comment on column private.arkod_cestice.nositelj is 'Interni indeks ARKOD atributa jpaid — prostorna grupa (npr. katastarska općina), NE gospodarstvo. Ne koristiti za grupiranje po korisniku.';
