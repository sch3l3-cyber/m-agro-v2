# ADR-0006: Odstupanja od roadmapa u Fazama 1–2

**Status:** prihvaćeno (2026-09-28)

| Roadmap (05_ROADMAP) | Odluka u v2 | Zašto |
|---|---|---|
| Admin uploada GeoJSON za korisnika | Farmer sam uvozi (dodaj / ažuriraj / zamijeni) | Manje ručnog rada; autorizaciju drži RLS (`uvezi_cestice`, security invoker). Admin može isto preko članstva. |
| Playwright suite za RLS | pgTAP u bazi (`supabase/tests/database/*.sql`, CI job `db`) | Brže, bez browsera, testira baš politike. E2E ostaje za UI tokove. |
| Cache ključ `arkod_id:datum` | `geom_hash:datum` | ADR-0002 — radi i za KML čestice bez ARKOD-a; promjena oblika = novi ključ. |
| Slike u R2 `ndvi-shared/...` | Cloudflare Cache API (30 dana, ključ geom_hash/datum/sloj) | Nula postavljanja i troška. Cache API je po lokaciji i nije trajan — prihvatljivo jer se slika može ponovo izraditi; statistike su trajne u Postgresu. R2 kad potrošnja PU to opravda. |
| Rate limit 30/h po korisniku (KV) | 30/min po korisniku (Workers Rate Limiting) + globalni mjesečni brojač u Postgresu (`sentinel_potrosi`, zadano 20000 jedinica) | Workers RL je besplatan i bez KV pisanja; globalni brojač je atomaran. Iscrpljena kvota → 503, cache i dalje radi. Brojač je fail-open (Supabase nedostupan ne ruši NDVI). |
| Batch API (više poligona odjednom) | Trend kroz sezonu: jedan Statistical API poziv s P1D intervalima za sve datume koji nisu u cacheu | Najveća ušteda je po vremenu, ne po česticama; farmer gleda jednu česticu. Batch po česticama ostaje opcija za noćno predgrijavanje. |
| Višegodišnji trend (kvartali od 2017.) | Zasad sezonski trend (150 dana, svaka čista snimka) | Sezona je ono što farmer koristi za odluke; višegodišnji graf dolazi kasnije (P3M intervali, isti cache). |
| Slojevi NDVI, Contrasted, TrueColor, NDMI, NDRE | Svi, uz SCL masku oblaka na svima | NDMI/NDRE koriste 20 m kanale (B11/B05) — piksel je krupniji, to piše u legendi. |
