-- Brisanje vlastitog računa (GDPR čl. 17) bez secret ključa u web workeru.
-- security definer: briše SAMO račun onoga tko je prijavljen (auth.uid()).
-- Kaskada: profiles, memberships, app_admins → auth.users; čestice/operacije → gospodarstva.
create or replace function public.obrisi_moj_racun()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
begin
  if v_uid is null then
    raise exception 'Nisi prijavljen.' using errcode = '42501';
  end if;
  -- admin se ne briše iz aplikacije (zaštita od slučajnog gubitka jedinog admina)
  if exists (select 1 from public.app_admins where user_id = v_uid) then
    raise exception 'Administratorski račun se ne može obrisati iz aplikacije.' using errcode = '42501';
  end if;
  -- gospodarstvo koje je korisnik stvorio ili vodi, a ima druge članove, ne smije nestati s njim
  if exists (
    select 1 from public.gospodarstva g
    where (g.created_by = v_uid
           or exists (select 1 from public.memberships m
                      where m.gospodarstvo_id = g.id and m.user_id = v_uid and m.uloga = 'vlasnik'))
      and exists (select 1 from public.memberships m where m.gospodarstvo_id = g.id and m.user_id <> v_uid)
  ) then
    raise exception 'Gospodarstvo ima druge članove. Prvo ih ukloni ili prenesi vlasništvo.' using errcode = 'P0001';
  end if;

  select email into v_email from auth.users where id = v_uid;

  delete from public.gospodarstva g
  where g.created_by = v_uid
     or exists (select 1 from public.memberships m
                where m.gospodarstvo_id = g.id and m.user_id = v_uid and m.uloga = 'vlasnik');

  -- preostala članstva (u tuđim gospodarstvima) brišemo dok korisnik još postoji:
  -- audit trigger upisuje actor_id = auth.uid(), a to mora biti važeći FK u trenutku upisa
  delete from public.memberships where user_id = v_uid;

  delete from auth.users where id = v_uid;

  -- audit log ostaje (sigurnost), ali anonimiziran: actor_id je već null (on delete set null)
  update public.audit_log set actor_email = null where actor_email = v_email;
end;
$$;

revoke all on function public.obrisi_moj_racun() from public, anon;
grant execute on function public.obrisi_moj_racun() to authenticated;
