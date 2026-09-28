# 🚜 M-AGRO v2 — Cowork briefing

> **PROČITAJ OVAJ DOKUMENT PRVI.** Sve ostalo je referenca.

---

## Što gradimo

**M-AGRO** — besplatna web platforma za precizno poljodjelstvo, namijenjena hrvatskim obiteljskim gospodarstvima (OPG). Besplatna alternativa za John Deere Operations Center i Climate FieldView, prilagođena hrvatskom **ARKOD/MIBPG** sustavu (APPRRR).

**Tri glavne funkcije:**
1. **Sentinel-2 NDVI** — satelitske snimke, zdravlje vegetacije, povijesni trendovi
2. **Evidencija operacija** — sjetva, prihrana, zaštita, žetva, obrada
3. **VRA preporuke** — varijabilna primjena gnojiva (napredni feature)

**Tržište:** ~150.000 hrvatskih poljoprivrednika. Trenutno ~10 testnih gospodarstava u Đakovštini.

**Vlasnik / product owner:** Ivan Šalković, OPG M-agro, Satnica Đakovačka.

---

## Zašto nova iteracija

Postoji funkcionalna v1 (~5600 linija jedan `index.html` + Cloudflare Worker + Supabase). Sve **radi**, ali:

- Monolitni HTML → svaka izmjena rizik za "tihi crash" (null DOM reference)
- Nema TypeScripta → runtime greške koje bi type sustav uhvatio
- Nema testova → svaka regresija tek u produkciji
- State management ad-hoc (globalne varijable + localStorage)
- Ručni deploy (upload HTML na Cloudflare Pages)
- Nema CI/CD, nema staginga
- Sigurnost: Supabase anon key hardcoded, Sentinel credentials u Worker source

Sve to je **prihvatljivo za MVP fazu, blokira skaliranje** na 100+ korisnika.

---

## Cilj Cowork faze

Gradimo **v2 od nule** s modernom arhitekturom, **ali sa svim naučenim lekcijama** iz v1.

**Načela:**
1. **Type safety** — TypeScript svugdje
2. **Modularnost** — svaki feature svoj modul, ne monolit
3. **Sigurnost od prvog dana** — secrets management, RLS pravilno, rate limiting
4. **Testabilnost** — jedinični i E2E testovi za kritičnu logiku (VRA, sync, reprojekcija)
5. **Mobile-first** — >70% korisnika će biti na telefonu na traktoru
6. **Offline-capable** — polje često nema internet, PWA + IndexedDB
7. **Skalabilnost** — arhitektura koja podnosi 10k+ gospodarstava

---

## Financijski okvir

**Zero-budget MVP s migracijskom putanjom.** Sav stack ispod je free tier. Kod je strukturiran s apstrakcijama (DbClient, StorageClient, AuthClient, QueueClient) tako da migracija na paid ili self-hosted verzije bude nula code change.

**Detalji u `07_FREE_TIER_STRATEGY.md`** — obavezno pročitati prije Faze 2.

Jedini varijabilni trošak: Claude API pay-as-you-go (s hard cap-om).

## Predloženi tech stack (svi na free tieru)

| Sloj | Tehnologija | Free tier granica |
|------|-------------|-------------------|
| Frontend framework | **Next.js 14** (App Router) | Cloudflare Pages: 500 buildova/mj |
| Jezik | **TypeScript strict** | Free |
| UI | **Tailwind + shadcn/ui** | Free (open source) |
| State | **Zustand** + **TanStack Query v5** | Free |
| Karte | **MapLibre GL** | Free (open source) |
| Grafovi | **Recharts** | Free |
| Baza | **Supabase** (Postgres + PostGIS + Auth + Realtime) | 500 MB DB, 50k MAU |
| Auth | **Supabase Auth + MFA** (TOTP + WebAuthn) | Uključen |
| Authorization | **RLS + memberships tablica** | — |
| Object storage | **Cloudflare R2** | 10 GB + 1M reads/mj |
| KV cache | **Cloudflare KV** | 100k reads/dan |
| API proxy | **Cloudflare Workers** | 100k req/dan |
| AI | **Claude API** | Pay-as-you-go (cap: `AI_MONTHLY_BUDGET_USD`) |
| Testovi | **Vitest + Playwright** | Free |
| CI/CD | **GitHub Actions** | 2000 min/mj (private) |
| Monitoring | **Sentry Developer** | 5k errors/mj |
| Product analytics | **PostHog Cloud** | 1M events/mj |
| Email | **Resend** | 3k emails/mj |
| Uptime | **BetterStack** | 10 monitora |
| Weather | **Open-Meteo** | Neograničeno |
| Satellite | **Sentinel Hub** | 30k PU/mj (shared cache = 200-500 usera) |
| PWA | **next-pwa** | Free |

**Ukupni fiksni trošak: 0 USD/mj** (osim domenske registracije ~10 EUR/god).

---

## Redoslijed razvoja (predlažem)

### Faza 0: Temelji (sesija 1-2)
- Repo setup, TypeScript config, Tailwind, shadcn
- Supabase projekt, migracije (schema iz v1 kao startna točka)
- Cloudflare Pages + Worker skeleton
- GitHub Actions CI (build + test + deploy)
- Osnovna auth (Supabase Auth UI komponente)

**Deliverable:** deploy-ana prazna app s login/registracijom.

### Faza 1: Data foundation (sesija 3-4)
- Modeli: `Gospodarstvo`, `Cestica`, `Operacija` (Zod schemas)
- Reprojekcija EPSG:3765 → WGS84 (proj4) — **portati iz v1**
- Admin upload GeoJSON čestica (3 moda: dodaj/ažuriraj/zamijeni)
- Farmer učitava svoje čestice iz cloud-a

**Deliverable:** ulogirani farmer vidi svoje čestice na karti.

### Faza 2: NDVI (sesija 5-6)
- Sentinel Hub Worker (portati iz v1, **BEZ `resx/resy`**)
- NDVI overlay + statistike + boje po sezoni
- Kalendar dostupnih snimaka
- **Povijesni trend graf** (reimplementirati iz v1)

**Deliverable:** farmer klikne česticu → vidi NDVI + statistike + povijest.

### Faza 3: Evidencija operacija (sesija 7-8)
- CRUD forma (mobile-first)
- Offline-first sa TanStack Query mutations + IndexedDB
- Sync indikator, resolve conflicts
- PDF export (jsPDF)

**Deliverable:** farmer u polju bez interneta upiše prihranu, sync kad se vrati.

### Faza 4: VRA (sesija 9-10)
- Jasno odvojena logika (`/lib/vra/`) — testirati unit
- 3/5/7 zona (fixed od v1)
- Zone i postoci pravilno usklađeni
- ISOXML export za rasipač (Faza 3 dugoročno)

**Deliverable:** VRA preporuke sa točnim postocima i vizualnim prikazom.

### Faza 5: AI savjetnik + polish (sesija 11+)
- Claude API integracija
- PWA manifest + service worker
- Multi-gospodarstvo per korisnik
- Analitika, monitoring

---

## Što DEFINITIVNO portamo iz v1

Ove stvari su testirane, rade, ne izmišljati ponovo:

1. **Reprojekcija logika** (proj4, EPSG:3765/3766/31276/32633 → WGS84)
2. **Sentinel Hub Worker** — statistics API bez resx/resy, sezonski kontrast
3. **NDVI paleta** — user-friendly zelena (ne thermal)
4. **Supabase shema** (profiles, gospodarstva, cestice, operacije, RLS pravila)
5. **`syncToCloud` pravilo:** SAMO `cloud_id`, nikad `owner_id` fallback
6. **Admin upload** logika s 3 moda (merge/update/replace)
7. **ARKOD GeoJSON parsing:** `home_name` za naziv, `land_use_id` → `lpisName()` za kulturu
8. **JD Operations Center stil** karte — obojeni poligoni, bez markera, highlight na klik
9. **QGIS Script Generator** (`arkod-app/`) — ostaje standalone alat, ne dio glavne app

---

## Kritične "ne ponavljati" lekcije

Detaljno u `04_LEKCIJE.md`, ali brzi sažetak:

1. **NIKAD** `resx/resy` u Sentinel Statistics API (vraća 1 piksel)
2. **NIKAD** `owner_id` fallback u syncToCloud (briše čestice)
3. **NIKAD** čitati DOM element bez null-check nakon UI refactora
4. **UVIJEK** reproject GeoJSON prije spremanja u bazu
5. **UVIJEK** provjeriti JS sintaksu prije deploya (u v2: `tsc --noEmit` u CI)

---

## Sigurnost — mora biti dio arhitekture

Ne kao dodatak nakon MVP. Ključne stavke od dana 1:

- **Secrets:** Cloudflare env vars ili Secrets Manager, NIKAD u sourceu
- **Supabase RLS:** testovi za svaku tablicu (farmer ne smije vidjeti tuđe)
- **API rate limiting:** per-user quotas na Worker endpointima (Sentinel Hub košta $)
- **CSRF:** Next.js server actions ili tokens
- **Input validation:** Zod na svim granicama (UI → API → DB)
- **Auth flows:** provjera email verify, password reset, session refresh
- **Audit log:** admin akcije (upload, ažuriranje) idu u audit tablicu
- **Backup:** dnevni Supabase snapshot, retention policy

---

## Skalabilnost — arhitekturne odluke koje treba donijeti odmah

1. **Multi-tenant model:** jedan Supabase projekt s RLS ili po-tenantu?
   → Za starter: **jedan projekt, RLS na `owner_id`**. Prelazi na po-tenant tek na 1k+ gospodarstava.

2. **Sentinel Hub kvote:** trenutna free tier je 30k procesing jedinica/mj.
   → Cache NDVI slika u Cloudflare R2 (14 dana), share među korisnicima za iste čestice/datume.

3. **Storage GeoJSON-a:** u Supabase JSONB ili PostGIS `geometry`?
   → **PostGIS** — prostorni indeksi, spatial queries, standard.

4. **Realtime:** trebaju li dva korisnika istog gospodarstva vidjeti izmjene uživo?
   → Za Fazu 1: **ne**. Za Fazu 3 (multi-user OPG): Supabase Realtime channel po `gospodarstvo_id`.

---

## Kako početi prvu Cowork sesiju

**Prompt za prvi razgovor:**

> Krećem novu iteraciju M-AGRO projekta u Cowork. Priložio sam briefing paket:
> - `00_START_HERE.md` — pregled projekta i plan
> - `01_ARHITEKTURA_v2.md` — predložena nova arhitektura
> - `02_MIGRACIJA_IZ_v1.md` — što portamo, što ostavljamo
> - `03_SIGURNOST.md` — sigurnosni zahtjevi
> - `04_LEKCIJE.md` — kritični bugovi iz v1 koje NE smijemo ponoviti
> - `reference/` — v1 kod (`worker.js`, `index.html`) i dokumentacija za referencu
>
> Molim te da za početak:
> 1. Pregledaš briefing i postaviš pitanja o nejasnoćama
> 2. Predložiš repo strukturu (folderi, konfiguracije)
> 3. Postavimo Faze 0: temelji (repo, TypeScript, Tailwind, Supabase, CI/CD)
>
> Ne miješati feature razvoj u Fazu 0 — samo infrastruktura.

---

## Prilog — sadržaj brief paketa

```
cowork-brief/
├── 00_START_HERE.md              ← ovaj dokument
├── 01_ARHITEKTURA_v2.md          ← detaljna nova arhitektura
├── 02_MIGRACIJA_IZ_v1.md         ← što portamo iz v1
├── 03_SIGURNOST.md               ← sigurnosni zahtjevi
├── 04_LEKCIJE.md                 ← kritični bugovi iz v1
├── 05_ROADMAP.md                 ← faze razvoja, timeline
├── 07_FREE_TIER_STRATEGY.md      ← zero-budget MVP + migracijske putanje
└── reference/                    ← v1 za referencu
    ├── v1-arhitektura.md
    ├── v1-handoff.md
    ├── v1-lekcije.md
    ├── v1-roadmap.md
    ├── v1-ui-audit.md
    └── v1-ui-dizajn.md
```
