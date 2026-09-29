# Kontekst za Claude (Cowork sesije)

Repo je jedini izvor istine (lekcija #15). Prije rada pročitaj `README.md`, `docs/adr/*` i relevantni dio `docs/brief/`.

- Komunikacija s Ivanom: hrvatski. Kod/identifikatori: hrvatski nazivi domene (cestica, gospodarstvo, operacija), engleski za tehničke pojmove.
- Supabase dev projekt: `klgdptmjnwvlzygneqcf` (m-agro-v2-dev). v1 projekti (`zrmxnzpbxnvfkgommahp`, `ikycvxjeorogizdvquuo`) se NE diraju.
- Cloudflare: postojeći workeri `magro-wms` i `fragrant-flower-75cd` se NE diraju; v2 koristi prefiks `m-agro-v2-`.
- Migracije: novi fajl u `supabase/migrations/`. Primjenjuje ih SAMO CI (`supabase db push`) — nikad ručno preko MCP-a, inače db push pada na "Remote migration versions not found".
- Nakon DDL-a: pokreni RLS testove i Supabase advisors (security + performance).
- Prije završetka: `pnpm check` + `pnpm --filter @m-agro/web build:worker` + `node scripts/check-worker-size.mjs apps/web`.
- `docs/brief/` i `v1-*` materijali su referenca; odstupanja od briefa bilježi kao ADR.

## Smjer proizvoda (docs/PLAN.md, ADR-0009) — vrijedi za svaku novu funkciju
- Cilj: jednostavna evidencija za farmera + satelit kao bonus → strukturirani podaci → upozorenja → ML preporuke.
- **Jednostavni način je zadani**; nova funkcija ide u „Napredno” dok se ne dokaže. Upis radnje ≤ 3 dodira, radi offline.
- **Strukturirano**: katalozi i normalizirane jedinice umjesto slobodnog teksta; sezona po čestici; žetva s prinosom.
- **Besplatni budžet**: prije ugradnje procijeni opterećenje za 10/100/1000 gospodarstava (PLAN.md §5).
  Sentinel Hub (CDSE: 10 000 zahtjeva + 10 000 PU/mj, čuvar 9000) samo za interaktivne slike; masovna obrada u
  GitHub Actions iz javnih COG-ova. Worker ima 10 ms CPU — bez teške obrade u njemu.
- **Javni repo**: GitHub Actions logovi su javni — nikad ne ispisivati geometrije, nazive ni id-eve čestica/korisnika.
- **Privatnost**: novi podatak u modelu samo ako ga pokrivaju pravila privatnosti; usporedbe samo kao agregati (≥ 5 čestica).
- **Komercijalni prag**: Open-Meteo besplatni i Esri pločice bez ključa nisu za komercijalnu upotrebu — vidi PLAN.md §5.3.
