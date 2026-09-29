# ADR-0009: Podatkovni smjer — jednostavno sučelje, automatsko prikupljanje, upozorenja, ML

Status: prihvaćeno kao smjer (29. 9. 2026.); pojedinačne faze se detaljiraju u vlastitim ADR-ovima. Plan: `docs/PLAN.md`.

## Kontekst
Vlasnik želi da M-AGRO bude jednostavan alat za evidenciju (radnje, kulture po česticama, pregled gospodarenja) uz NDVI
kao bonus, a da se iz prikupljenih podataka (NDVI + operacije + vrijeme) gradi model koji predviđa, preporučuje i upozorava.
Sve mora ostati na besplatnim servisima dok god je to moguće.

## Odluke

1. **Dva načina sučelja** (`profiles.nacin`: `jednostavni` | `napredni`, zadano jednostavni). Isti podaci i RLS; razlika
   je samo u prikazu. Nove funkcije najprije u naprednom načinu.

2. **Masovna NDVI statistika izvan Sentinel Hub kvote.** Noćni GitHub Actions posao čita javne Sentinel-2 L2A COG-ove
   (Earth Search STAC, AWS Open Data, `sentinel-2-c1-l2a` — harmonizirane vrijednosti), radi zonalnu statistiku
   (B04/B08 + SCL maska, iste formule i klase oblaka kao worker) za sve čestice i upisuje u `ndvi_cache`
   (ključ `geom_hash:datum`, ADR-0002, pa ga worker i web koriste bez izmjena).
   - Zašto: CDSE besplatno = 10 000 zahtjeva i 10 000 PU mjesečno; tjedna statistika za 2 500 čestica (≈100 gosp.)
     već treba ~10 750 zahtjeva. COG-ovi nemaju kvotu; Actions je besplatan za javni repo; Worker (10 ms CPU) ne može rastere.
   - Sentinel Hub ostaje za interaktivne slike na karti (i dalje štićen mjesečnim čuvarom, sada 9000).
   - Sigurnost: posao koristi Supabase secret ključ iz GitHub Secrets; **logovi javnog repoa ne smiju sadržavati
     geometrije, nazive ni id-eve čestica** (samo brojke: koliko čestica, koliko snimki).
   - Provjera: prije uključivanja usporedba s postojećim zapisima iz Sentinel Huba (cilj: razlika srednjeg NDVI-ja < 0,02).

3. **Vrijeme po ćeliji mreže, ne po čestici.** Povijest: ERA5-Land (CC-BY, dopušta komercijalnu upotrebu, kašnjenje ~5 dana);
   prognoza: Open-Meteo dok je aplikacija nekomercijalna. Tablica `vrijeme_dan(celija, datum, …)`; čestica → ćelija preko
   zaokruženog središta. ~150 ćelija pokriva Slavoniju → zanemariva veličina.

4. **Strukturirani unos kao preduvjet modela:** sezona po čestici (kultura, sorta, datum sjetve, predusjev), katalozi
   (gnojiva s N/P/K, sredstva iz registra RH, sorte), žetva s prinosom. Slobodni tekst ostaje samo kao bilješka.

5. **Upozorenja prije ML-a.** Prva generacija su objašnjiva pravila i usporedba s istom kulturom u krugu 20 km
   (minimalno 5 čestica u usporedbi — ispod toga nema upozorenja, radi točnosti i privatnosti susjeda).
   Svako upozorenje ima povratnu ocjenu („korisno / nije točno”) koja postaje oznaka za učenje.

6. **ML kao noćni posao:** učenje i predviđanje u GitHub Actions (CPU), rezultati u bazu; web samo prikazuje.
   Model se uvodi samo ako na zadržanoj sezoni nadmaši pravila. Bez vanjskih ML servisa dok nisu potrebni.

7. **Privatnost po dizajnu:**
   - usporedbe i modeli koriste samo agregate (nikad se farmeru ne prikazuje tuđa čestica ni njen točan NDVI);
   - privola u dvije razine: upotreba za upozorenja/modele (anonimno, skupno) i zasebni opt-in za dijeljenje s trećima;
   - brisanje računa (postojeće) briše i doprinos budućim skupovima za učenje; već naučeni model se ne „od-uči”
     — to mora pisati u pravilima privatnosti.

8. **Komercijalni prag.** Prije naplate ili prodaje podataka zamijeniti/platiti servise koji ne dopuštaju komercijalnu
   upotrebu (Open-Meteo besplatni, nejasni Esri uvjeti) — popis u PLAN.md §5.3.

## Posljedice
- Nova ovisnost: GitHub Actions kao „noćni server” (ako repo postane privatan: 2 000 besplatnih minuta/mj — dovoljno za
  statistiku, tijesno za ML).
- Baza raste ~120 MB/god na 100 gospodarstava → do ~300 gospodarstava besplatno, zatim Supabase Pro ili arhiva starih
  sezona (Parquet u R2).
- Sentinel Hub kvota postaje usko grlo tek za interaktivne slike iznad ~60 aktivnih gospodarstava; rješenje je
  noćno renderiranje NDVI PNG-a iz COG-ova u R2.
