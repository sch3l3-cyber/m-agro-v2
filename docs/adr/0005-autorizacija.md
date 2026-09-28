# ADR-0005: Autorizacija — memberships + app_admins

**Status:** prihvaćeno (2026-09-28)

- **Rupa u briefu:** `profiles.role` + `profiles_own FOR ALL` → farmer može `UPDATE profiles SET role='admin'`.
  Admin je zato u zasebnoj tablici `app_admins` na koju `authenticated` nema INSERT/UPDATE/DELETE grant.
- Pristup gospodarstvu ide isključivo preko `memberships (gospodarstvo_id, user_id, uloga)`;
  uloge `citanje < clan < vlasnik` (enum, redoslijed = razina). Kreator automatski postaje `vlasnik` (trigger).
- Gospodarstvo ne može ostati bez vlasnika (trigger `zadnji_vlasnik_guard`).
- Helper funkcije su u schemi `private` (nije izložena API-ju), `SECURITY DEFINER` + prazan `search_path`.
- Column-level grantovi: klijent ne može mijenjati `email`, `created_by`, `povrsina_ha`, `geom_hash`.
- Testovi: `supabase/tests/database/rls.test.sql` (25 pgTAP testova, CI job `db`).
