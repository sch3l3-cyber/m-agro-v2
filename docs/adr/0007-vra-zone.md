# ADR-0007: VRA zone — jedan izvor istine u pregledniku

**Status:** prihvaćeno (2026-09-29)

**Problem (lekcija #12):** u v1 su 3 zone koristile percentile, a 5/7 zona stdev; postoci u panelu računati su drugačije od slike na karti → nisu se slagali.

**Odluka:**
- Worker vraća **sirovi NDVI** čestice kao sivu PNG sliku (sloj `ndvi_sirovo`, UINT8: 0 = nema podatka, 1–255 ↔ NDVI −0,2…1,0; ~10 m piksel, SCL maska oblaka).
- Preglednik dekodira piksele (`createImageBitmap` bez korekcije boja) i **iz istog niza** računa pragove, dodjelu zona, postotke i crta kartu zona (`packages/domain/src/vra.ts`). Test provjerava da broj piksela po zoni na karti = tablica.
- **Jedan algoritam za 3/5/7 zona:** jednaki razmaci između p5 i p95 NDVI-ja čestice; krajnjih 5 % pada u rubne zone. Ujednačena čestica (p95 − p5 < 0,02) → sve u srednjoj zoni.
- Postoci su cijeli brojevi s metodom najvećeg ostatka → zbroj je uvijek točno 100.
- Doza po zoni: osnovna × (1 ± raspon) linearno; „kompenzacijska” (slabijima više) ili „produktivna” (jačima više).

**Posljedice:** jednaki razmaci na nesimetričnoj čestici daju zone nejednake površine (npr. strnište s travnatim rubom → većina u zoni 1). To je istinit prikaz; opcija „jednake površine” (kvantili) može se dodati kao drugi *način*, ali kroz istu funkciju i iste piksele.
