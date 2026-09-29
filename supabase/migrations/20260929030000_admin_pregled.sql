-- Admin pregled (05_ROADMAP Faza 0/2: quota monitoring; 03_SIGURNOST: alarm na 80 % kvote).
-- Jedna funkcija, samo za app_admins (provjera UNUTAR funkcije; security definer čita private/auth).
-- Farmer dobiva 42501 — ne vidi ni brojke drugih korisnika.
create or replace function public.admin_pregled(p_limit_kvote integer default 20000)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  -- admin s uključenim MFA-om mora biti aal2 (isto pravilo kao restriktivne politike)
  if not (select private.is_admin()) or not (select private.mfa_ok()) then
    raise exception 'samo admin' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'kvota', jsonb_build_object(
      'mjesec', to_char(date_trunc('month', now()), 'YYYY-MM'),
      'potroseno', coalesce((select jedinice from private.sentinel_potrosnja where mjesec = date_trunc('month', now())::date), 0),
      'limit', p_limit_kvote,
      'povijest', coalesce((select jsonb_agg(jsonb_build_object('mjesec', to_char(mjesec, 'YYYY-MM'), 'jedinice', jedinice) order by mjesec desc)
                            from (select * from private.sentinel_potrosnja order by mjesec desc limit 12) s), '[]'::jsonb)
    ),
    'brojke', jsonb_build_object(
      'korisnika', (select count(*) from auth.users),
      'korisnika_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'mfa_ukljuceno', (select count(distinct user_id) from auth.mfa_factors where status = 'verified'),
      'gospodarstava', (select count(*) from public.gospodarstva),
      'cestica', (select count(*) from public.cestice),
      'hektara', (select coalesce(round(sum(povrsina_ha)::numeric, 1), 0) from public.cestice),
      'operacija', (select count(*) from public.operacije),
      'operacija_30d', (select count(*) from public.operacije where created_at > now() - interval '30 days'),
      'ndvi_cache', (select count(*) from public.ndvi_cache)
    ),
    'audit', coalesce((select jsonb_agg(a) from (
      select created_at, actor_email, action, target_type, target_id from public.audit_log order by created_at desc limit 50
    ) a), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

revoke all on function public.admin_pregled(integer) from public, anon;
grant execute on function public.admin_pregled(integer) to authenticated;
