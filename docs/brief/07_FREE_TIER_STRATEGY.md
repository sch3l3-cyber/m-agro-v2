# 💰 M-AGRO v2 — Free tier strategija & migracijske putanje

> **Načelo:** Gradimo kao da nema para, ali sa strukturom koja izdrži skaliranje.
> Nula lock-ina, nula prepisivanja pri migraciji.

---

## Stack pregled — nulti trošak

| Sloj | Servis | Free tier | Dovoljno za |
|------|--------|-----------|-------------|
| Hosting frontend | Cloudflare Pages | 500 buildova/mj, unlimited req | Zauvijek za MVP |
| Edge API | Cloudflare Workers | 100k req/dan | ~100 aktivnih usera |
| Storage | Cloudflare R2 | 10 GB + 1M reads/mj | ~500 usera s NDVI cacheom |
| KV cache | Cloudflare KV | 100k reads/dan, 1k writes/dan | Rate limits + sessions |
| Baza | Supabase | 500 MB DB, 50k MAU, 2 GB bandwidth | ~500 usera |
| Auth + MFA | Supabase Auth | Uključen, TOTP + WebAuthn | Nema limita |
| Sentinel Hub | Copernicus Data Space | 30k PU/mj (~1000 NDVI slika) | 20-30 usera BEZ dijeljenja cachea; 200+ SA dijeljenjem |
| Weather | Open-Meteo | Neograničeno, bez ključa | Zauvijek |
| Katastar | uredjenazemlja.hr WFS | Neograničeno | Zauvijek |
| ARKOD | APPRRR WFS | Neograničeno | Zauvijek |
| Errors | Sentry Developer | 5k errors/mj, 10k perf events | Rani MVP |
| Analytics | PostHog Cloud | 1M events/mj, 5k session replays | 500+ aktivnih usera |
| Email | Resend | 3k emails/mj, 100/dan | Notifikacije + reset |
| Repo + CI | GitHub Free | 2000 min Actions/mj (private) | Trenutni tempo |
| Monitoring | BetterStack Free | 10 monitora, 3 min interval | Kritični endpointi |
| AI | Claude API | Pay-as-you-go | Jedini varijabilni trošak |

**Ukupni fiksni trošak: 0 USD/mj.** Samo Claude API po pozivu.

---

## Sentinel Hub — najveći izazov, najpametnija strategija

30k processing units/mj = ~1000 NDVI slika po mjesecu.
Bez pametne strategije: 20-30 usera i kvota je iscrpljena.
Sa strategijom ispod: **200-500 usera na free tieru**.

### Strategija 1: Shared cache po ARKOD ID + datum

Ista čestica ima isti NDVI za sve korisnike. Ako farmer A traži svoju česticu 15.5., a farmer B ima istu česticu (npr. dijele njivu s bratom, ili gledaju kroz cache za istu katastarsku općinu), samo jedan poziv Sentinelu.

```typescript
// lib/sentinel/cache.ts
async function getNDVIStats(
  arkodId: string,
  datum: string,
  geometry: Polygon,
  env: Env
): Promise<NDVIStats> {
  const cacheKey = `ndvi_stats:${arkodId}:${datum}`;

  // 1. Provjeri Postgres cache (persistentan, dijeljen)
  const cached = await db.ndvi_cache.findOne({ arkod_id: arkodId, datum });
  if (cached) return cached.stats;

  // 2. Rate limit check
  await enforceUserRateLimit(env.currentUserId);

  // 3. Poziv Sentinelu
  const stats = await sentinelHub.getStatistics(geometry, datum);

  // 4. Persistiraj — DIJELJENO za sve future upite iste čestice
  await db.ndvi_cache.insert({
    arkod_id: arkodId,
    datum,
    stats,
    created_at: new Date()
  });

  return stats;
}
```

### Strategija 2: R2 shared cache za slike

```
r2://ndvi-shared/{arkod_id}/{datum}/{layer}.png
```

Ista slika za sve korisnike koji gledaju istu česticu. R2 free tier: 1M reads/mj — više nego dovoljno.

### Strategija 3: Batch requests

Farmer klikne "Analiziraj svih 50 mojih čestica za zadnji tjedan":
- **Loše:** 50 pojedinačnih Sentinel poziva
- **Dobro:** grupiranje po bbox-u regije, jedan multi-polygon Sentinel poziv, raspodjela rezultata na čestice

Sentinel Hub Statistics API podržava multi-geometry request — koristimo.

### Strategija 4: Pre-warm popularnih datuma

Cron job svakih 6h:
- Provjeri koji su datumi Sentinel-2 flyby-ova ove sezone za Đakovštinu
- Za svaki datum, provjeri koje ARKOD čestice imaju aktivne korisnike
- Pre-fetch stats za sve u pozadini kroz noć (rate limited)

Korisnik ujutro otvori app → sve već cached → 0 poziva.

### Strategija 5: Smart cache eviction

R2 free tier je 10 GB. NDVI PNG ~50 KB → ~200k slika stane.
Ali brže rastu tumbnails + full-res.

**Eviction pravilo:**
- Slike starije od 90 dana: obriši ako nisu čitane zadnjih 30 dana
- Zadrži uvijek: zadnjih 30 dana (bez obzira na pristupe)
- Zadrži: kritični datumi (npr. sredina rasta, žetva)

### Kombinirani efekt

Bez ijedne strategije: **20 korisnika**.
Samo cache po arkod_id: **80 korisnika**.
+ batch: **150 korisnika**.
+ pre-warm: **300 korisnika**.
+ smart eviction: **500 korisnika**.

Nakon 500 korisnika: upgrade na Sentinel Basic ($50/mj) i to je i dalje jeftinije od svih drugih alata na tržištu.

---

## Supabase 500 MB — kompaktna shema

### Storage calculator

Za 100 korisnika, 50 čestica po korisniku prosjek:

```
profiles:            100 × 500 B     = 50 KB
gospodarstva:        100 × 300 B     = 30 KB
memberships:         120 × 200 B     = 24 KB
cestice (geom BIN):  5000 × 3 KB     = 15 MB     ← PostGIS binary!
operacije:           20000 × 500 B   = 10 MB
ndvi_cache:          5000 × 200 B    = 1 MB
audit_log:           10000 × 300 B   = 3 MB
─────────────────────────────────────
TOTAL:                                ~30 MB
```

500 MB podržava **~1500 korisnika** ovog profila.

### Ključne odluke za štednju

**1. PostGIS binary umjesto JSONB**
```sql
-- Loše (v1): 
geom_arkod JSONB           -- 8-15 KB per polygon

-- Dobro (v2):
geom_arkod GEOMETRY(Polygon, 4326)  -- 1-3 KB per polygon
```

**2. TOAST kompresija**
```sql
ALTER TABLE operacije ALTER COLUMN note SET STORAGE EXTENDED;
```
Postgres auto-kompresira duže tekstove.

**3. Arhiviranje starih operacija**
```sql
-- Cron job (pg_cron): jednom mjesečno
INSERT INTO r2_archive_queue
SELECT id, jsonb_build_object(...) FROM operacije
WHERE datum < NOW() - INTERVAL '2 years';
```
Nakon uspješne pohrane u R2 (Parquet format) → DELETE iz Postgres.

**4. Denormalizacija samo gdje treba**
NDVI cache: ne spremaj kompletne slike u DB, samo statistike (200 B po zapisu vs 50 KB slika).

---

## Cloudflare Workers 100k req/dan

3M requests/mj na free tieru. Realno za 100 aktivnih usera:
- 30 requestova × 100 usera × 30 dana = **90k requestova/mj**
- Puno ispod kvote.

Ali edge case-ovi mogu potrošiti brzo:
- Poll za sync status svakih 5s = 17k req/user/mj
- Loop u kodu koji šalje 10 req umjesto 1 = 10× brže

**Pravila:**
- Nema pollinga — koristi Supabase Realtime za notifikacije
- Batching svugdje (jedan `POST /operacije/bulk` umjesto N × `POST /operacije`)
- Cache-Control headeri na sve GET-ove (5 min TTL default)

### Monitoring Workers usage

```typescript
// wrangler.toml
[observability]
enabled = true

// U kodu
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(logRequestMetric(request.url));
    return handler(request, env);
  }
}
```

Cloudflare Dashboard → Workers Analytics: dnevna potrošnja + alarm.

---

## Migracijska matrica

Kad se pokažemo kvotom kojeg servisa, evo playbook:

### Supabase Free → Pro ($25/mj)

**Trigger:** DB size > 400 MB, ili MAU > 40k.

**Migracija:**
```bash
# Nulta migracija — samo klik u Supabase dashboardu
# Zadržava sve podatke, connection stringove, RLS pravila
```

**Trajanje:** 0 downtime.

### Supabase Pro → Self-hosted na Hetzner ($5-20/mj)

**Trigger:** > 500 MAU, ili trebamo pgvector s velikom dimenzijom, ili nešto Supabase ne dopušta.

**Migracija:**
1. Setup Hetzner VPS s Docker Compose
2. Pokreni Supabase stack (postgres + realtime + auth + storage)
3. `pg_dump` iz cloud Supabase → `psql` u self-hosted
4. Update `NEXT_PUBLIC_SUPABASE_URL` env var
5. Redeploy

**Trajanje:** 2-3 sata + testiranje. Nula code changes.

### Cloudflare Workers Free → Paid ($5 + usage)

**Trigger:** > 80k req/dan.

**Migracija:** klik u dashboardu, isti kod.

### Sentinel Hub Free → Basic ($50/mj)

**Trigger:** > 25k processing units/mj.

**Migracija:** upgrade plan, isti API key. Kvota skače na 300k PU/mj (10× više).

### Sentry Developer → Team ($26/mj)

**Trigger:** > 4k errors/mj.

**Migracija:** klik. Ili self-hosted Sentry na VPS ($5/mj).

### PostHog Cloud → Self-hosted ($5/mj VPS)

**Trigger:** > 900k events/mj.

**Migracija:** self-host na Hetzner Docker. Migration script postoji.

---

## Ključni arhitekturni izbori za migration-friendly kod

### 1. Provider-agnostic klijenti

**Loše:**
```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(url, key);
await supabase.from('cestice').select();  // Supabase-specific query builder
```

**Dobro:**
```typescript
// lib/db/client.ts — apstrakcija
export interface DbClient {
  cestice: {
    findMany(where: CesticeWhere): Promise<Cestica[]>;
    // ...
  };
}

// lib/db/supabase.ts — implementacija
export class SupabaseDbClient implements DbClient { /* ... */ }

// U feature kodu:
const cestice = await db.cestice.findMany({ gospodarstvo_id });
```

Kad migriramo na Prisma / Drizzle / direktan pg → samo jedan file mijenjamo.

### 2. Object storage kroz apstrakciju

```typescript
// lib/storage/client.ts
export interface StorageClient {
  put(key: string, data: Buffer | Stream): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expires: number): Promise<string>;
}

// R2 implementacija koristi AWS SDK (S3-kompatibilan)
// Kasnije zamjena za AWS S3 / Backblaze B2 / MinIO = nula code change
```

### 3. Message broker apstrakcija

Za sad nema Queues, koristimo `pg_notify` u Supabasi ili KV polling. Kad migriramo na Cloudflare Queues ili NATS:

```typescript
// lib/queue/client.ts
export interface QueueClient {
  publish(topic: string, message: unknown): Promise<void>;
  subscribe(topic: string, handler: MessageHandler): Promise<void>;
}
```

### 4. Auth apstrakcija

```typescript
// lib/auth/client.ts
export interface AuthClient {
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  getSession(): Promise<Session | null>;
  onAuthStateChange(cb: (session: Session | null) => void): Unsubscribe;
}
```

Migracija Supabase Auth → Clerk / Auth0 / self-hosted samo mijenja implementaciju.

### 5. Feature flags — spremni od dana 1

Bez PostHog cloud-a (dok ne treba), koristimo hardkodirani config koji čita env vars:

```typescript
// lib/features/flags.ts
export const features = {
  ai_advisor: process.env.NEXT_PUBLIC_FEATURE_AI === 'true',
  vra_7_zones: process.env.NEXT_PUBLIC_FEATURE_VRA7 === 'true',
  realtime_collab: false,  // hardcoded off za sad
};

// U komponenti
if (features.ai_advisor) { /* ... */ }
```

Kasnije zamjena za PostHog flags klijent = jedan file.

---

## Quota monitoring — proaktivno, ne reaktivno

### Dashboard za Ivana

Novi admin route `/admin/quotas`:

```typescript
// features/admin/QuotaDashboard.tsx
const quotas = await fetch('/api/admin/quotas').then(r => r.json());

<QuotaBar name="Supabase DB" used={quotas.db_mb} limit={500} />
<QuotaBar name="Sentinel Hub" used={quotas.sentinel_pu} limit={30000} />
<QuotaBar name="R2 Storage" used={quotas.r2_gb} limit={10} />
<QuotaBar name="Workers Requests (today)" used={quotas.workers_today} limit={100000} />
<QuotaBar name="Sentry Errors (month)" used={quotas.sentry_errors} limit={5000} />
```

Zelena < 60%, žuta 60-85%, crvena > 85%.

### Alarms (BetterStack ili custom)

```typescript
// Cron svakih sat vremena
if (quotas.sentinel_pu > 24000) {
  await sendAlarm('Sentinel Hub 80% kvote — planirati upgrade ili shared cache tune');
}
if (quotas.db_mb > 400) {
  await sendAlarm('Supabase DB 80% — arhiviraj stare operacije');
}
```

### Graceful degradation

Kad kvota pređe 95%:

```typescript
// middleware/quota-guard.ts
if (endpoint === '/api/sentinel/analyze' && await isNearQuota('sentinel')) {
  return json({
    error: 'quota_exceeded',
    message: 'Trenutno visok promet. Analiza dostupna za 2 sata (cached).',
  }, 503);
}
```

Ne padamo, degradiramo grateful. Korisnik dobije poruku umjesto crashe-a.

---

## Startup checklist — Faza 0

- [ ] Cloudflare account (besplatno)
- [ ] Supabase account + projekt (besplatno)
- [ ] Sentry account + projekt (besplatno)
- [ ] PostHog account + projekt (besplatno)
- [ ] Resend account + verify domain (besplatno)
- [ ] Sentinel Hub / Copernicus Dataspace account (besplatno)
- [ ] GitHub organization + private repo (besplatno)
- [ ] BetterStack account + 3 monitora (besplatno)
- [ ] Domain — samo za DNS, hosting na Cloudflare (~10 EUR/godišnje jedini stvarni trošak)
- [ ] Cloudflare Workers deploy `wrangler` s auth
- [ ] Env vars strukturirane od dana 1 (`.env.example` u repou)

---

## Anti-patterns koje izbjegavamo

**❌ Vendor lock-in bez potrebe**
Ne koristimo Supabase Edge Functions ako možemo Cloudflare Workers. Ne koristimo Supabase Storage ako imamo R2. Uvijek biramo servis s najviše portabilnosti.

**❌ Optimizacija prije potrebe**
Ne pišemo custom caching layer prije nego što izmjerimo problem. Prvi je Postgres cache, drugi Cloudflare KV, treći Upstash Redis — samo ako izmjerimo da treba.

**❌ Preveliki servisi na free tieru**
Ne pokušavamo Airbyte / Temporal / Kafka na free tieru. Za MVP: `pg_cron` + Supabase Realtime + Cloudflare Queues (kad treba).

**❌ Praviti "možda će trebati" apstrakcije**
Ne apstraktiraj auth iza 3 sloja kad je Supabase Auth zdravlje. Napravi tanku fasadu (5 metoda) — zamjena je jedan file.

---

## Timeline usklađen s free tier-om

Faza 0-1: 100% besplatno, nula problem.
Faza 2 (NDVI): Sentinel Hub će biti pod pritiskom → **prije Faze 2 implementiraj shared cache strategiju**.
Faza 3-4: Sve i dalje besplatno ako slijedimo shared cache.
Faza 5 (AI): Claude API budget odluka — postavi `AI_MONTHLY_BUDGET_USD` env var i tvrdi cap.

Realistično: **6 mjeseci na 0 USD/mj**, samo troškovi Claude poziva ako AI feature ide u produkciju.

---

## Za Cowork prompt (dopuna)

> Radimo **zero-budget MVP s migracijskom putanjom**. Sav stack je free tier, ali kod je pisan tako da migracija na paid ili self-hosted verzije bude nula code change. Ključne apstrakcije: DbClient, StorageClient, AuthClient, QueueClient. Feature flags kroz env vars sada, PostHog kasnije.
>
> Prije Faze 2 (NDVI) obavezno implementirati shared cache strategiju za Sentinel Hub — inače kvota puca na 20 korisnika. Detalji u `07_FREE_TIER_STRATEGY.md`.
