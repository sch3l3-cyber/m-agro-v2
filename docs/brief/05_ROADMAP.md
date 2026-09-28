# 🗺 M-AGRO v2 — Roadmap

> Faze razvoja, deliverables, timeline. Koristi uz `00_START_HERE.md`.

---

## Vizija u tri riječi

**Besplatno. Hrvatski. Profesionalno.**

---

## Faza 0 — Temelji (2 tjedna)

**Cilj:** Deploy-ana prazna aplikacija s login/registracijom + apstraktni klijenti.

**Deliverables:**
- [ ] Monorepo (pnpm workspaces): `apps/web`, `apps/workers/*`, `packages/*`
- [ ] Next.js 14 + TypeScript strict + Tailwind + shadcn/ui
- [ ] **Apstraktni klijenti (`lib/db`, `lib/storage`, `lib/auth`, `lib/queue`, `lib/features`)** — s trenutnim implementacijama, spremni za buduću zamjenu
- [ ] ESLint rule: zabrana direktnih importa vendor SDK-ova van `lib/`
- [ ] Supabase projekt (dev) + inicijalna shema + migration workflow
- [ ] Auth flow: register, login, password reset, email verification, MFA setup (TOTP)
- [ ] Cloudflare R2 bucket + StorageClient implementacija
- [ ] GitHub repo + GitHub Actions (typecheck + test + deploy Cloudflare Pages)
- [ ] Sentry integriran + basic release tracking
- [ ] PostHog integriran (osnovni tracking, feature flags kroz env vars za sada)
- [ ] Osnovna layout struktura (header + sidebar mobile + auth guard)
- [ ] Quota monitoring skeleton (`/admin/quotas` — samo Supabase i R2 za sad)

**Success kriteriji:**
- `pnpm dev` radi lokalno
- `git push main` → auto deploy na `v2.m-agro.hr`
- Novi korisnik može registrirati račun, verificirati email, postaviti MFA, logirati se
- Sentry hvata test error
- ESLint blokira `import { createClient } from '@supabase/supabase-js'` van `lib/db/`
- Quota dashboard pokazuje trenutne kvote (i ako su 0%)

---

## Faza 1 — Data foundation (3 tjedna)

**Cilj:** Farmer vidi svoje čestice na karti.

**Deliverables:**
- [ ] Domain modeli (Zod schemas): Gospodarstvo, Cestica, Operacija
- [ ] `lib/proj4/` — reprojekcija EPSG:3765/3766/31276/32633 → WGS84
- [ ] `lib/geojson/arkod.ts` — ARKOD GeoJSON parsing (`home_name`, `land_use_id`)
- [ ] Admin panel: upload GeoJSON za korisnika (3 moda: merge/update/replace)
- [ ] Farmer dashboard: lista + karta čestica (JD stil, MapLibre)
- [ ] Lista ↔ karta dvosmjerno povezivanje (highlight)
- [ ] Multi-gospodarstvo dropdown u header-u
- [ ] RLS pravila + Playwright test suite za RLS

**Success kriteriji:**
- Admin uploada Ivanov GeoJSON → Ivan se logira → vidi svoje čestice
- Klik na česticu u listi → highlight na karti (i obratno)
- Testovi: RLS drži se Farmer A ne vidi Farmer B

---

## Faza 2 — NDVI (3 tjedna)

**Cilj:** Farmer klikne česticu → vidi NDVI + statistike + povijest.

**⚠️ PREREQUISITE:** Prije bilo kakvih Sentinel poziva u produkciji, implementirati **shared cache strategiju** iz `07_FREE_TIER_STRATEGY.md`. Bez toga free tier kvota puca na 20 korisnika.

**Deliverables:**
- [ ] **Shared cache layer** — key = `arkod_id:datum` (ne `user_id:cestica_id:datum`)
  - Postgres `ndvi_cache` tablica — dijeljena između korisnika
  - R2 `ndvi-shared/{arkod_id}/{datum}/{layer}.png` za slike
  - Cache hit prije Sentinel poziva
- [ ] Cloudflare Worker `sentinel/` — svi endpointi iz v1 portirani, s rate limitingom
- [ ] **Batch API** — multi-polygon Sentinel poziv umjesto N pojedinačnih
- [ ] Rate limiter (Cloudflare KV): 30 poziva/h po korisniku, 20k/mj globalno
- [ ] Quota monitoring dashboard za admina
- [ ] NDVI overlay na karti (MapLibre raster source)
- [ ] Selector za sloj (NDVI, Contrasted, TrueColor, NDMI, NDRE, ...)
- [ ] Kalendar dostupnih snimaka (Sentinel Catalog API)
- [ ] Statistike panel: mean, min, max, stdev, percentili + kvalitativna kategorija
- [ ] Višegodišnji trend graf (kvartalni prosjeci od 2017.)
- [ ] Sezonski kontrast fallback (iz v1)
- [ ] Graceful degradation kad se kvota bliži limitu

**Success kriteriji:**
- Otvori česticu → NDVI slika se učita u < 3 s
- Statistike konzistentne sa slikom
- Graf povijesti prikazuje realne kvartale
- Rate limit blokira >30 statistika/h po korisniku
- **Cache hit rate > 60%** nakon prvog tjedna produkcije
- Sentinel Hub quota < 80% kod 100 aktivnih korisnika

---

## Faza 3 — Evidencija operacija (3 tjedna)

**Cilj:** Farmer u polju bez interneta upiše prihranu, sync kad se vrati.

**Deliverables:**
- [ ] CRUD forma operacija (mobile-first, veliki touch targets)
- [ ] Vrste operacija: sjetva, prihrana, zaštita, žetva, obrada (+ polja specifična)
- [ ] Offline mode: PWA manifest + service worker + IndexedDB persister
- [ ] Mutation queue: offline unosi u localu, sync na online
- [ ] Sync indikator u header-u (koliko čeka + status)
- [ ] Popis operacija po čestici, filtriranje, pretraga
- [ ] Brisanje s undo (5s)
- [ ] Datepicker na hrvatskom

**Success kriteriji:**
- Aeroplan mode: upiše 3 operacije, ništa ne padne, sync se dogodi kad se vrati online
- Instaliranje kao PWA na iOS + Android radi
- Test: 100 operacija, sync završi u < 10s

---

## Faza 4 — VRA (2 tjedna)

**Cilj:** VRA preporuke s točnim postocima i vizualnim prikazom.

**Deliverables:**
- [ ] `lib/vra/` modul: pure funkcije za sve izračune (3/5/7 zona)
- [ ] Unit testovi: 100% pokriveni edge case-ovi
- [ ] VRA mapa: baza (Contrasted NDVI) + zone overlay + hover tooltip
- [ ] Postoci u panelu = postoci na karti (bit-identično, iz iste funkcije)
- [ ] Selektor doze (kg/ha) + realniji rasponi (±20% za 3 zone)
- [ ] CSV export VRA planiranja
- [ ] Vremenska prognoza (Open-Meteo) s preporukom za prihranu

**Success kriteriji:**
- 5 i 7 zona rade jednako pouzdano kao 3
- Vizualni prikaz na karti = brojevi u panelu
- Unit testovi svi zeleni

---

## Faza 5 — Polish + AI (4 tjedna)

**Cilj:** Launch spreman.

**Deliverables:**
- [ ] AI savjetnik: Claude API preko Workera, kontekstualan (NDVI + operacije + vrijeme)
- [ ] Streaming odgovori
- [ ] PDF export: kartica čestice + godišnji izvještaj OPG-a
- [ ] Realtime (Faza 3): više korisnika istog OPG-a vidi izmjene uživo
- [ ] i18n priprema (samo HR za MVP, ali struktura za EN/DE)
- [ ] Landing page (marketing)
- [ ] Privacy Policy + Terms of Service
- [ ] Audit log UI za admina
- [ ] Performance audit (Lighthouse > 90 na svim kategorijama)
- [ ] Security audit checklista prošla

**Success kriteriji:**
- Lighthouse ≥ 90 na mobile
- AI savjetnik daje smislene odgovore na 5 testnih scenarija
- Prva grupa od 20 realnih testera prihvati na produkciji

---

## Post-launch (Faza 3 dugoročno)

**Ideje za nakon launcha:**

- **RTK preciznost** (±2-5 cm) — `geom_precizna` polje na česticama za korisničku korekciju
- **ISOXML export** — za direktan import u rasipače (John Deere, Amazone, Kverneland)
- **Lokalni ML model** — predikcija polijeganja uljane repice
  - Trening podaci: NDVI history + rezultati (poleglo/nije) iz Ivanovih parcela + drugih farmera
  - Ključni uvid iz v1: visoki NDVI u cvatnji uljane repice = PREDIKTOR POLIJEGANJA, ne prinosa
- **Meteo stanice integracija** — API sa lokalnih stanica
- **Zdravstvena karta tla** — SoilGrids API integracija
- **Katastarski podaci** — DKP overlay (uredjenazemlja.hr)
- **Kalendar polj. operacija** — automatske preporuke po BBCH fazama
- **Foto galerija** — po čestici, geolocirano
- **Financijska kalkulacija** — trošak/prihod po čestici
- **APPRRR integracija** — auto-sync ARKOD promjena

---

## Timeline sažetak

| Faza | Trajanje | Kumulativno |
|------|----------|-------------|
| 0. Temelji | 2 tj. | 2 tj. |
| 1. Data foundation | 3 tj. | 5 tj. |
| 2. NDVI | 3 tj. | 8 tj. |
| 3. Evidencija | 3 tj. | 11 tj. |
| 4. VRA | 2 tj. | 13 tj. |
| 5. Polish + AI | 4 tj. | 17 tj. |

**Realno:** 4-5 mjeseci uz Ivanov paralelni rad na polju + testiranje s farmerima. 6 mjeseci s bufferom.

---

## Uspješni launch = definicije

**Minimum Viable Product (MVP):**
- Faze 0-3 završene + osnovni VRA (samo 3 zone)
- 10 aktivnih testnih gospodarstava
- 0 kritičnih bugova > 24h neriješenih

**Full launch:**
- Sve faze završene
- 50+ testnih gospodarstava
- Landing page + marketing
- APPRRR partnership započet (opcija)
- Featured u poljop. medijima (Agroklub, Poljoprivredni info)

---

## Rizici i mitigacije

| Rizik | Impact | Mitigacija |
|-------|--------|------------|
| Sentinel Hub free tier iscrpljen | Aplikacija ne radi | Aggressive caching + rate limits + upgrade plana ($$$) |
| Ivan nema vremena za testiranje | Faze zapinju | Angažiraj 2-3 lokalna testera + payment (npr. besplatan pristup zauvijek) |
| APPRRR promijeni ARKOD API | Upload puca | Verzioniranje parser-a + integration testovi na živim podacima |
| Cowork context reset | Gubljenje tijekom razvoja | Repo je SSOT. Sve u git-u. Docs updated s kodom. |
| Supabase downtime | Aplikacija ne radi | Health check + status page + fallback poruka |
| MapLibre migracija loše prošla | UX regresija | Prototip u Fazi 1, side-by-side s Leaflet fallbackom |

---

## Metrike koje pratimo

**Tehničke:**
- Lighthouse score (mobile)
- Time to first NDVI (< 3s cilj)
- Sync latency (< 2s cilj)
- Error rate (< 0.5% cilj)
- Test coverage (> 70% cilj za `lib/`)

**Poslovne:**
- Broj aktivnih gospodarstava
- Prosječan broj čestica po korisniku
- Prosječan broj operacija po korisniku po mjesecu
- Retention (D7, D30)
- NPS (Net Promoter Score) — kvartalna anketa

---

## Post-mortem template (za buduće)

Nakon svakog većeg incidenta:

```markdown
# Post-mortem: <naslov> (<datum>)

## Sažetak
Što se dogodilo u jednoj rečenici.

## Timeline
- HH:MM — Prvi symptom
- HH:MM — Detected
- HH:MM — Mitigation
- HH:MM — Resolved

## Uzrok (RCA)
Zašto se dogodilo.

## Impact
Koliko korisnika, koliko dugo.

## Što je pomoglo
Što smo dobro učinili.

## Što nije pomoglo
Gdje smo zapeli.

## Action items
- [ ] Konkretne izmjene koda / procesa
- [ ] Odgovorna osoba
- [ ] Deadline
```
