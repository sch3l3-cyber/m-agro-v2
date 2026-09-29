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
Kod je gotov i objavljen; tab **Savjet** u panelu čestice pojavi se sam čim postoji ključ.
- API se **plaća po potrošnji** (nije dio Claude pretplate). Model Claude Sonnet 5.5: jedno pitanje ≈ 0,01–0,02 USD.
- Aplikacija ima **tvrdi mjesečni limit** (zadano 5 USD ≈ 300+ pitanja) i 20 pitanja/sat po korisniku.
1. https://console.anthropic.com → prijava → **Billing**: dodaj karticu, uplati kredit (npr. 5 USD) i postavi **spend limit**.
2. **API Keys** → Create Key → ime `m-agro-v2` → kopiraj.
3. Cloudflare → Workers & Pages → **m-agro-v2-web** → Settings → Variables and Secrets → Add → tip **Secret** →
   ime `ANTHROPIC_API_KEY` → zalijepi ključ → Deploy.
4. (Po želji) isto mjesto, tip **Text**: `AI_MONTHLY_BUDGET_USD` (npr. `10`) ili `AI_MODEL` = `claude-haiku-4-5` (upola jeftinije).
5. Javi Claudeu → provjeri tab Savjet na čestici.

## 7. Pravila privatnosti i uvjeti korištenja (odluka)
Nacrt je napisan: `docs/pravno/PRAVILA_PRIVATNOSTI_NACRT.md` (GDPR: koji podaci, gdje se čuvaju — Supabase EU, Cloudflare; pravo na izvoz koji već postoji i na brisanje).
Ti ga pregledaš/odobriš (po potrebi i pravnik) prije pozivanja testera.

## 8. Brisanje računa ✅ riješeno 29. 9.
Gumb u Račun → „Obriši račun” (funkcija u bazi, bez dodatnog ključa). Admin račun se iz aplikacije ne može obrisati.

## 9. Probni restore backupa (kasnije, prije testera)
Supabase → Database → Backups: besplatni plan ima dnevne backupe 7 dana; probni restore je na Pro planu —
alternativa je tjedni `pg_dump` kroz GitHub Actions (Claude može postaviti).

## 10. Odluke o smjeru (docs/PLAN.md §6) — bez žurbe, prije pozivanja testera
- Poslovni model: što ostaje besplatno zauvijek, što se (eventualno) naplaćuje.
- Hoće li se podaci ikad dijeliti s trećima (dobavljači, osiguravatelji, otkupljivači) — određuje tekst privole.
- Pravnik za pravila privatnosti v2 (privola za modele + zasebni opt-in za treće).
- Popis prvih 10 testnih gospodarstava.
- Email APPRRR-u (prostorni.podaci@apprrr.hr) o uvjetima korištenja ARKOD GPKG-a i grupiranja po nositelju — Claude priprema nacrt (docs/pravno/UPIT_APPRRR.md).
