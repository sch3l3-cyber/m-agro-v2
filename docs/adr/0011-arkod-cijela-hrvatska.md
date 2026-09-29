# ADR-0011: ARKOD za cijelu Hrvatsku — vlastiti sloj, uvoz gospodarstva, regionalni NDVI

Status: predloženo (29. 9. 2026.) — čeka potvrdu uvjeta ponovne uporabe od APPRRR-a i pravnika. Nadopunjuje ADR-0010.

## Činjenice (provjereno 29. 9. 2026.)
- APPRRR na stranici „Prostorni podaci i servisi” nudi **izravno preuzimanje** `land_parcels.gpkg` (cijela RH, osvježava se
  tjedno, ~822 MB) i arhive `arkod_31_12_2011…2024.gpkg`. Bez prijave. **Uvjeti ponovne uporabe na stranici nisu navedeni**;
  WMS GetCapabilities: „Fees: none, AccessConstraints: none”.
- Atribut **`jpaid`** (13 znamenki) je isti za čestice istog korisnika: kod Ivana PTC32 i TABLA CIGLANA imaju isti,
  PTC1 drugi (vjerojatno drugi nositelj). ⇒ javni sloj omogućuje **grupiranje čestica po gospodarstvu** (pseudonimno).
- ARKOD preglednik s prijavom (MIBPG) prikazuje čestice gospodarstva, ali **aplikacija nikad ne traži niti koristi
  farmerove pristupne podatke za ARKOD/AGRONET** (sigurnost i uvjeti korištenja tih sustava).
- `land_use_id` je vrsta uporabe (oranica, livada, vinograd…), **ne kultura** — kulturu i dalje daje farmer ili model.

## Prilike
1. **Vlastiti ARKOD sloj (vektorske pločice):** tjedni GitHub Actions posao skine GPKG → tippecanoe → PMTiles →
   Cloudflare R2 (besplatno 10 GB, bez naplate prometa). Na karti se vide sve ARKOD granice, dodir je trenutan i radi bez
   signala za već pregledana područja, bez ovisnosti o APPRRR WMS-u (ADR-0010 postaje rezerva). Precizne granice (EPSG:3765).
2. **„Dodaj cijelo gospodarstvo” u jednom koraku:** farmer dodirne JEDNU svoju česticu → ponudimo sve čestice s istim
   `jpaid` („Pronašli smo 42 čestice, 118 ha — jesu li tvoje?”) → potvrdi popis (može odznačiti) → uvoz.
   Najveće ubrzanje onboardinga (minute umjesto sati).
3. **Regionalni NDVI bez korisnika (hladni start upozorenja):** noćna zonalna statistika iz Sentinel-2 COG-ova za SVE
   oranice u regiji (npr. Osječko-baranjska i Vukovarsko-srijemska) → agregati po općini / vrsti uporabe / datumu.
   Usporedba „tvoja čestica vs. okolica” radi od prvog dana, ne tek kad ima 10+ korisnika u krugu 20 km.
   Kasnije: klasifikacija kulture iz NDVI krivulje (poznata metoda) → regionalna karta kultura i bolji ML skup.
4. **Zakonske zone po čestici** (zaštita voda, Natura 2000, nagib) → pravila upozorenja (npr. ograničenja gnojidbe).
5. **Tržište:** broj različitih `jpaid` i hektara oranica po općini → gdje tražiti testere i koliko je potencijalnih korisnika.

## Odluke i ograničenja
- **Prije ičega: pisana potvrda APPRRR-a** (prostorni.podaci@apprrr.hr) da smijemo koristiti `land_parcels.gpkg` u
  aplikaciji (i komercijalno) te grupirati po `jpaid`. Do tada: samo ADR-0010 (dodir preko WMS-a, jedna čestica).
- **`jpaid` je osobni podatak (pseudonim nositelja OPG-a):**
  - ne pohranjujemo `jpaid` tuđih gospodarstava u bazu; u pločicama ga nema (samo geometrija, id, vrsta uporabe);
  - „Dodaj cijelo gospodarstvo” ide preko poslužitelja, samo iz čestice koju je korisnik upravo dodirnuo, uz potvrdu
    „ovo su moje čestice”, zapis u audit log i ograničenje (npr. 3 grupna uvoza dnevno po korisniku);
  - nikad pretraga po MIBPG-u, `jpaid`-u ili nazivu tuđeg gospodarstva; nikad prikaz popisa tuđih čestica bez dodira;
  - pregled pravnika (PLAN.md §6) mora pokriti ovu funkciju prije uključivanja.
- **Regionalni podaci samo kao agregati** (≥ 5 čestica po skupini); tuđe čestice se nikad ne prikazuju pojedinačno.
- **Pohrana:** sirovi regionalni NDVI (milijuni redaka) u Parquetu na R2, u bazi samo agregati → Supabase ostaje ispod 500 MB.

## Procjena opterećenja (besplatno)
| Stavka | Procjena | Limit |
|---|---|---|
| PMTiles cijele RH (z10–15, pojednostavljeno) | ~0,3–0,6 GB | R2 10 GB |
| Čitanja pločica | ~100–300 po sesiji karte | R2 10 M čitanja/mj |
| Tjedni posao (skidanje 822 MB + tippecanoe) | ~15–30 min | GitHub Actions (javni repo: bez limita minuta) |
| Regionalni NDVI (2 županije, ~4 Sentinel-2 pločice × ~70 datuma/god) | ~1–3 h/tjedno | isto |
| Agregati u bazi | ~5–20 MB/god | Supabase 500 MB |

## Posljedice
- Najbolji onboarding na tržištu (dodir → cijelo gospodarstvo) i upozorenja od prvog dana — uz ozbiljnu obvezu prema privatnosti.
- Nova infrastruktura: R2 bucket i tjedni posao; ovisnost o dostupnosti GPKG-a (pad → zadnja verzija ostaje).
