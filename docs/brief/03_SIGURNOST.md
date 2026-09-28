# 🔒 M-AGRO v2 — Sigurnosni zahtjevi

> Sigurnost nije feature koji se dodaje kasnije. Sve dolje mora biti u arhitekturi od dana 1.

---

## Prijetnje koje adresiramo

1. **Krađa API kredencijala** (Sentinel Hub, Supabase) → skupi računi, zloraba
2. **Neovlašten pristup tuđim podacima** — farmer A vidi Farmer B čestice
3. **SQL injection / XSS** kroz user input (GeoJSON, form polja)
4. **Rate limit abuse** — jedan korisnik iscrpi Sentinel Hub kvotu za sve
5. **DDoS** na Cloudflare Workers (financijski impakt)
6. **Data loss** — nemarno brisanje podataka (kao v1 `syncToCloud` bug)
7. **Account takeover** — slabe lozinke, phishing
8. **Man-in-the-middle** — nedostatak HTTPS/HSTS

---

## Secrets management

### NIKAD u source code

**Loše (v1 primjer):**
```javascript
// worker.js
const CLIENT_ID = 'sh-00caecd6-...';       // ❌ hardcoded
const CLIENT_SECRET = 'dr63JvjesS...';      // ❌ hardcoded
```

**Dobro (v2):**
```typescript
// worker src/index.ts
export default {
  async fetch(request: Request, env: Env) {
    const token = await getToken(env.SENTINEL_CLIENT_ID, env.SENTINEL_CLIENT_SECRET);
  }
}
// wrangler.toml
[vars]
SENTINEL_INSTANCE_ID = "14409ea6-..."       // ne-tajno
// Secrets postavljeni preko: wrangler secret put SENTINEL_CLIENT_SECRET
```

### Rotation policy

- Sentinel Hub kredencijali: 90 dana (podsjetnik u kalendaru)
- Supabase service_role key: 90 dana
- Supabase anon key: promjena samo pri kompromisu (rebuild svih klijenata)

### Nikad u git

```
# .gitignore
.env
.env.local
.env.*.local
*.pem
*.key
wrangler.dev.toml
```

Pre-commit hook (`husky` + `git-secrets`) za detekciju curenja.

---

## Row-Level Security (RLS) — Supabase

### Pravila po tablici

```sql
-- profiles: korisnik vidi samo svoj profil
CREATE POLICY profiles_own ON profiles
  FOR ALL USING (id = auth.uid());

-- gospodarstva: farmer svoja, admin sve
CREATE POLICY gospodarstva_own ON gospodarstva
  FOR SELECT USING (owner_id = auth.uid() OR is_admin());
CREATE POLICY gospodarstva_modify ON gospodarstva
  FOR INSERT WITH CHECK (owner_id = auth.uid() OR is_admin());
CREATE POLICY gospodarstva_update ON gospodarstva
  FOR UPDATE USING (owner_id = auth.uid() OR is_admin());
CREATE POLICY gospodarstva_delete ON gospodarstva
  FOR DELETE USING (owner_id = auth.uid() OR is_admin());

-- cestice: kroz gospodarstvo
CREATE POLICY cestice_via_gospodarstvo ON cestice
  FOR ALL USING (
    gospodarstvo_id IN (SELECT id FROM gospodarstva WHERE owner_id = auth.uid())
    OR is_admin()
  );

-- operacije: kroz česticu → gospodarstvo
CREATE POLICY operacije_via_cestica ON operacije
  FOR ALL USING (
    cestica_id IN (
      SELECT c.id FROM cestice c
      JOIN gospodarstva g ON g.id = c.gospodarstvo_id
      WHERE g.owner_id = auth.uid()
    )
    OR is_admin()
  );
```

### Obavezni testovi RLS-a

**Playwright test primjer:**
```typescript
test('Farmer A cannot see Farmer B parcele', async ({ page }) => {
  // Login kao Farmer A
  await loginAs(page, 'farmerA@test.hr');

  // Pokušaj direktnog SELECT preko Supabase klijenta
  const { data } = await supabase.from('cestice').select('*');

  // Farmer A vidi SAMO svoje čestice
  const cestice = data as any[];
  expect(cestice.every(c => c.gospodarstvo_id === farmerAGospId)).toBe(true);
});
```

Testovi za sve tablice, run u CI prije deploya.

### `security_invoker` na VIEW-ovima

```sql
CREATE VIEW admin_pregled WITH (security_invoker = on) AS
  SELECT ... FROM profiles p LEFT JOIN gospodarstva g ...;
```

Bez `security_invoker`, view radi kao vlasnik (bypass RLS) — sigurnosna rupa.

---

## Input validation

### Zod schemas na svim granicama

**Klijent forma:**
```typescript
const OperacijaFormSchema = z.object({
  cestica_id: z.string().uuid(),
  tip: z.enum(['sjetva', 'prihrana', 'zastita', 'zetva', 'obrada']),
  datum: z.coerce.date(),
  amount: z.number().positive().max(10000).optional(),
  note: z.string().max(1000).optional(),
});
```

**API endpoint (Cloudflare Worker):**
```typescript
router.post('/sentinel/stats', async (request, env) => {
  const body = await request.json();
  const parsed = StatsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'validation', issues: parsed.error.issues }, 400);
  }
  // ...
});
```

**Server action (Next.js):**
```typescript
'use server';
export async function addOperacija(input: unknown) {
  const parsed = OperacijaSchema.parse(input);  // throws on invalid
  // ...
}
```

### GeoJSON validacija

Poseban paket: `@turf/helpers` `feature()` + custom checks.

```typescript
function validateGeoJSON(input: unknown): FeatureCollection {
  const parsed = FeatureCollectionSchema.parse(input);
  for (const f of parsed.features) {
    if (!['Polygon', 'MultiPolygon'].includes(f.geometry.type)) {
      throw new Error(`Nepodržan tip geometrije: ${f.geometry.type}`);
    }
    // Provjeri koordinate su brojevi, ne inf/NaN
    // Provjeri poligon je zatvoren
  }
  return parsed;
}
```

---

## Rate limiting

### Per-user quote

**Cloudflare KV counter:**
```typescript
async function checkRateLimit(userId: string, endpoint: string, env: Env) {
  const key = `rl:${userId}:${endpoint}:${new Date().toISOString().slice(0, 13)}`;  // per hour
  const count = parseInt(await env.RATE_LIMIT_KV.get(key) || '0');
  if (count >= LIMITS[endpoint]) {
    return { allowed: false, retry_after: 3600 };
  }
  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 3600 });
  return { allowed: true };
}

const LIMITS = {
  '/sentinel/stats': 60,     // 60/h per user
  '/sentinel/process': 30,   // 30 slika/h per user
  '/ai/chat': 20,            // 20 poruka/h per user (Claude košta)
};
```

### Global caps

Ako suma svih korisnika prijeti kvoti Sentinel Hub-a:
- Alarm na 80% mjesečne kvote (Slack/email)
- Auto-degrade: prebaci na dulji cache TTL, blokiraj nove korisnike privremeno

---

## CSRF zaštita

Next.js App Router server actions imaju ugrađenu CSRF zaštitu (origin check). Za direktne API pozive:

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowed = ['https://m-agro.hr', 'https://v2.m-agro.hr'];
  if (request.method !== 'GET' && !allowed.includes(origin || '')) {
    return new Response('Forbidden', { status: 403 });
  }
}
```

---

## XSS prevencija

- React auto-escape-a stringove ✓
- **Oprez sa `dangerouslySetInnerHTML`** — nikad s user inputom
- **Content Security Policy (CSP)** header:

```typescript
// next.config.js
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://*.supabase.co https://*.workers.dev;
  connect-src 'self' https://*.supabase.co https://*.workers.dev https://api.open-meteo.com;
`;
```

---

## Autentifikacija — sigurnosne postavke

### Supabase Auth konfiguracija

- **Password policy:** min 8 chars, mora imati broj + slovo
- **Email verification:** obavezan prije prvog logina
- **Session length:** 7 dana, refresh token 30 dana
- **MFA:** priprema za TOTP (Faza 3)

### Password reset flow

1. Korisnik unosi email
2. Supabase šalje magic link (JWT, valid 1h)
3. Klik → nova lozinka forma
4. Audit log entry

**Sigurnosne provjere:**
- Rate limit: max 3 reset zahtjeva po satu po emailu
- Ne otkriti postoji li email u sustavu ("Ako je email registriran, poslat ćemo link")

### Session security

- httpOnly cookies (nema JS pristupa)
- Secure flag (samo HTTPS)
- SameSite: Lax
- Refresh token rotation

---

## Audit log

**Sve admin akcije + osjetljive korisničke akcije:**

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES profiles(id),
  actor_email TEXT NOT NULL,          -- freeze u trenutku
  action TEXT NOT NULL,
  target_type TEXT,                    -- 'gospodarstvo', 'cestica', ...
  target_id UUID,
  payload JSONB,                       -- delta ili kompletan snapshot
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON audit_log (actor_id, created_at DESC);
CREATE INDEX ON audit_log (action, created_at DESC);
```

**Actions za log:**
- `login`, `logout`, `password_change`, `password_reset`
- `gospodarstvo.create`, `.update`, `.delete`
- `cestice.upload` (uz mode + broj)
- `operacije.delete`
- `admin.impersonate`, `admin.role_change`

Retention: 1 godina.

---

## Backups i disaster recovery

### Automated backups

- **Supabase Pro plan:** daily automated backups, 7-day retention
- **Custom weekly full dump:** cron job na Cloudflare Worker → R2 (30 dana retention)
- **Point-in-time recovery:** enabled na Supabase (WAL archive)

### Restore procedure

1. Identify RCA (što se dogodilo, koji vremenski okvir)
2. Restore u novi Supabase projekt (staging)
3. Verify integritet
4. Cut-over produkcije na restore
5. Post-mortem

**Testiranje:** kvartalno probaj restore u staging okruženje.

### Data retention & GDPR

- Korisnik može zatražiti export svih svojih podataka (GDPR)
- Korisnik može zatražiti brisanje (30 dana grace period, pa hard delete)
- Audit log korisničkih akcija se zadržava 1 god nakon brisanja korisnika (anonimiziran)

---

## Monitoring i alarms

### Sentry

- Frontend + Workers
- Alarm: > 10 grešaka/h na endpointu
- Filtrirati poznate false-positive (network errors kad je korisnik offline)

### Custom alarms

- Sentinel Hub potrošnja > 80% mj. kvote → email
- Neuspješni loginovi > 100/h → moguć brute force → block IP
- Audit log: 5+ delete akcija u minuti od jednog usera → alarm

### Uptime monitoring

- BetterStack ili UptimeRobot na `/api/health` endpoint
- Ping svakih 60s, alarm nakon 3 fail

---

## Compliance considerations

### GDPR (EU)

- Privacy policy javno dostupna
- Cookie consent (Cloudflare Analytics je bez cookies ✓)
- Data processing agreement s Supabase (ima)
- Data processing agreement s Cloudflare (ima)
- Right to access + delete implementirano

### Poljoprivredni podaci — hrvatska legislativa

- ARKOD podaci su javni (APPRRR)
- MIBPG je osobni identifikator → zaštititi
- Nema PII-a osim: ime, prezime, email, MIBPG

---

## Development sigurnost

### Dev/staging/prod izolacija

- Odvojeni Supabase projekti (dev/staging/prod)
- Odvojeni Cloudflare Workers okruženja
- Dev/staging nikad ne pristupa prod bazi
- Prod deploy samo iz `main` grane, kroz CI

### Code review

- Sve PR-eve pregledava barem jedan par očiju (Ivan + Cowork Claude?)
- Automatski scan: `semgrep`, `gitleaks`
- Deploy blokiran ako testovi ne prolaze

### Dependency management

- `pnpm audit` u CI, fail na high/critical
- Dependabot ili renovate za auto-PR za update
- Lock files commit-ani

---

## Incident response plan

### Scenariji

**A. Kompromitirani API kredencijali**
1. Rotate immediately (wrangler secret put)
2. Redeploy Workers
3. Review audit log za sumnjive pozive
4. Notify affected users if data leak

**B. RLS bypass otkriven**
1. Disable RLS na kritičnoj tablici → immediate lockdown
2. Fix RLS pravila
3. Restore RLS
4. Analiza koliko je bilo affected → GDPR notification ako > 250 usera

**C. Data corruption (npr. mass delete)**
1. Ne panic-restore — prvo identify uzrok
2. Restore iz najbližeg backup-a u staging
3. Diff s prod → identify delta
4. Selective restore ili full swap

### Kontaktne točke

- Ivan (product owner)
- Cloudflare support (Pro plan)
- Supabase support (Pro plan)

---

## Sigurnosni checklist prije launcha

- [ ] Svi secrets iz source koda uklonjeni
- [ ] RLS pravila napisana i testirana za sve tablice
- [ ] Rate limiting implementiran na svim public endpointima
- [ ] Zod validacija na svim ulazima
- [ ] CSP header postavljen
- [ ] Sentry integriran, alarms konfigurirani
- [ ] Backups verificirani (probni restore uspješan)
- [ ] Password reset flow testiran
- [ ] GDPR export/delete funkcije rade
- [ ] Privacy policy + Terms of Service objavljeni
- [ ] Uptime monitor postavljen
- [ ] Audit log capture ključne akcije
- [ ] Dependency vulnerabilities: 0 high/critical
- [ ] Penetration test (osnovni): OWASP ZAP scan bez issues
