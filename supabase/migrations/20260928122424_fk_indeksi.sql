-- Supabase advisor 0001: FK bez indeksa (brisanje auth.users bi radilo seq scan)
create index gospodarstva_created_by_idx on public.gospodarstva (created_by);
create index operacije_created_by_idx on public.operacije (created_by);
