# 🏗 M-AGRO v2 — Arhitektura

> Detaljna arhitekturna vizija za novu iteraciju. Koristi uz `00_START_HERE.md`.

---

## Visok pregled

```
┌─────────────────────────────────────────────────────────────┐
│                     Klijent (Browser / PWA)                  │
│  Next.js 14 App Router · TypeScript · Tailwind · shadcn      │
│  MapLibre · TanStack Query · Zustand · Zod                   │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
        (Supabase Client)              (Cloudflare Worker)
               │                              │
               ▼                              ▼
┌──────────────────────────┐   ┌──────────────────────────────┐
│  Supabase                 │   │  Cloudflare Workers          │
│  · PostgreSQL + PostGIS   │   │  · /sentinel  (proxy + cache)│
│  · Auth (JWT)             │   │  · /arkod     (proxy)        │
│  · Storage (avatars)      │   │  · /weather   (Open-Meteo)   │
│  · Realtime (Faza 3)      │   │  · /ai        (Claude API)   │
│  · RLS policies           │   │  · rate limiting per user    │
└──────────────────────────┘   └──────────────────────────────┘
               │                              │
               │                              ▼
               │                    ┌────────────────────────┐
               │                    │  Cloudflare R2         │
               │                    │  · NDVI slika cache    │
               │                    │  · 14 dana retention   │
               │                    └────────────────────────┘
               │
               ▼
       Sentry (monitoring)
       Cloudflare Analytics
```

---

## Načelo portabilnosti — apstrakcijski slojevi

**Ovo je najvažniji arhitekturni izbor v2.** Sve external servise dohvaćamo kroz apstraktne klijente, ne direktno. Cilj: migracija (Supabase → self-hosted, R2 → S3, Sentry → self-hosted) je **nula code change**, samo jedan implementacijski fajl.

### DbClient

```typescript
// lib/db/types.ts
export interface DbClient {
  cestice: CesticeRepo;
  gospodarstva: GospodarstvaRepo;
  operacije: OperacijeRepo;
  ndviCache: NdviCacheRepo;
  auditLog: AuditLogRepo;
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
}

// lib/db/supabase.ts — trenutna implementacija
export class SupabaseDbClient implements DbClient { /* ... */ }

// Budući: lib/db/prisma.ts, lib/db/drizzle.ts, lib/db/pg.ts
```

### StorageClient

```typescript
// lib/storage/types.ts
export interface StorageClient {
  put(key: string, data: Buffer | ReadableStream, meta?: StorageMeta): Promise<void>;
  get(key: string): Promise<StorageObject | null>;
  delete(key: string): Promise<void>;
  list(prefix: string, limit?: number): Promise<StorageObject[]>;
  getSignedUrl(key: string, expiresIn: number): Promise<string>;
}

// R2 klijent koristi AWS SDK (S3-kompatibilan)
// Migration path: R2 → S3 → Backblaze B2 → MinIO = zamjena environment vars
```

### AuthClient

```typescript
// lib/auth/types.ts
export interface AuthClient {
  signIn(credentials: Credentials): Promise<Session>;
  signOut(): Promise<void>;
  getSession(): Promise<Session | null>;
  refreshSession(): Promise<Session | null>;
  onAuthStateChange(cb: AuthStateHandler): Unsubscribe;
  // MFA
  enrollTOTP(): Promise<TOTPChallenge>;
  verifyTOTP(code: string): Promise<void>;
}

// Migration path: Supabase Auth → Clerk / Auth0 / self-hosted Keycloak
```

### QueueClient

```typescript
// lib/queue/types.ts
export interface QueueClient {
  publish(topic: string, message: unknown, opts?: PublishOpts): Promise<void>;
  subscribe(topic: string, handler: MessageHandler): Promise<Unsubscribe>;
}

// MVP: pg_notify implementacija (uz Postgres)
// Kasnije: Cloudflare Queues / NATS / Redis Streams
```

### FeatureFlagsClient

```typescript
// lib/features/types.ts
export interface FeatureFlagsClient {
  isEnabled(flag: string, context?: FlagContext): boolean;
  variant(flag: string, context?: FlagContext): string;
}

// MVP: env-vars implementacija
// Kasnije: PostHog / LaunchDarkly / GrowthBook
```

### AIClient

```typescript
// lib/ai/types.ts
export interface AIClient {
  chat(messages: Message[], opts?: ChatOpts): Promise<ChatResponse>;
  stream(messages: Message[], opts?: ChatOpts): AsyncIterable<ChatChunk>;
  embed(text: string): Promise<number[]>;
}

// MVP: Claude implementacija kroz Vercel AI SDK
// Ako model potreba mijenja: Anthropic → OpenAI → Gemini = env var change
```

**Pravilo:** feature kod NIKAD ne importa direktno `@supabase/supabase-js`, `@aws-sdk/client-s3`, `@anthropic-ai/sdk`. Uvijek importa iz `lib/db`, `lib/storage`, `lib/ai`.

Test za pridržavanje: ESLint rule koji zabranjuje direktne importove van `lib/`.

---

## Frontend arhitektura

### Folder struktura (predlog)

```
apps/web/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── (auth)/                 # login, register, reset
│   │   ├── (app)/                  # protected routes
│   │   │   ├── parcele/
│   │   │   ├── operacije/
│   │   │   ├── vra/
│   │   │   └── postavke/
│   │   ├── (admin)/                # admin only
│   │   └── api/                    # server actions
│   ├── components/
│   │   ├── ui/                     # shadcn primitives
│   │   ├── map/                    # MapLibre wrappers
│   │   ├── forms/                  # form komponente
│   │   └── charts/
│   ├── features/                   # feature-based modularization
│   │   ├── auth/
│   │   ├── parcele/
│   │   │   ├── api.ts              # server calls
│   │   │   ├── hooks.ts            # useParcele, useParcela
│   │   │   ├── types.ts            # Zod schemas
│   │   │   └── components/
│   │   ├── ndvi/
│   │   ├── operacije/
│   │   ├── vra/
│   │   └── sync/
│   ├── lib/
│   │   ├── supabase/               # klijent, tipovi iz DB
│   │   ├── proj4/                  # reprojekcija
│   │   ├── geojson/                # parsing, validacija
│   │   ├── sentinel/               # Sentinel Hub helpers
│   │   └── utils/
│   ├── stores/                     # Zustand stores
│   │   ├── mapStore.ts
│   │   ├── syncStore.ts
│   │   └── uiStore.ts
│   └── styles/
├── public/
├── tests/
│   ├── unit/
│   └── e2e/                        # Playwright
└── package.json

apps/workers/
├── sentinel/
│   ├── src/index.ts
│   └── wrangler.toml
├── arkod/
├── weather/
└── ai/

packages/
├── shared-types/                   # tipovi dijeljeni klijent/worker
└── ui-tokens/                      # design tokens

supabase/
├── migrations/                     # SQL migracije
├── seed.sql
└── functions/                      # edge functions
```

---

## Feature module pattern

Svaki feature slijedi istu strukturu:

```typescript
// features/parcele/types.ts
import { z } from 'zod';

export const ParcelaSchema = z.object({
  id: z.string().uuid(),
  gospodarstvo_id: z.string().uuid(),
  arkod_id: z.string(),
  naziv: z.string(),
  povrsina_ha: z.number().positive(),
  kultura: z.string().nullable(),
  geom_arkod: z.any(),                    // GeoJSON validated separately
  local_id: z.string().nullable(),
});
export type Parcela = z.infer<typeof ParcelaSchema>;

// features/parcele/api.ts
export async function fetchParcele(gospodarstvoId: string): Promise<Parcela[]> {
  const { data, error } = await supabase
    .from('cestice')
    .select('*')
    .eq('gospodarstvo_id', gospodarstvoId);
  if (error) throw error;
  return z.array(ParcelaSchema).parse(data);
}

// features/parcele/hooks.ts
export function useParcele(gospodarstvoId: string) {
  return useQuery({
    queryKey: ['parcele', gospodarstvoId],
    queryFn: () => fetchParcele(gospodarstvoId),
    staleTime: 5 * 60 * 1000,
  });
}
```

---

## State management

### Zustand — UI i lokalno stanje

```typescript
// stores/mapStore.ts
interface MapStore {
  selectedParcelaId: string | null;
  highlightedParcelaId: string | null;
  zoom: number;
  center: [number, number];
  layer: 'ndvi' | 'ndvi_contrasted' | 'true_color';
  setSelected: (id: string | null) => void;
  // ...
}
export const useMapStore = create<MapStore>()(persist(...));
```

### TanStack Query — server state

- Sve fetches idu kroz `useQuery` / `useMutation`
- Automatski cache + refetch + optimistic updates
- Offline mode: `networkMode: 'offlineFirst'`
- Za offline mutacije: `persistQueryClient` + IndexedDB backend

---

## Supabase shema (v2)

Nadograđeno na v1, uz PostGIS umjesto JSONB za geometrije.

```sql
-- Ekstenzije
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profili korisnika (1:1 s auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  ime_prezime TEXT,
  role TEXT NOT NULL DEFAULT 'farmer' CHECK (role IN ('admin', 'farmer')),
  mibpg TEXT,                        -- Matični identifikacijski broj poljop. gospodarstva
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gospodarstva (jedan korisnik može imati više)
CREATE TABLE gospodarstva (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mibpg TEXT NOT NULL,
  naziv TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, mibpg)
);
CREATE INDEX ON gospodarstva (owner_id);

-- Čestice — PostGIS geometry umjesto JSONB
CREATE TABLE cestice (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gospodarstvo_id UUID NOT NULL REFERENCES gospodarstva(id) ON DELETE CASCADE,
  arkod_id TEXT NOT NULL,
  naziv TEXT NOT NULL,
  kultura TEXT,
  land_use_id INT,                   -- šifra iz ARKOD-a
  povrsina_ha NUMERIC(10, 4),
  geom_arkod GEOMETRY(Polygon, 4326) NOT NULL,  -- nepromjenjiv, iz ARKOD-a
  geom_precizna GEOMETRY(Polygon, 4326),        -- korisnička korekcija (Faza 3)
  local_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (gospodarstvo_id, arkod_id)
);
CREATE INDEX ON cestice USING GIST (geom_arkod);
CREATE INDEX ON cestice (gospodarstvo_id);

-- Operacije
CREATE TABLE operacije (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cestica_id UUID NOT NULL REFERENCES cestice(id) ON DELETE CASCADE,
  tip TEXT NOT NULL,                 -- sjetva, prihrana, zastita, ...
  datum DATE NOT NULL,
  kultura TEXT,
  sorta TEXT,
  fert TEXT,
  product TEXT,
  amount NUMERIC,
  unit TEXT,
  vlaga NUMERIC,
  hektolitarska NUMERIC,
  dubina NUMERIC,
  note TEXT,
  local_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON operacije (cestica_id);
CREATE INDEX ON operacije (datum DESC);

-- Cache NDVI statistika (izbjegava ponavljanje poziva)
CREATE TABLE ndvi_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cestica_id UUID NOT NULL REFERENCES cestice(id) ON DELETE CASCADE,
  datum DATE NOT NULL,
  mean NUMERIC,
  min NUMERIC,
  max NUMERIC,
  stdev NUMERIC,
  percentiles JSONB,                 -- {p10, p25, p50, p75, p90}
  sample_count INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cestica_id, datum)
);

-- Audit log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON audit_log (actor_id, created_at DESC);
```

### RLS pravila

```sql
-- Farmer vidi samo svoje
ALTER TABLE gospodarstva ENABLE ROW LEVEL SECURITY;
CREATE POLICY gospodarstva_owner ON gospodarstva
  FOR ALL USING (owner_id = auth.uid() OR is_admin());

ALTER TABLE cestice ENABLE ROW LEVEL SECURITY;
CREATE POLICY cestice_via_gospodarstvo ON cestice
  FOR ALL USING (
    gospodarstvo_id IN (SELECT id FROM gospodarstva WHERE owner_id = auth.uid())
    OR is_admin()
  );

ALTER TABLE operacije ENABLE ROW LEVEL SECURITY;
CREATE POLICY operacije_via_cestica ON operacije
  FOR ALL USING (
    cestica_id IN (
      SELECT c.id FROM cestice c
      JOIN gospodarstva g ON g.id = c.gospodarstvo_id
      WHERE g.owner_id = auth.uid()
    )
    OR is_admin()
  );

-- is_admin() helper (SECURITY DEFINER, imutable za perf)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

**Testovi RLS-a:** obavezno. Napiši Playwright test koji se logira kao Farmer A, pokušava dohvatiti Farmer B čestice → mora fail-ati.

---

## Cloudflare Workers

Umjesto jednog monolitnog `worker.js`, više malih Workera:

### `apps/workers/sentinel/`

```typescript
// src/index.ts
import { Router } from 'itty-router';
import { rateLimit } from '@shared/rate-limit';

const router = Router();

router.post('/stats', rateLimit(60, '1h'), async (request, env) => {
  const { geometry, date } = await request.json();
  // Validacija Zod...
  const token = await getToken(env);
  // Statistics API poziv BEZ resx/resy
  // Cache u KV/R2
  return json(result);
});

router.post('/process', rateLimit(120, '1h'), async (request, env) => {
  // NDVI slika, cache u R2
});

export default { fetch: router.handle };
```

### Environment vars (Cloudflare Secrets)

```
SENTINEL_CLIENT_ID
SENTINEL_CLIENT_SECRET
SENTINEL_INSTANCE_ID
SUPABASE_URL
SUPABASE_SERVICE_KEY        # samo za admin funkcije
```

**NIKAD** u source code. Postavlja se preko `wrangler secret put`.

---

## Caching strategija

### NDVI slike (Cloudflare R2)

Ključ: `ndvi/<cestica_id>/<datum>/<layer>.png`
Retention: 30 dana
Cache-Control: `public, max-age=86400, immutable`

### NDVI statistike (Postgres `ndvi_cache`)

Read: prije Sentinel poziva provjeri cache.
Write: nakon uspješnog poziva, spremi rezultat.
Invalidacija: nema — datumi ne mijenjaju rezultat.

### Vremenska prognoza (KV)

Ključ: `weather/<lat>/<lng>/<date>`
TTL: 6 sati.

---

## Offline strategija

### Service Worker (next-pwa)

Cache-first za: HTML shell, statička sredstva, mape tileovi.
Network-first za: API pozivi (fallback na TanStack Query cache).

### IndexedDB (via TanStack Query persister)

Perzistira: sve queries (parcele, operacije, ndvi statistike).
Sinkronizacija: kad se vrati online, TanStack automatski refresh-a.

### Mutation queue

Upisi (nova operacija) idu u queue kad je offline:

```typescript
const addOperacija = useMutation({
  mutationFn: postOperacija,
  onMutate: async (novaOp) => {
    // Optimistički update
    await queryClient.cancelQueries(['operacije']);
    const prev = queryClient.getQueryData(['operacije']);
    queryClient.setQueryData(['operacije'], (old) => [...old, novaOp]);
    return { prev };
  },
  onError: (err, novaOp, ctx) => {
    queryClient.setQueryData(['operacije'], ctx.prev);
  },
  networkMode: 'offlineFirst',
});
```

---

## Ključne biblioteke za portati iz v1

| v1 | v2 ekvivalent | Napomena |
|----|---------------|----------|
| `proj4.js` | `proj4` (npm) | Ista biblioteka, sad kroz npm |
| Custom sync logika | TanStack Query mutations | Puno robusnije |
| Leaflet | MapLibre GL | Nova biblioteka, migracija |
| Chart.js | Recharts | Bolja integracija s React |
| Globalne varijable | Zustand + TanStack | Type safe, testabilno |

---

## Monitoring i observability

- **Sentry** za runtime greške (frontend + Workers)
- **Cloudflare Analytics** za trafik, latencu, greške
- **Supabase Dashboard** za DB query analytics
- **Custom audit_log** za admin akcije
- **Health check endpoint** `/api/health` (uptime monitor)

---

## Testing strategija

### Unit (Vitest)

Obavezno za:
- `lib/proj4/` — reprojekcija (svi 4 CRS-a)
- `lib/vra/` — izračun zona, doza, postotaka
- `lib/sentinel/` — parsiranje odgovora, calibration
- `features/*/api.ts` — Zod validacija

### Integracija (Vitest + msw)

- API klijent + mock Supabase
- Sync tokovi (queue, retry, conflict)

### E2E (Playwright)

Kritični userflow:
1. Registracija farmera → login → prazan dashboard
2. Admin uploada GeoJSON → farmer vidi čestice
3. Farmer klikne česticu → NDVI se učita
4. Farmer doda operaciju offline → sync kad je online
5. RLS test: Farmer A ne vidi Farmer B čestice

---

## Deploy pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm test:unit
      - run: pnpm test:e2e

  deploy-preview:
    needs: test
    if: github.event_name == 'pull_request'
    # Deploy na Cloudflare Pages preview URL

  deploy-production:
    needs: test
    if: github.ref == 'refs/heads/main'
    # Deploy na production
    # + Migracija Supabase
    # + Deploy Workers
```

---

## Nerješena pitanja za prvu Cowork sesiju

1. **Monorepo** (pnpm workspaces / turborepo) ili više repo-a?
   → Predlog: monorepo, brže dijeljenje tipova.

2. **UI biblioteka:** shadcn (copy-paste komponente) ili gotova (Radix + Chakra)?
   → Predlog: shadcn — brži tweak, manja bundle.

3. **Autentifikacija:** Supabase Auth UI ili custom?
   → Predlog: custom (bolji UX, hrvatski jezik).

4. **Localization:** samo HR ili priprema za EN/DE?
   → Predlog: samo HR za MVP, ali strukturirati s `next-intl` da bude lako.

5. **Domenu i branding:** ostaje `magro-ndvi.pages.dev` ili nova?
   → Preporuka: nova domena `m-agro.hr` prije javnog launcha.
