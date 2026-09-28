# ADR-0004: Email linkovi preko `token_hash`, ne PKCE `code`

**Status:** prihvaćeno (2026-09-28)

Farmer se često registrira na računalu, a email otvori na mobitelu. PKCE `code` flow tada pada jer
code verifier cookie postoji samo u prvom browseru. Zato email predlošci (`supabase/templates/*.html`)
šalju `token_hash`, a `/auth/potvrda` ga verificira s `verifyOtp()`. `code` ostaje podržan kao fallback.

Predlošci se na hostani projekt šalju s `supabase config push` (ili ručno u Dashboard → Auth → Email Templates).
