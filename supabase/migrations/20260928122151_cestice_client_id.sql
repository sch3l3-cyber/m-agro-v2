-- Offline-first: klijent generira UUID čestice (idempotentan sync, bez owner_id fallbacka — lekcija #2)
grant insert (id) on public.cestice to authenticated;
