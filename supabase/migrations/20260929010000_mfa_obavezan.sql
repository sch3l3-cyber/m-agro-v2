-- MFA (TOTP) — ako korisnik ima potvrđen faktor, sesija MORA biti aal2 za bilo kakav pristup podacima.
-- Restriktivne politike se AND-aju s postojećima: ne daju novi pristup, samo ga uvjetuju.
-- Bez ovoga bi lozinka bez koda (aal1 JWT) i dalje čitala podatke izravno preko PostgREST-a.
create or replace function private.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      );
$$;
grant execute on function private.mfa_ok() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'gospodarstva', 'memberships', 'cestice', 'operacije', 'ndvi_cache', 'audit_log', 'app_admins'] loop
    execute format(
      'create policy mfa_obavezan on public.%I as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()))',
      t);
  end loop;
end $$;
