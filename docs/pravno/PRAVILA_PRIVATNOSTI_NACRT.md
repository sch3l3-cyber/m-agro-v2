# NACRT — Pravila privatnosti M-AGRO

> **Status: nacrt za pregled (Ivan, po potrebi pravnik). Nije objavljeno u aplikaciji.**
> Mjesta označena `[[…]]` popunjava vlasnik. Nakon odobrenja Claude ga prebacuje na stranicu `/privatnost` i link u prijavu/registraciju.

Zadnja izmjena: [[datum objave]]

## 1. Tko obrađuje podatke
Voditelj obrade: **[[puni naziv obrta / OPG-a]]**, [[adresa]], OIB [[OIB]].
Kontakt za pitanja o privatnosti: [[email, npr. privatnost@m-agro.hr]].

M-AGRO je besplatna aplikacija za evidenciju poljoprivrednih čestica, satelitski NDVI pregled, evidenciju operacija i VRA prihranu.

## 2. Koje podatke obrađujemo i zašto

| Podaci | Svrha | Pravna osnova (GDPR čl. 6) |
|---|---|---|
| Email adresa, lozinka (spremljena samo kao sažetak/hash), podaci za dvofaktorsku prijavu | Račun i sigurna prijava | Izvršenje ugovora (b) |
| Naziv gospodarstva, čestice (ARKOD granice, naziv, kultura, površina) | Prikaz čestica na karti, NDVI, VRA | Izvršenje ugovora (b) |
| Evidencija operacija (sjetva, prihrana, zaštita, žetva…, količine, datumi, bilješke) | Vođenje evidencije i izvještaji | Izvršenje ugovora (b) |
| Tehnički zapisi o greškama (poruka greške, stranica bez upita, preglednik, verzija aplikacije) — **bez emaila, imena i kolačića** | Otkrivanje i ispravljanje grešaka | Legitimni interes (f) |
| Evidencija potrošnje satelitskih upita po korisniku | Zaštita od zlouporabe i poštivanje besplatnih kvota | Legitimni interes (f) |

Ne prikupljamo podatke o lokaciji uređaja, kontakte, fotografije ni podatke za plaćanje. Ne prodajemo podatke i ne koristimo ih za oglašavanje.

## 3. Kolačići i spremanje na uređaju
- Koristimo samo **nužne kolačiće prijave** (sesija). Za njih nije potrebna privola, pa nema bannera za kolačiće.
- Nema analitičkih ni oglasnih kolačića.
- Za rad bez signala na polju aplikacija na tvom uređaju sprema posjećene stranice, satelitske pločice i operacije koje čekaju slanje. Pri odjavi se spremljene stranice brišu.

## 4. Kome se podaci prosljeđuju (izvršitelji obrade)

| Pružatelj | Što radi | Gdje |
|---|---|---|
| Supabase | Baza podataka i prijava | EU (Frankfurt, Njemačka) |
| Cloudflare | Hosting aplikacije i satelitskog servisa | globalna mreža; ugovorne klauzule EU |
| Sinergise / Planet (Sentinel Hub) | Obrada satelitskih snimaka — prima **samo granice čestice i datum**, bez podataka o korisniku | EU |
| Sentry | Zapisi o greškama (bez osobnih podataka) | EU (Njemačka) |
| Open-Meteo | Vremenska prognoza — prima **samo koordinate čestice** | EU |
| Esri (ArcGIS) | Satelitska podloga karte — prima samo koordinate prikaza | SAD; standardne ugovorne klauzule |

## 5. Koliko dugo čuvamo podatke
- Podatke računa, čestica i operacija dok je račun aktivan.
- Nakon brisanja računa u aplikaciji: odmah.
- Zapise o greškama: najviše 30 dana (besplatni plan Sentryja).
- Sigurnosne kopije baze: [[prema planu Supabasea, npr. 7 dana]], nakon čega nestaju i obrisani podaci.

## 6. Tvoja prava
Imaš pravo na pristup, ispravak, brisanje, ograničenje obrade, prenosivost i prigovor.
- **Izvoz svih podataka**: u aplikaciji, Račun → „Preuzmi moje podatke” (JSON).
- **Ispravak**: čestice i operacije uređuješ sam u aplikaciji.
- **Brisanje računa**: u aplikaciji, Račun → „Obriši račun”. Brisanje je trenutno i trajno (uz potvrdu upisom emaila); iz sigurnosnih kopija nestaje nakon isteka njihova roka.
- Prigovor možeš podnijeti **Agenciji za zaštitu osobnih podataka (AZOP)**, azop.hr.

## 7. Sigurnost
Promet je šifriran (HTTPS). Svaki korisnik u bazi vidi samo svoja gospodarstva (pravila na razini redaka). Administratorski pristup zahtijeva dvofaktorsku prijavu. Lozinke se provjeravaju protiv popisa procurjelih lozinaka [[ako je uključeno u koraku 4]].

## 8. Izmjene
O bitnim izmjenama obavijestit ćemo korisnike emailom ili porukom u aplikaciji.

---

# NACRT — Uvjeti korištenja (kratko)

1. M-AGRO je besplatan alat u razvoju („beta”) i pruža se **„kakav jest”**.
2. NDVI, VRA preporuke i vremenska prognoza su **pomoć pri odlučivanju**, ne stručni agronomski savjet. Odluke o gnojidbi i zaštiti te usklađenost s propisima (npr. nitratna direktiva, evidencije za APPRRR) odgovornost su korisnika.
3. Korisnik odgovara za točnost podataka koje unese i čuva tajnost svoje lozinke.
4. Zabranjeno je automatizirano opterećivanje servisa i pokušaji pristupa tuđim podacima.
5. Usluga može biti privremeno nedostupna ili ograničena (npr. kad se iscrpi mjesečna satelitska kvota).
6. Korisnik može u svakom trenutku izvesti svoje podatke i zatražiti brisanje računa.
7. Mjerodavno je pravo Republike Hrvatske; nadležan je sud u [[mjesto]].

---

### Za pregled (Ivan)
- [ ] Popuniti `[[…]]` (naziv, adresa, OIB, kontakt email, mjesto suda).
- [x] Brisanje računa (korak 8): gumb u aplikaciji.
- [ ] Supabase backup: besplatni plan nema automatske dnevne kopije — uskladiti točku 5 s odlukom iz koraka 9.
- [ ] Po želji pregled pravnika prije pozivanja testera.
