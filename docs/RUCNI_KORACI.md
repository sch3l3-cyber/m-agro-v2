# Ručni koraci (vlasnik) — redom po važnosti

Svaki korak radiš sam jer uključuje račune, plaćanje, pravne tekstove ili tajne. Ključeve NIKAD ne šalji u chat —
upisuješ ih samo na navedenom mjestu. Kad završiš korak, javi Claudeu da dovrši svoj dio.

## 1. Uptime monitor (5 min, besplatno)
1. https://uptimerobot.com → Register (besplatni plan).
2. *Add New Monitor* → tip **HTTP(s)** → URL `https://m-agro-v2-web.sch3l3.workers.dev/api/health` → interval 5 min.
3. *Alert contacts*: tvoj email. Spremi.

## 2. Sentry — praćenje grešaka (10 min, besplatno) ✅ gotovo 29. 9.
1. https://sentry.io → Sign up → organizacija „m-agro”.
2. *Create project* → platforma **Next.js** → ime `m-agro-v2-web`.
3. Kopiraj **DSN** (izgleda kao `https://…@o….ingest.sentry.io/…`). DSN nije tajna, ali ga svejedno upiši ovdje:
   GitHub → repo → Settings → Secrets and variables → Actions → **Variables** → New → `NEXT_PUBLIC_SENTRY_DSN`.
4. Javi Claudeu → on dodaje Sentry u kod.

## 3. Vlastita domena app.m-agro.hr (10 min) ✅ gotovo 29. 9.
1. Cloudflare → Workers & Pages → **m-agro-v2-web** → Settings → **Domains & Routes** → Add → **Custom domain** →
   `app.m-agro.hr` → Add. (DNS zapis Cloudflare radi sam jer je m-agro.hr već kod njega; druga aplikacija na m-agro.hr se ne dira.)
2. Supabase → Authentication → **URL Configuration**: Site URL = `https://app.m-agro.hr`; u Redirect URLs dodaj
   `https://app.m-agro.hr/auth/potvrda` (stari workers.dev ostavi).
3. GitHub → Settings → Secrets and variables → Actions → Variables → `NEXT_PUBLIC_SITE_URL` = `https://app.m-agro.hr`.
4. Javi Claudeu → on provjerava prijavu, NDVI i mailove na novoj adresi (CORS sentinela je već pripremljen).

## 4. Zaštita od procurjelih lozinki (2 min)
Supabase → Authentication → **Attack Protection** (ili Policies/Passwords) → uključi *Leaked password protection*.
Ako traži Pro plan, preskoči — nije nužno za testiranje.

## 5. MFA na svom računu (3 min, preporučeno — ti si admin)
M-AGRO → gore desno tvoj email (**Račun**) → *Uključi dvofaktorsku prijavu* → skeniraj QR u Google/Microsoft Authenticatoru → upiši kod.

## 6. AI savjetnik — Anthropic API ključ (odluka + 10 min)
- API se **plaća po potrošnji** (nije dio besplatnog Claude plana). Za jednog farmera to su obično centi do par eura mjesečno;
  postavit ćemo mjesečni limit potrošnje da ne može iznenaditi.
1. https://console.anthropic.com → prijava → **Billing**: dodaj karticu i postavi **mjesečni limit** (npr. 5 €).
2. **API Keys** → Create Key → ime `m-agro-v2`.
3. Cloudflare → Workers & Pages → **m-agro-v2-web** → Settings → Variables and Secrets → Add → tip **Secret** →
   ime `ANTHROPIC_API_KEY` → zalijepi ključ → Deploy.
4. Javi Claudeu → on radi savjetnika (NDVI + operacije + prognoza kao kontekst, odgovori na hrvatskom).

## 7. Pravila privatnosti i uvjeti korištenja (odluka)
Nacrt je napisan: `docs/pravno/PRAVILA_PRIVATNOSTI_NACRT.md` (GDPR: koji podaci, gdje se čuvaju — Supabase EU, Cloudflare; pravo na izvoz koji već postoji i na brisanje).
Ti ga pregledaš/odobriš (po potrebi i pravnik) prije pozivanja testera.

## 8. Brisanje računa (odluka)
Za potpuno brisanje korisnika treba Supabase *secret* ključ i u web workeru (kao kod sentinela). Alternativa: zahtjev za brisanje
ide tebi emailom pa ga obrišeš u Supabase dashboardu. Reci što ti je draže.

## 9. Probni restore backupa (kasnije, prije testera)
Supabase → Database → Backups: besplatni plan ima dnevne backupe 7 dana; probni restore je na Pro planu —
alternativa je tjedni `pg_dump` kroz GitHub Actions (Claude može postaviti).
