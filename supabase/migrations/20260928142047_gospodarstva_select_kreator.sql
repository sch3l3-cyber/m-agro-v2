-- Bug: INSERT ... RETURNING (PostgREST .insert().select()) provjerava SELECT policy na novom retku
-- PRIJE nego AFTER trigger doda vlasnika u memberships → "new row violates row-level security policy".
-- Kreator smije vidjeti gospodarstvo koje je sam kreirao.
drop policy gospodarstva_select on public.gospodarstva;
create policy gospodarstva_select on public.gospodarstva for select to authenticated
  using (created_by = (select auth.uid()) or (select private.ima_pristup(id, 'citanje')));
