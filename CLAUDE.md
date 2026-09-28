# Kontekst za Claude (Cowork sesije)

Repo je jedini izvor istine (lekcija #15). Prije rada pročitaj `README.md`, `docs/adr/*` i relevantni dio `docs/brief/`.

- Komunikacija s Ivanom: hrvatski. Kod/identifikatori: hrvatski nazivi domene (cestica, gospodarstvo, operacija), engleski za tehničke pojmove.
- Supabase dev projekt: `klgdptmjnwvlzygneqcf` (m-agro-v2-dev). v1 projekti (`zrmxnzpbxnvfkgommahp`, `ikycvxjeorogizdvquuo`) se NE diraju.
- Cloudflare: postojeći workeri `magro-wms` i `fragrant-flower-75cd` se NE diraju; v2 koristi prefiks `m-agro-v2-`.
- Migracije: novi fajl u `supabase/migrations/`. Primjenjuje ih SAMO CI (`supabase db push`) — nikad ručno preko MCP-a, inače db push pada na "Remote migration versions not found".
- Nakon DDL-a: pokreni RLS testove i Supabase advisors (security + performance).
- Prije završetka: `pnpm check` + `pnpm --filter @m-agro/web build:worker` + `node scripts/check-worker-size.mjs apps/web`.
- `docs/brief/` i `v1-*` materijali su referenca; odstupanja od briefa bilježi kao ADR.
