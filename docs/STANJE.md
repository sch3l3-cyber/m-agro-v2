# Stanje u odnosu na roadmap (29. 9. 2026.)

Web: https://m-agro-v2-web.sch3l3.workers.dev · Sentinel: https://m-agro-v2-sentinel.sch3l3.workers.dev

| Faza | Stanje | Otvoreno |
|---|---|---|
| 0 Temelji | ✅ monorepo, CI/CD, auth (registracija, potvrda, reset, **MFA/TOTP**), vendor granica, admin pregled kvota | Sentry, PostHog, vlastita domena, R2 (nije potreban — ADR-0006) |
| 1 Čestice | ✅ uvoz ARKOD/KML s reprojekcijom, karta + lista, uređivanje, RLS pgTAP | izbornik više gospodarstava u zaglavlju |
| 2 NDVI | ✅ dijeljeni cache, slojevi NDVI/kontrast/prave boje/NDMI/NDRE, SCL maska, trend sezone, **po godinama od 2017.**, rate limit + globalna kvota | email alarm na 80 % kvote (sad samo u /admin) |
| 3 Operacije | ✅ 6 vrsta, offline PWA + red, pregled gospodarstva, CSV, poništavanje brisanja | — |
| 4 VRA | ✅ 3/5/7 zona (razmaci ili jednake površine), rubni pikseli, doze, CSV, upis kao prihrana, prognoza „kad rasipati”, dodir na zonu | ISOXML izvoz (post-launch) |
| 5 Dorada + AI | 🟡 ispis/PDF kartice čestice i godišnjeg izvještaja OPG-a, GDPR izvoz | AI savjetnik (treba API ključ), pravila privatnosti/uvjeti, landing, Lighthouse audit |

## Sigurnosni checklist (03_SIGURNOST, prije launcha)
| Stavka | Stanje |
|---|---|
| Tajne izvan koda | ✅ gitleaks u CI-ju |
| RLS za sve tablice + testovi | ✅ 4 pgTAP datoteke (rls, uvoz, kvota, mfa, admin) |
| Rate limiting | ✅ Sentinel po korisniku + globalno; auth ograničava Supabase |
| Zod na svim ulazima | ✅ server akcije i worker |
| CSP | ✅ |
| MFA | ✅ TOTP + restriktivne RLS politike (aal2) |
| Audit log | ✅ ključne akcije, vidljiv u /admin |
| GDPR izvoz | ✅ Račun → Preuzmi moje podatke |
| GDPR brisanje računa | ❌ treba service ključ u web workeru — odluka |
| Leaked password protection | ❌ Supabase postavka (ručno, možda Pro plan) |
| Sentry + alarmi | ❌ treba račun |
| Uptime monitor na /api/health | ❌ treba račun (UptimeRobot/BetterStack, besplatno) |
| Probni restore backupa | ❌ ručno |
| Pravila privatnosti + uvjeti | ❌ tekst treba odobriti vlasnik |
