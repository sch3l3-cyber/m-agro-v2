# 💡 M-AGRO — Naučene lekcije iz v1

> Kritični bugovi iz v1 i njihovi uzroci. Ove greške NE SMIJU se ponoviti u v2.
> Svaka lekcija dolazi s **preventivnom mjerom** — kako spriječiti strukturno, ne samo pažnjom.

---

## 1. Sentinel Hub "1 piksel" bug

**Simptom:** NDVI statistike vraćaju `min = max = mean` (jedan piksel za cijelu parcelu).

**Uzrok:** `resx:10`/`resy:10` u Statistics API `aggregation` configu. Ovi parametri postavljaju target output rezoluciju, ne input — za malu parcelu to znači 1 output piksel.

**v2 prevencija:**
- Konstante `SENTINEL_STATS_CONFIG` **nemaju** `resx`/`resy` polja
- Type sustav: `AggregationConfig` interface **ne dopušta** te propove
- Unit test: mock request potvrđuje da `resx`/`resy` nisu u payloadu
- Komentar u kodu: `// NIKAD ne dodavati resx/resy — vidi 04_LEKCIJE.md#1`

---

## 2. `syncToCloud` brisao je čestice

**Simptom:** Dodavanje novog gospodarstva obrisalo je sve prethodne čestice korisnika.

**Uzrok:** `syncToCloud` tražio postojeće gospodarstvo po `owner_id` (fallback), nalazio staro/tuđe, prepisao mu `cloud_id`, pa CASCADE DELETE očistio čestice.

**v2 prevencija:**
- Sync SAMO preko `cloud_id`. Bez `cloud_id` → **uvijek** INSERT.
- TypeScript: `Gospodarstvo` type ima `id: string | null`. Funkcija `syncGospodarstvo(g: Gospodarstvo)`:
  ```typescript
  if (g.id === null) {
    return await createGospodarstvo(g);   // insert
  }
  return await updateGospodarstvo(g.id, g);  // update by id
  ```
- **Nema** funkcije koja radi "find or create" po `owner_id`.
- E2E test: kreira dva gospodarstva, sync oba, provjeri da nijedno nema izbrisane čestice.

---

## 3. Koordinatni sustav — EPSG:3765 vs WGS84

**Simptom:** Površina "-800000 ha", karta prikazuje cijelu Zemlju.

**Uzrok:** ARKOD GeoJSON je u EPSG:3765 (HTRS96/TM) s koordinatama u metrima (~641000, 5022000). Leaflet i turf.area očekuju WGS84 stupnjeve.

**v2 prevencija:**
- Sav geometrijski I/O prolazi kroz `lib/proj4/reproject.ts`
- **Custom type** `WGS84Geometry` (branded type) razdvaja od `RawGeometry`:
  ```typescript
  type WGS84Geometry = Polygon & { __wgs84: true };
  type RawGeometry = Polygon;
  
  function reproject(g: RawGeometry): WGS84Geometry { /* ... */ }
  function calculateArea(g: WGS84Geometry): number { /* ... */ }
  ```
- Kompajler odbija `calculateArea(rawGeom)` — mora se prvo reprojektirati.
- Zod validacija: koordinate polygon-a moraju biti u rasponu [-180..180, -90..90].
- Unit test: `(641750, 5022298) → (18.308°, 45.326°)` = Đakovština.

---

## 4. Zaostale DOM reference rušile funkcije

**Simptom:** NDVI se ne prikazuje. JS: `TypeError: Cannot set properties of null`.

**Uzrok:** Element `#leg` (legenda) uklonjen iz HTML-a. JavaScript reference (`document.getElementById('leg').style...`) ostale. Tihi crash na runtime-u.

**v2 prevencija:**
- **React eliminira ovu klasu bugova.** Nema `getElementById` — komponente su vlasnik svog DOM-a.
- Refs se koriste kroz `useRef<HTMLDivElement>(null)` s null-check.
- Ako komponenta ne postoji, ref je `null` — TypeScript to prisiljava provjeriti.

---

## 5. Naziv "Čestica" umjesto pravog imena

**Simptom:** Sve čestice u UI-u prikazuju generičko "Čestica".

**Uzrok:** Admin upload čitao `props.name || NAZIV || naziv`, ali ARKOD GeoJSON ima naziv u `home_name`, kulturu u `land_use_id` (šifra, ne tekst).

**v2 prevencija:**
- Parsing centraliziran u `lib/geojson/arkod.ts`:
  ```typescript
  const ArkodPropsSchema = z.object({
    home_name: z.string().min(1),
    land_use_id: z.number().int().nullable(),
    is_active: z.boolean().optional(),
  });
  
  export function parseArkodFeature(f: Feature): Cestica {
    const props = ArkodPropsSchema.parse(f.properties);
    return {
      naziv: props.home_name,
      kultura: lpisName(props.land_use_id),
      // ...
    };
  }
  ```
- Zod baca grešku ako `home_name` nedostaje. Nema tihe fallback vrijednosti.
- Migracija za popravak postojećih podataka (ako se treba, iz v1 baze).

---

## 6. Tabovi nestajali pri browser zoomu

**Simptom:** Redak tabova (Pregled/Snimka/Napredno) nestaje na 90% ili 110% zoom.

**Uzrok:** `position:sticky` na tabovima — nepouzdan pri sub-pixel renderiranju.

**v2 prevencija:**
- **Ne koristiti `position:sticky`** za kritične UI elemente (header, tabs, footer).
- Umjesto toga: flex layout s `flex-shrink:0` za fiksne dijelove, scroll na zasebnom kontejneru:
  ```tsx
  <div className="flex flex-col h-screen">
    <header className="flex-shrink-0">...</header>
    <nav className="flex-shrink-0">tabs</nav>
    <main className="flex-1 overflow-y-auto">{content}</main>
  </div>
  ```
- Visual regression test s Playwright: screenshot na 90%, 100%, 110% zoom.

---

## 7. Karta lag na mobitelu

**Simptom:** Pri panu/zoomu na mobitelu ogroman lag, aplikacija skoro neupotrebljiva.

**Uzroci (kombinacija):**
- SVG renderer za poligone (Leaflet default)
- 86 HTML divIcon markera (svaki DOM element)
- `mouseover`/`mouseout` handleri koji trigger-aju reflow
- `fitBounds` na svaki tab switch

**Rješenja iz v1:**
- `preferCanvas: true` za Leaflet
- Uklonjeni markeri (JD stil)
- `mouseover` samo na desktopu (`isTouch` check)
- `fitBounds` samo prvi put (`_mapFitted` flag)

**v2 prevencija:**
- MapLibre GL koristi WebGL — 60fps po defaultu za tisuće poligona.
- Standardna pravila: no unnecessary re-renders (memo), no expensive computation u render loop.
- Perf test: Playwright + Chrome DevTools protocol, measure FPS na mobile viewport.

---

## 8. Dupli emoji markeri (kad su postojali)

**Uzrok:** `_emojiMarkers` spremao `{m:marker, baseSize}` objekte, ali `map.removeLayer(o)` očekivao je marker direktno, ne wrapper.

**v2 prevencija:**
- Ako se marker-i uopće koriste (unlikely, jer MapLibre stil je bolji): jasno tipizirani containeri s `.instance` propom.
- Bolje: koristi ID mapping (`Map<string, Marker>`), remove by ID.

---

## 9. Email "već registriran" nakon brisanja

**Uzrok:** Supabase čuva korisnike u `auth.users` i nakon brisanja iz Table Editor-a. Table Editor briše samo `profiles`, ne `auth.users`.

**v2 prevencija:**
- Admin UI za brisanje korisnika koristi `supabase.auth.admin.deleteUser()` server-side, s service_role key.
- Cascade delete: `profiles.id → auth.users.id ON DELETE CASCADE` → brisanje `auth.users` briše profile.
- Test: kreiraj → obriši → ponovi registraciju s istim emailom → mora uspjeti.

---

## 10. Dupli "Nova operacija" gumbi

**Uzrok:** FAB (Floating Action Button) kreiran u `renderAllOps()` (svaki put kad se render pozove), + zaseban "+" gumb na home viewu.

**v2 prevencija:**
- React komponente. Gumb je komponenta koja se renderira jednom.
- Explicit state (`showAddOperacijaButton`) ako treba uvjetno prikazivanje.

---

## 11. Analiza tab bio uklonjen "privremeno"

**Simptom:** Višegodišnja analiza NDVI-a maknuta jer je bila problematična, nije se vratila.

**v2 prevencija:**
- Ne raditi "privremeno uklanjanje" bez GitHub Issue-a s deadline-om.
- Feature flag-ovi umjesto uklanjanja: `if (features.analiza) { ... }`.

---

## 12. VRA zone 5 i 7 ne rade dobro

**Simptom:** 3 zone rade, 5 i 7 ne renderiraju pravilno, postoci se ne slažu s vizualom.

**Uzrok (vjerojatan):**
- Različiti algoritmi za 3 vs 5/7 zona (percentile vs stdev)
- Frontend računa postotke iz percentila (aproksimacija), backend renderira po različitim thresholdima
- Nema testova za edge case-ove (uniformna parcela, ekstremne vrijednosti)

**v2 prevencija:**
- VRA logika u zasebnom modulu `lib/vra/` s pure funkcijama
- Unit testovi za 3/5/7 zona, edge case-ovi
- Isti algoritam za frontend prikaz i backend rendering (SSOT — Single Source of Truth)
- Snapshot testovi za outputs

```typescript
// lib/vra/zones.ts
export function calculateZoneThresholds(
  stats: NdviStats,
  numZones: 3 | 5 | 7
): number[] { /* ... */ }

export function assignPixelToZone(
  ndvi: number,
  thresholds: number[]
): number { /* ... */ }

export function calculateZonePercentages(
  thresholds: number[],
  histogram: NdviHistogram
): number[] { /* ... */ }

// tests/unit/vra.test.ts
describe('VRA zones', () => {
  test.each([3, 5, 7])('n=%i zones sum to 100%', (n) => {
    const thresholds = calculateZoneThresholds(mockStats, n);
    const pcts = calculateZonePercentages(thresholds, mockHistogram);
    expect(pcts.reduce((s, p) => s + p, 0)).toBe(100);
  });
  
  test('uniform NDVI produces empty zones except middle', () => {
    // Ako svi pikseli imaju NDVI=0.5, samo srednja zona ima piksele
  });
});
```

---

## 13. Datumi se ne usklađuju (v1 UI bug)

**Simptom:** Korisnik odabere drugi datum u VRA dropdownu, NDVI slika ostaje na prethodnom.

**Uzrok:** State management ad-hoc — dva izvora istine (dropdown value + latestDate global).

**v2 prevencija:**
- Zustand ili URL state kao SSOT.
- Svi dijelovi UI-a reagiraju na `useMapStore(s => s.selectedDate)`.
- Nema paralelnih varijabli.

---

## 14. NDVI loading vrtio u nedogled

**Simptom:** Loading spinner nikad ne nestaje kad Sentinel API pukne tiho.

**Uzrok:**
- Nema timeout-a na fetch
- Error handling loše — hvata sve, ali ne prikazuje ništa
- Nema retry logike

**v2 prevencija:**
- TanStack Query s ugrađenim retry (3x s exponential backoff) i timeout (30s).
- Error boundary komponenta prikazuje smisleni error u UI-u.
- Nikad `catch (e) {}` — barem log ili re-throw.

---

## 15. Podaci se izgubili pri context reset-u chata

**Uzrok razvoja s AI-em:** Ivan bi svakih ~15 poruka morao otvoriti novi chat (context prepun slika), i onda gubio je detalje o stanju.

**v2 prevencija:**
- Cowork ima persistent state → nema gubljenja konteksta.
- Kodovi u git-u — jedini izvor istine.
- Dokumentacija se svakim značajnim korakom osvježava (ovaj brief paket).

---

## Opća pravila iz svih ovih lekcija

1. **Type safety > runtime provjere**
   TypeScript strict mode + Zod. Kompajler hvata što bi drugačije bio runtime bug.

2. **Pure funkcije + unit testovi za "matematičku" logiku**
   VRA, reprojekcija, izračun površine, parsing GeoJSON-a — sve pure funkcije. Sve testirano.

3. **Single Source of Truth za state**
   Zustand ili URL. Ne globalne varijable, ne "dva različita mjesta imaju istu informaciju".

4. **Fail loud, ne fail silent**
   Bolje eksplicitni error toast nego "loading spinner zauvijek".

5. **Ne oslanjati se na dogovor, oslanjaj se na tip sustav**
   Ako pravilo "nikad ne pošaljemo owner_id u sync" mora biti u dokumentaciji — tada tip sustav mora to prisiljavati, ne dokumentacija.

6. **Automatski deploy, automatski test**
   Nema "zaboravio sam pokrenuti testove". CI radi to.

7. **Perzistentna dokumentacija u repou**
   `docs/` folder u repou. Update s kodom u istoj PR.

8. **Feature flags umjesto "privremenog uklanjanja"**
   Kod ostaje, feature isključen. Reaktivacija je preklopka.
