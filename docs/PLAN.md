# M-AGRO — plan nakon Faze 5 (od 29. 9. 2026.)

> Nadopunjuje `docs/brief/05_ROADMAP.md` (faze 0–5). Brief ostaje referenca; ovaj dokument je važeći plan za dalje.
> Arhitektonske odluke: ADR-0009. Stanje: `docs/STANJE.md`.

## 1. Smjer u jednoj rečenici

**Farmer besplatno dobiva jednostavnu evidenciju i satelit za svoje gospodarenje; mi iz strukturiranih podataka
(operacije + NDVI + vrijeme + prinos) gradimo upozorenja i preporuke koje mu vraćamo.**

Vrijednost je u bazi koja raste svake sezone, ne u samoj aplikaciji. Zato je sve ispod podređeno trima uvjetima:
1. **Jednostavno sučelje** — inače farmer ne upisuje, a bez upisa nema podataka.
2. **Upotrebljivi podaci** — strukturirani, s ishodom (prinosom), inače model nema iz čega učiti.
3. **Povjerenje** — jasna privola i poštena razmjena, inače farmeri odlaze (i s pravom).

## 2. Ima li smisla? (procjena)

**Da, uz uvjete.** Model „besplatni alat za podatke” provjeren je u agrotehnologiji (FieldView, FarmLogs; u HR Agrivi je
bliži konkurent — razlikujemo se: besplatno, satelit uključen, jednostavno, lokalne preporuke).

| Za | Rizik | Kako ga smanjujemo |
|---|---|---|
| Farmer odmah dobiva korist (evidencija, NDVI, ispis za APPRRR/inspekciju) | Farmeri ne upisuju redovito | Upis u 3 dodira, radi bez signala; upozorenja kao razlog za upis |
| Satelit i vrijeme pokrivaju svaku česticu automatski — farmer ne mora ništa za to | Bez prinosa ML uči samo „što rade”, ne „što upali” | Jednostavan upis žetve (t/ha, vlaga) + bonus (usporedba sa susjedima) |
| Lokalni podaci (Slavonija) vrijedniji od globalnih modela | Premalo podataka za ML prve 1–2 sezone | Prvo pravila + usporedba sa susjedima (rade s 10–20 gospodarstava); ML tek kad ima dovoljno |
| Trošak infrastrukture ~0 do ~100 gospodarstava (vidi §5) | Neki besplatni servisi ne dopuštaju komercijalnu upotrebu | Popis u §5.3 — prije naplate/prodaje podataka zamijeniti ili platiti |
| | GDPR / povjerenje (OPG = često osobni podaci) | Izričita privola, podaci ostaju farmerovi, prodaja trećima samo uz poseban opt-in; pregled pravnika |

## 3. Načela za razvoj (obavezna — prepisana i u CLAUDE.md)

1. **Jednostavni način je zadani.** Početna = moje kulture → čestice; veliki „+ Radnja”; NDVI kao semafor.
   Slojevi, grafovi, VRA, CSV — pod „Napredno” (postavka računa). Nova funkcija ide u Napredno dok se ne dokaže.
2. **Svaki upis je strukturiran.** Katalog umjesto slobodnog teksta (gnojiva, sredstva, sorte); jedinice normalizirane
   (kg/ha, l/ha, t/ha); sezona po čestici (kultura, sorta, datum sjetve, predusjev). Slobodni tekst samo kao bilješka.
3. **Ishod je jednako važan kao radnja.** Žetva s prinosom i vlagom mora biti najlakši upis u aplikaciji.
4. **Podatke skupljamo automatski gdje god možemo** (satelit, vrijeme), farmer upisuje samo ono što samo on zna.
5. **Besplatni servisi imaju budžet** (§5). Nova funkcija koja troši kvotu mora imati procjenu za 10/100/1000 gospodarstava
   prije ugradnje. Masovna obrada ide izvan Sentinel Hub kvote (ADR-0009).
6. **Privola prije prikupljanja.** Nijedan novi podatak ne ide u model bez da ga pravila privatnosti pokrivaju.
7. **Upozorenje mora biti objašnjivo** („NDVI 18 % ispod pšenice u krugu 20 km, zadnje 2 snimke”), s razinom sigurnosti.
   Nikad ne preporučiti sredstvo koje nije registrirano u RH ni dozu bez napomene o deklaraciji.

## 4. Faze

Redoslijed je bitan: svaka faza stvara uvjete za sljedeću. „Vrata” = uvjet za prelazak dalje.

### Faza 6 — Jednostavno (≈ 1–2 tjedna rada) — 🟡 u tijeku
- ✅ Postavka računa „Jednostavni / Napredni način” (novi računi jednostavni, postojeći napredni; Račun → Način rada).
- ✅ Tab „Pregled”: kulture → broj čestica i ha → popis s NDVI semaforom (`ndviSemafor`, packages/domain) i zadnjom radnjom; „Traži pažnju” filtar.
- ✅ Kultura na više čestica odjednom (Pregled → Kultura).
- ✅ „+ Upiši radnju” na više čestica odjednom (odabir po kulturi, „odaberi sve”), bez signala; katalog dolazi u Fazi 7.
- „Moje gospodarenje”: potrošnja po kulturi i sezoni, radnje po mjesecima (iz postojećih podataka).
- Brzo postavljanje kulture na više čestica odjednom (isti odabir kao „+ Upiši radnju”).
- Onboarding: prazno gospodarstvo vodi ravno na „Dodaj čestice” (Faza 6b); prazna stanja objašnjavaju sljedeći korak.
- **Vrata:** 3–5 testnih farmera upiše radnje bez pomoći; tvoja ocjena na mobitelu.

### Faza 6b — Dodavanje čestica bez datoteka (≈ 1 tjedan) — ADR-0010 — 🟡 1.–4. gotovo
Provjereno: javni ARKOD WMS APPRRR-a vraća cijelu česticu (granica na cm u EPSG:3765, naziv, vrsta uporabe,
površina, nagib, vodozaštitna zona, Natura 2000) na dodir točke — bez naknade i ograničenja pristupa.
1. **„Dodaj čestice” na karti:** dodirni polje → obris + predloženi naziv i površina → „Dodaj” → dodiruj dalje.
   Poslužitelj pita ARKOD (server action, reprojekcija 3765 → WGS84), sprema kroz postojeći `uvezi_cestice`.
2. **Zaštita od duplikata:** isti ARKOD id ili > 50 % preklapanja u istom gospodarstvu → „Već imaš ovu česticu”.
3. **Crtanje na karti** (rezerva: polje nije u ARKOD-u ili je samo dio ARKOD čestice) — terra-draw, učitava se na zahtjev.
4. **„Poveži s ARKOD-om”** za postojeće čestice bez ARKOD id-a (sve Ivanove): dopuna id-a, vrste uporabe, atributa
   i po želji preciznije granice.
5. ARKOD atributi uz česticu (`arkod_atributi`) → kontekst za pravila i AI (zone zaštite voda, Natura 2000, nagib).
6. Uvoz datoteke seli u „Napredno” (GeoJSON/KML; kasnije Shapefile i ISOXML granice s terminala).
7. Kasnije (Faza 8): tjedna provjera promjena ARKOD granica za sve čestice (usporeno, ≤ 2 zaht./s) → obavijest
   „ARKOD granica promijenjena — ažurirati?”; rezerva za zemljište izvan ARKOD-a: DGU katastarske čestice (otvorena dozvola).
- **Opterećenje:** 1 zahtjev prema APPRRR-u po dodiru (vanjski javni servis, bez naše kvote); ~2 ms CPU u workeru.
  Tjedna provjera za 25 000 čestica ≈ 3,5 h usporenog rada u GitHub Actions — izvedivo, ali prije toga zatražiti WFS pristup.
- ✖ „Dodaj cijelo gospodarstvo” preko `jpaid`-a — ukinuto: `jpaid` je prostorna grupa, ne gospodarstvo (ADR-0011 ispravak).
  Uvoz po MIBPG-u traži podatke/sučelje APPRRR-a (vlasnik razgovara s agencijom).
- ✅ „Imaš popis ARKOD brojeva? Zalijepi ga” — zamjena za Python generator + QGIS (brojevi iz ARKOD preglednika, pretraga po MIBPG-u).
- ✅ Tjedni ARKOD punjač (istočna Hrvatska, 361 450 čestica) → `private.arkod_cestice` za regionalne agregate i budući sloj.
- **Nadogradnja (ADR-0011):** vlastiti ARKOD sloj iz javnog `land_parcels.gpkg` (PMTiles na R2)
  i „Dodaj cijelo gospodarstvo” — dodir jedne čestice nudi sve čestice istog nositelja (`jpaid`), uz potvrdu i zaštite privatnosti.
- ✅ (baza) Jedinstvenost MIBPG-a samo za provjerena gospodarstva, `provjereno` postavlja samo admin.
- **MIBPG pri stvaranju gospodarstva** (ADR-0011 dopuna): učitavanje = MIBPG + dodir jedne svoje čestice; razine provjere
  gospodarstva (neprovjereno/provjereno); jedinstvenost MIBPG-a samo za provjerena (danas je globalna → rizik da tuđinac „zauzme” MIBPG).
- **Vrata:** novi testni farmer doda svoje čestice za < 5 minuta bez ikakve datoteke.

### Faza 7 — Kvaliteta podataka + privola (≈ 2 tjedna)
- Sezona po čestici: kultura, sorta, datum sjetve, predusjev (predlaže se iz prošle sezone).
- Katalog: gnojiva (N/P/K %), sredstva za zaštitu (iz službenog registra RH, s karencom), sorte. Slobodni unos ostaje,
  ali se mapira na katalog.
- Žetva: prinos t/ha (ili ukupno pa aplikacija dijeli s ha), vlaga, hektolitar; podsjetnik nakon očekivane žetve.
- NDVI bonus: nakon upisa žetve otključava se usporedba „tvoja čestica vs. ista kultura u okolici” i višegodišnji pregled.
- Pravila privatnosti v2 + privola u registraciji (dvije razine: korištenje za upozorenja/modele — anonimno i skupno;
  dijeljenje s trećima — zaseban opt-in, zadano isključeno). **Pregled pravnika prije pozivanja testera.**
- **Vrata:** pravnik odobrio tekst; 10 testnih gospodarstava (MVP iz briefa).

### Faza 8 — Automatsko prikupljanje (≈ 2 tjedna)
- Noćni posao (GitHub Actions, ADR-0009): NDVI statistika za **sve** čestice iz javnih Sentinel-2 COG-ova
  (Earth Search / AWS Open Data) → `ndvi_cache`. Ne troši Sentinel Hub kvotu.
- Vrijeme: dnevna povijest po ćeliji mreže (~9 km, ERA5-Land, CC-BY) + prognoza; spremanje po ćeliji, ne po čestici.
- Kompaktna pohrana (samo čiste snimke, p10/p50/p90), admin prikaz veličine baze i trenda rasta.
- Sentinel Hub ostaje samo za interaktivne slike na karti.
- **Regionalni NDVI (ADR-0011):** ista obrada za sve ARKOD oranice u regiji → agregati po općini/vrsti uporabe/datumu
  (sirovi podaci u Parquetu na R2) → usporedba s okolicom i upozorenja rade i prije nego što imamo korisnike u blizini.
- **Vrata:** 1 mjesec noćnog rada bez greške; usporedba s dosadašnjim statistikama (razlika < 0,02 NDVI).

### Faza 9 — Upozorenja v1: pravila + usporedba sa susjedima (≈ 2–3 tjedna)
- Anomalija: NDVI čestice vs. ista kultura u krugu 20 km na isti datum (treba ≥ 5 čestica iste kulture u krugu).
- Agronomska pravila: mraz nakon sjetve/nicanja, prozor za prihranu (postojeća logika), rizik bolesti iz kiše i
  temperature (npr. uvjeti za septoriju, fuzarij u cvatnji), suša (NDMI + oborine).
- Dostava: obavijest u aplikaciji + Web Push (PWA, besplatno) + tjedni email sažetak (Resend, besplatno do 3000/mj).
- Povratna veza: „Korisno / Nije točno” uz svako upozorenje → oznake za budući model.
- **Vrata:** ≥ 60 % upozorenja ocijenjeno „korisno” na testnim gospodarstvima.

### Faza 10 — ML v1 (nakon ≥ 1 žetve s prinosima)
- Skup za učenje: čestica-sezona = NDVI krivulja + vrijeme + operacije + sezona → prinos.
- Prvi modeli (gradient boosting, učenje na GitHub Actions, predviđanja noću u bazu): procjena prinosa tijekom
  sezone, rizik polijeganja uljane repice (ideja iz v1), optimalni termin prihrane.
- Model se uvodi samo ako na zadržanoj sezoni pobijedi jednostavna pravila; inače ostaju pravila.
- **Vrata:** ≥ 300 čestica-sezona s prinosom po kulturi (realno 2027./2028.).

### Poslije (kad se pokaže potreba)
**Priprema Jedinstvenog zahtjeva** (kultura po ARKOD čestici, izvoz za AGRONET, provjera plodoreda i zona) — jak razlog za upis podataka · ISOXML izvoz VRA karte za terminal rasipača · uvoz karte prinosa s kombajna · pristup agronomu (uloga „čitanje” +
pozivnica) · trošak/prihod po čestici · foto s polja po čestici · automatski ARKOD sync · SoilGrids.

## 5. Besplatni model pod pritiskom

### 5.1 Izmjereno (29. 9. 2026., 1 gospodarstvo, 86 čestica, prosjek 2,26 ha)
- Baza 22 MB od 500 MB; NDVI ≈ 376 B po snimci čestice; Sentinel-2 ≈ 180 preleta/god po čestici, 71 % čistih.
- Sentinel Hub: 484 jedinice u rujnu (intenzivno testiranje).

### 5.2 Procjena (prosjek 25 čestica po gospodarstvu, 40 % gospodarstava aktivno u mjesecu, 150 interaktivnih zahtjeva po aktivnom)

| | 10 gosp. | 100 gosp. | 1000 gosp. |
|---|---|---|---|
| NDVI u bazi / god | 12 MB | 120 MB | 1,2 GB |
| Operacije / god | 1 MB | 9 MB | 90 MB |
| Sentinel Hub ako i masovna statistika ide preko njega (tjedno) | 1 700 zaht./mj ✅ | 16 750 ❌ | 167 500 ❌ |
| Sentinel Hub samo interaktivne slike (ADR-0009) | 600 ✅ | 6 000 ✅ | 60 000 ❌ |

### 5.3 Limiti, uvjeti i sljedeći korak

| Servis | Besplatno | Usko grlo | Sljedeći korak |
|---|---|---|---|
| Copernicus Sentinel Hub | **10 000 zahtjeva i 10 000 PU / mj** (naš čuvar: 9000) | interaktivne slike iznad ~60 aktivnih gosp. | slike renderirati noću iz COG-ova u R2 (besplatno 10 GB) ili plaćeni plan |
| Javni Sentinel-2 COG (AWS Earth Search) | bez računa, bez kvote | — | — |
| Supabase | 500 MB baza, 50 000 MAU, pauza nakon 7 dana neaktivnosti (UptimeRobot ju sprječava) | baza ~3 god na 100 gosp. | Pro 25 USD/mj (8 GB) kod ~300+ gosp. ili arhiva starih sezona u R2 |
| Cloudflare Workers | 100 000 zahtjeva/dan, 10 ms CPU po zahtjevu | teška obrada ne može u worker | masovna obrada u GitHub Actions |
| GitHub Actions | besplatno za javni repo | logovi su javni → nikad ne ispisivati podatke čestica | — |
| Open-Meteo | 10 000 poziva/dan, **samo nekomercijalno**; povijest samo u plaćenom planu | čim postoji naplata/prodaja podataka | prognoza: plaćeni plan ili otvoreni ECMWF/DWD podaci; povijest: ERA5-Land (CC-BY) |
| ERA5-Land (Copernicus CDS) | besplatno, CC-BY (i komercijalno) | kašnjenje ~5 dana | — |
| Esri satelitska podloga | izravne pločice bez ključa — komercijalni uvjeti nejasni | prije naplate | ArcGIS Location Platform ključ (ima besplatni sloj) ili DOF Državne geodetske uprave — provjeriti uvjete |
| Claude API (AI savjetnik) | plaća se po potrošnji, tvrdi limit u bazi | — | — |
| ARKOD WMS (APPRRR) | javan, bez naknade i ograničenja pristupa (GetCapabilities) | masovna tjedna provjera | zatražiti WFS pristup od APPRRR-a |
| DGU katastar (INSPIRE WFS) | Otvorena dozvola, komercijalno dopušteno uz navođenje izvora | — | — |
| Resend (email) | 3 000 / mj, 100 / dan | tjedni sažetak iznad ~100 gosp./dan | raspodijeliti po danima ili plaćeni plan |

**Zaključak:** uz premještanje masovne obrade izvan Sentinel Huba (Faza 8), cijeli plan do ~100 gospodarstava ostaje na 0 €
(osim AI savjetnika). Između 100 i 1000 gospodarstava očekivani trošak je ~25–100 €/mj (Supabase Pro, eventualno Sentinel
Hub/Open-Meteo plan) — do tada poslovni model mora biti jasan. **Prije bilo kakve naplate ili prodaje podataka** proći
stupac „komercijalno” u tablici.

## 6. Odluke koje su na vlasniku
- Poslovni model: besplatno za farmere zauvijek? Što se naplaćuje (napredne preporuke, usluge, podaci uz opt-in)?
- Hoće li se podaci ikad dijeliti s trećima (dobavljači, osiguravatelji, otkupljivači) — određuje tekst privole.
- Pravnik za pravila privatnosti v2 i uvjete prije pozivanja testera.
- Tko su prvih 10 testnih gospodarstava.
- Pisani upit APPRRR-u (prostorni.podaci@apprrr.hr): smijemo li koristiti `land_parcels.gpkg` u aplikaciji (i komercijalno)
  i grupirati čestice po nositelju (`jpaid`) za „Dodaj cijelo gospodarstvo” (ADR-0011).
