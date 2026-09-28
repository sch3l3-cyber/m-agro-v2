# Postavljanje (jednokratno)

## 1. GitHub
```bash
git clone m-agro-v2.bundle m-agro-v2      # iz isporučenog bundlea
cd m-agro-v2
git remote set-url origin git@github.com:<tvoj-korisnik>/m-agro-v2.git   # prazan PRIVATNI repo
git push -u origin main
```

**Settings → Secrets and variables → Actions**

| Vrsta | Ime | Vrijednost |
|---|---|---|
| Variable | `NEXT_PUBLIC_SUPABASE_URL` | `https://klgdptmjnwvlzygneqcf.supabase.co` |
| Variable | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → *publishable* |
| Variable | `NEXT_PUBLIC_SITE_URL` | `https://m-agro-v2-web.<subdomena>.workers.dev` |
| Secret | `CLOUDFLARE_API_TOKEN` | CF → My Profile → API Tokens → predložak *Edit Cloudflare Workers* |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | CF dashboard → desni stupac |
| Secret | `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens |
| Secret | `SUPABASE_DB_PASSWORD` | lozinka baze m-agro-v2-dev (Project Settings → Database → Reset ako je ne znaš) |

Deploy job koristi GitHub environment `dev` (Settings → Environments → New → `dev`).

## 2. Supabase Auth (dashboard, projekt m-agro-v2-dev)
- **Authentication → URL Configuration:** Site URL = `NEXT_PUBLIC_SITE_URL`; Redirect URLs dodaj
  `https://m-agro-v2-web.<subdomena>.workers.dev/auth/potvrda` i `http://localhost:3000/auth/potvrda`.
- **Email Templates:** zalijepi `supabase/templates/potvrda.html` (Confirm signup) i `reset.html` (Reset password),
  ili `supabase link --project-ref klgdptmjnwvlzygneqcf && supabase config push`.
- **SMTP:** ugrađeni Supabase SMTP šalje ~2 emaila/h — dovoljno za testiranje. Resend (3k/mj free) prije testera.
- Sebe postavi za admina (SQL editor): `insert into app_admins (user_id) select id from auth.users where email = 'tvoj@email';`

## 3. Lokalno
```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # upiši publishable key
pnpm dev                                       # http://localhost:3000
pnpm check                                     # typecheck + lint + unit testovi
pnpm db:test                                   # RLS testovi (treba Docker + Supabase CLI)
```

## Imena resursa (da se ne sudare s postojećima)
| Resurs | Ime | Postojeće (ne dirati) |
|---|---|---|
| Worker web | `m-agro-v2-web` | `magro-wms`, `fragrant-flower-75cd` |
| Worker sentinel | `m-agro-v2-sentinel` | |
| Supabase | `m-agro-v2-dev` (klgdptmjnwvlzygneqcf) | `magro baza`, `agro aplikacija baza` (v1) |
