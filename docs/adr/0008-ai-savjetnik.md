# ADR-0008: AI savjetnik

Status: prihvaćeno (29. 9. 2026.)

## Odluke
- **Poziv Claudea sa servera web workera** (`/api/ai/savjet`), ne iz zasebnog workera: kontekst (čestica, NDVI iz `ndvi_cache`,
  operacije) se ionako čita korisnikovom sesijom uz RLS, pa nema dupliciranja autorizacije. Ključ je Cloudflare secret
  `ANTHROPIC_API_KEY`; bez njega je savjetnik isključen (tab se ne prikazuje, ruta vraća 503).
- **Bez Vercel AI SDK-a / @anthropic-ai/sdk** (brief spominje AI SDK): Messages API preko `fetch` + vlastiti SSE parser
  (`lib/ai/anthropic.ts`) — worker ima 3 MiB limit, a trebamo samo streaming teksta. Zamjena pružatelja = novi fajl u `lib/ai`.
- **Model**: zadano `claude-sonnet-5-5` (bolji hrvatski i agronomsko rasuđivanje); `AI_MODEL=claude-haiku-4-5` za upola nižu cijenu.
- **Tvrdi limit troška** (07_FREE_TIER_STRATEGY): `public.ai_rezerviraj` prije poziva (20/h po korisniku, mjesečni budžet
  `AI_MONTHLY_BUDGET_USD`, zadano 5), `public.ai_evidentiraj` nakon odgovora knjiži stvarni trošak na tu rezervaciju
  (najviše 0,10 USD po pozivu, samo jednom) — klijent ne može napuhati ni smanjiti trošak.
- **Kontekst** sastavlja čista funkcija `sastaviKontekst` (packages/domain, testirana): kultura, površina, do 12 zadnjih čistih
  NDVI snimki s p10–p90, operacije zadnjih 12 mjeseci (do 25), prognoza 7 dana s ocjenom za rasipanje. Bez emaila, imena i ARKOD ID-a.
- **NDVI iz cachea, ne novi Sentinel poziv**: savjetnik ne troši Sentinel kvotu; ako farmer nije otvarao satelit, kontekst to kaže.
- Bez spremanja razgovora u bazu (MVP): manje osobnih podataka; razgovor živi dok je čestica otvorena.
