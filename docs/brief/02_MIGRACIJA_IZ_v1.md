# 🔄 M-AGRO — Migracija iz v1 u v2

> Što portamo, što ostavljamo, što gradimo nanovo. Koristi uz `00_START_HERE.md`.

---

## Odluka: paralel ili replace?

**Preporuka: paralel deploy dok v2 ne dostigne feature parity.**

- v1 ostaje na `magro-ndvi.pages.dev` (produkcija za trenutnih ~10 testera)
- v2 se razvija na `v2.m-agro.hr` (staging → produkcija)
- Kad v2 dostigne feature parity + prođe realnu testnu fazu → cut-over
- Migracija podataka: v1 Supabase → v2 Supabase (SQL script)

**Prednosti paralel deploya:**
- Trenutni korisnici ne ostaju bez servisa
- Testeri mogu paralelno probati obje verzije
- Nema pritiska da se v2 rushira

---

## Kategorija A: Portamo doslovno (radi, testirano)

### 1. Reprojekcija logika

**v1 fajl:** unutar `index.html`, funkcija `reprojectGeoJSON()`.
**v2 lokacija:** `apps/web/src/lib/proj4/reproject.ts`.

**Ključne stavke:**
- Podržani CRS: 3765 (HTRS96/TM), 3766 (HTRS96/LCC), 31276 (Gauss-Krüger), 32633 (UTM 33N)
- Auto-detekcija: koordinate > 180 → EPSG:3765 fallback
- Poziva se: korisnički upload, admin upload, prije spremanja u DB

**Test:** `(641750, 5022298) → (18.308°, 45.326°)` = Đakovština.

### 2. Sentinel Hub Worker

**v1 fajl:** `worker.js` (~645 linija).
**v2 lokacija:** `apps/workers/sentinel/src/index.ts`.

**Portati kao-je:**
- Auth token flow (Copernicus Dataspace)
- Catalog API (`/dates`)
- Statistics API (`/stats`) — **BEZ `resx/resy`**
- Process API (`/process`) — svi indeksi
- Sezonski kontrast (`getStretchForContrasted`)
- Evalscripts (NDVI, Contrasted, TrueColor, itd.)

**Nadograditi:**
- Rate limiting per user (KV)
- Cache u R2 (30 dana)
- Zod validacija ulaza
- Structured logging

### 3. NDVI paleta

Zelena, user-friendly (ne thermal). Portati sve razrede:
```
NDVI < 0    → plava (voda/oblaci)
0 – 0.1     → smeđa (gola zemlja)
0.1 – 0.35  → žuta (slaba)
0.35 – 0.5  → svj. zelena (umjerena)
0.5 – 0.65  → zelena (dobra)
> 0.65      → tamno zelena (gusta zdrava)
```

### 4. Supabase shema

**v1 shema:**
- `profiles`, `gospodarstva`, `cestice`, `operacije`, `admin_pregled`

**v2 shema (dopune):**
- PostGIS `GEOMETRY` umjesto `jsonb` za `geom_arkod` → prostorni indeksi
- Novo: `ndvi_cache` (cache za statistike)
- Novo: `audit_log` (admin akcije)
- Novo: `geom_precizna` polje na `cestice` (Faza 3 korekcija)

### 5. ARKOD GeoJSON parsing

Iz v1 `_parseArkodGeoJSON`:
- `home_name` → naziv čestice
- `land_use_id` (INT šifra) → `lpisName()` mapping → naziv kulture
- Površina: računa se iz geometrije (`turf.area`)
- Filtriranje: `is_active === true`

### 6. QGIS Script Generator

`arkod-app/` — standalone HTML alat.
**Ostaje neovisan.** Ne dio glavne app.
Deploy: statički fajl na `arkod.m-agro.hr` ili u dokumentaciji.

---

## Kategorija B: Portamo koncept, prepisujemo kod

### 1. Sync logika

**v1:** custom `syncToCloud()` / `syncFromCloud()` s ručnim mapping-om.
**v2:** TanStack Query mutations + `useOptimisticMutation`.

**Kritično pravilo iz v1:**
> **NIKAD** `owner_id` fallback u sync. SAMO `cloud_id`.

Ovo se u v2 osigurava strukturno:
```typescript
async function upsertCestica(cestica: Cestica) {
  if (!cestica.id) {
    // Bez id → uvijek insert
    return await supabase.from('cestice').insert(cestica);
  }
  return await supabase.from('cestice').update(cestica).eq('id', cestica.id);
}
```

### 2. Admin upload (3 moda)

**v1 modovi:** `merge`, `update`, `replace`.
**v2:** ostaju, ali kao server actions s progres barom, transakcijski.

```typescript
// features/admin/uploadCestice.ts
type UploadMode = 'merge' | 'update' | 'replace';

export async function uploadCestice(
  gospodarstvoId: string,
  geojson: FeatureCollection,
  mode: UploadMode
) {
  // Transakcija — sve ili ništa
  return await supabase.rpc('admin_upload_cestice', {
    p_gospodarstvo_id: gospodarstvoId,
    p_features: geojson.features,
    p_mode: mode,
  });
}
```

### 3. Karta u JD stilu

**v1 pristup:** Leaflet, `preferCanvas:true`, bez markera, highlight na klik.
**v2 pristup:** MapLibre GL vektorski (WebGL).

**Prednosti MapLibre:**
- 60fps na mobitelu čak i sa 500+ poligona
- Vector styles konfigurabilni JSON-om
- Ugrađeno raster overlay za NDVI slike
- Puno bolji touch performance

**Portati:**
- Highlight na klik (žuti obrub + bringToFront)
- Lista ↔ karta dvosmjerno povezivanje
- Mini SVG konture u listi (radi kao je, samo useMemo)

### 4. Datepicker na hrvatskom

**v1:** custom implementacija.
**v2:** `react-day-picker` + hrvatski locale + shadcn styling.

---

## Kategorija C: Gradimo nanovo (v1 nije imao)

### 1. Multi-gospodarstvo

**v1:** `syncFromCloud` uzima `gospodarstva[0]` — samo prvo.
**v2:** dropdown u header-u za odabir aktivnog gospodarstva. Persist u localStorage.

### 2. Offline mode (PWA)

**v1:** samo online.
**v2:** 
- Service worker + IndexedDB persistance
- Mutation queue za operacije upisane offline
- Sync indikator (koliko unosa čeka na sync)
- Konflikt resolution (last-write-wins default, manual za sporne)

### 3. Realtime (Faza 3)

Ako više korisnika istog OPG-a: Supabase Realtime channels per gospodarstvo.

### 4. AI savjetnik (Faza 3)

- Claude API preko Cloudflare Workera
- Kontekst: NDVI trend + operacije + vremenska prognoza + kultura
- Output: preporuke za sljedeći korak (prihrana, zaštita, rok žetve)
- Streaming odgovori

### 5. PDF export

- jsPDF + autoTable
- Kartica čestice: metadata + operacije + NDVI trend graph
- Godišnji izvještaj OPG-a

### 6. Testovi

**v1:** nema. Baguje se otkrivaju u produkciji.
**v2:** Vitest za lib/, Playwright za kritične flow-ove, GitHub Actions.

---

## Kategorija D: Namjerno ostavljamo iz v1

### 1. Analiza tab (višegodišnja)

**Status v1:** privremeno uklonjeno, čeka reimplementaciju.
**Odluka v2:** reimplementirati čisto u Fazi 2 (NDVI faza), nakon što bazni NDVI radi.

### 2. Emoji markeri na karti

**v1:** postojali → uklonjeni jer su lag-ali na mobitelu.
**v2:** ostaje bez markera. JD stil (obojeni poligoni + highlight).

### 3. VRA zone 5 i 7 (trenutni bug)

**v1 problem:** 5/7 zona ne renderiraju dobro, postoci se ne slažu.
**v2 pristup:** VRA logika ide u zaseban modul (`lib/vra/`) s unit testovima. Ne pisati opet u komponenti.

```typescript
// lib/vra/zones.ts
export function calculateZones(
  stats: NdviStats,
  numZones: 3 | 5 | 7
): VraZone[] {
  // Testirano izolirano
}

// tests/unit/vra.test.ts
describe('VRA zones', () => {
  it('3 zones sum to 100%', () => {
    const zones = calculateZones(mockStats, 3);
    expect(zones.reduce((s, z) => s + z.pct, 0)).toBe(100);
  });
  it('5 zones respect NDVI thresholds', ...);
  it('7 zones handle edge case (all same NDVI)', ...);
});
```

---

## Migracija podataka: v1 Supabase → v2 Supabase

Kad v2 bude spreman:

```sql
-- 1. Export iz v1 (na v2 storage)
COPY profiles TO '/tmp/v1_profiles.csv' CSV HEADER;
COPY gospodarstva TO '/tmp/v1_gospodarstva.csv' CSV HEADER;
COPY cestice TO '/tmp/v1_cestice.csv' CSV HEADER;
COPY operacije TO '/tmp/v1_operacije.csv' CSV HEADER;

-- 2. Import u v2 (uz konverziju jsonb geom_arkod → PostGIS geometry)
INSERT INTO cestice (id, gospodarstvo_id, arkod_id, naziv, kultura,
                     povrsina_ha, geom_arkod, local_id)
SELECT
  id, gospodarstvo_id, arkod_id, naziv, kultura,
  povrsina_ha,
  ST_GeomFromGeoJSON(geom_arkod::text)::GEOMETRY(Polygon, 4326),
  local_id
FROM v1_cestice_import;
```

**Backup strategija:** obavezno full snapshot v1 baze prije migracije.

---

## Timeline (procjena)

Uz Cowork potpuno dostupan (par sesija tjedno):

| Faza | Tjedni | Deliverable |
|------|--------|-------------|
| Faza 0: Temelji | 2 tj. | Repo + CI/CD + Auth |
| Faza 1: Data foundation | 3 tj. | Čestice na karti |
| Faza 2: NDVI | 3 tj. | NDVI + statistike + povijest |
| Faza 3: Operacije | 3 tj. | Offline evidencija + sync |
| Faza 4: VRA | 2 tj. | 3/5/7 zone s testovima |
| Faza 5: Polish + AI | 4 tj. | PWA, AI, launch spreman |
| **UKUPNO** | **~17 tj.** | v2 launch spreman |

Realno: 4-5 mjeseci uz Ivanov paralelni rad na polju + testiranje s farmerima.

---

## Checkpoint pitanja prije početka

- [ ] Je li dogovoreno paralel deploy (v1 + v2) ili replace?
- [ ] Domenu `m-agro.hr` — imaš li registriranu?
- [ ] Novi Supabase projekt ili preseljenje na v1 projekt?
- [ ] Cloudflare account: isti ili novi?
- [ ] GitHub repo: novi (privatan/javan)?
- [ ] Sentry projekt (besplatan tier)?
- [ ] Budžet za Sentinel Hub (ako pređe free tier)?
