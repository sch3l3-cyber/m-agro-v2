# ADR-0010: Dodavanje čestica — dodir na ARKOD česticu na karti

Status: prihvaćeno (29. 9. 2026.). Plan: `docs/PLAN.md` Faza 6b.

## Kontekst
Danas se čestice dodaju samo uvozom datoteke (GeoJSON iz QGIS generatora ili KML iz Google Eartha). Za farmera bez
GIS iskustva to je najveća prepreka ulasku u aplikaciju, a jednostavni način (ADR-0009) traži „bez datoteka”.

## Provjereno (29. 9. 2026.)
- **ARKOD WMS APPRRR-a** (`https://servisi.apprrr.hr/NIPP/wms`, sloj `hr.land_parcels`, tjedno osvježavanje) je javan:
  u GetCapabilities „Fees: none, AccessConstraints: none”.
- **GetFeatureInfo** s `INFO_FORMAT=application/json` vraća **cijelu česticu s geometrijom** i atributima:
  `id` (ARKOD id), `home_name` (naziv koji je farmer dao u ARKOD-u), `land_use_id`, `area` (m²), `slope`, `z_avg`,
  `water_protect_zone`, `natura2000`, `sanitary_protection_zone`, `irrigation`… Bez MIBPG-a i imena vlasnika.
- U EPSG:4326 koordinate su zaokružene na 4 decimale (~8–11 m) — **neupotrebljivo**. U **EPSG:3765** su na cm
  → tražiti u 3765 i reprojicirati postojećim `packages/domain/src/reproject.ts`.
- Provjera na Ivanovoj čestici PTC32: naziv i površina (216 920 m² = 21,69 ha) identični uvezenim podacima.
- Servis ne podržava EPSG:3857 (nema izravnog WMS sloja u MapLibreu bez posrednika).
- WFS (masovno preuzimanje) traži odobrenje APPRRR-a; arhivski slojevi `hr.arkod_31_12_2011…2024` postoje.
- **DGU katastarske čestice** (INSPIRE WFS, Otvorena dozvola — komercijalno dopušteno uz navođenje izvora) — rezerva za
  zemljište koje nije u ARKOD-u (npr. novi zakup). Katastarska čestica ≠ obrađivana površina.

## Odluke
1. **Glavni način dodavanja: „dodirni polje”.** Karta u načinu „Dodaj čestice”: dodir → poslužitelj pita ARKOD
   GetFeatureInfo (EPSG:3765, okvir ±5 m oko točke) → prikaže se obris, predloženi naziv (`home_name`), površina →
   farmer potvrdi (može odmah nastaviti dodirivati sljedeća polja) → spremanje kroz postojeći `uvezi_cestice` (mod „dodaj”),
   pa vrijede sva postojeća pravila (RLS, validacija geometrije, `arkod_id`).
2. **Posrednik u web workeru** (server action), ne izravno iz preglednika: nema ovisnosti o CORS-u APPRRR-a, reprojekcija
   na poslužitelju, samo prijavljeni korisnici, ograničenje (npr. 60 upita/min po korisniku), predmemorija po zaokruženoj točki.
   Trošak: 1 vanjski zahtjev po dodiru, ~2 ms CPU za reprojekciju 30-ak točaka — unutar 10 ms limita.
3. **Duplikati:** isti `arkod_id` u istom gospodarstvu ili preklapanje > 50 % s postojećom česticom → „Već imaš ovu česticu”.
   Različita gospodarstva smiju imati istu ARKOD česticu (zakup, promjena korisnika).
4. **Crtanje na karti** kao rezerva (polje nije u ARKOD-u, dio ARKOD čestice): terra-draw, učitava se samo kad se
   otvori (ne ulazi u Worker bundle). Geometrija prolazi istu validaciju.
5. **Uvoz datoteke** ostaje u naprednom načinu (GeoJSON/KML; kasnije Shapefile zip i ISOXML granice s terminala).
6. **ARKOD atributi** (nagib, vodozaštitna zona, Natura 2000, navodnjavanje) spremaju se uz česticu (`arkod_atributi jsonb`)
   → kontekst za pravila i AI savjetnika (npr. ograničenja gnojidbe u zonama zaštite voda).
7. **„Poveži s ARKOD-om”** za postojeće čestice bez `arkod_id` (npr. uvezene iz KML-a): dodir unutar čestice → dopuna
   `arkod_id`, `land_use_id`, atributa i (uz potvrdu) preciznije granice.
8. **Pristojna upotreba javnog servisa:** bez masovnog skidanja; noćna provjera promjena ARKOD granica (Faza 8) najviše
   tjedno i usporeno (≤ 2 zahtjeva/s). Za veće količine zatražiti WFS pristup (prostorni.podaci@apprrr.hr).
   Na karti i u izvozu navesti izvor: „ARKOD, APPRRR”.

## Posljedice
- Onboarding novog farmera bez datoteka: otvori kartu → dodirni svoja polja → gotovo.
- Ovisnost o dostupnosti ARKOD WMS-a: ako ne radi, ostaju crtanje i uvoz datoteke (poruka farmeru, ne prazan ekran).
- `home_name` je javan u ARKOD WMS-u; prijedlog naziva ne otkriva ništa što već nije javno.
