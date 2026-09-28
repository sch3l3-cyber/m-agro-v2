# M-AGRO v2

Besplatna platforma za precizno poljodjelstvo za hrvatske OPG-ove. Druga iteracija — v1 ostaje u produkciji dok v2 ne dostigne paritet.

**Status:** Faze 0–2 uglavnom gotove (auth, čestice, karta, NDVI + trend + slojevi, uređivanje čestica). Sljedeće: Faza 3 (operacije, offline). Plan: `docs/brief/05_ROADMAP.md`. Odluke: `docs/adr/`. Postavljanje: `docs/SETUP.md`.

```
apps/web                 Next.js 16 → OpenNext → Cloudflare Worker `m-agro-v2-web`
apps/workers/sentinel    Sentinel Hub proxy (Faza 2) — Worker `m-agro-v2-sentinel`
packages/domain          Zod sheme, brendirani tipovi (WGS84Geometry), uloge — bez vendor ovisnosti
packages/eslint-config   pravilo: vendor SDK samo u src/lib/** (ADR-0003)
supabase/migrations      shema + RLS (ADR-0005)
supabase/tests           pgTAP RLS testovi
docs/                    brief (v2), ADR-ovi, setup
```

## Pravila
1. Vendor SDK samo u `apps/*/src/lib/**` — ESLint to blokira.
2. Svaka promjena sheme = nova migracija + RLS test u istom PR-u.
3. Geometrija prelazi granicu samo kao `WGS84Geometry` (`assertWGS84` / `reproject`) — lekcija #3.
4. Nikad `catch {}` bez logiranja — lekcija #14.
5. Nikad `owner_id`/"find-or-create" sync — insert bez id-a, update samo po id-u — lekcija #2.
