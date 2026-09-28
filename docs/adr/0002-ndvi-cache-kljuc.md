# ADR-0002: Ključ dijeljenog NDVI cachea = hash geometrije + datum

**Status:** prihvaćeno (2026-09-28)

## Kontekst
`01_ARHITEKTURA_v2.md` veže `ndvi_cache` na `cestica_id`, a `07_FREE_TIER_STRATEGY.md` traži dijeljenje po `arkod_id`.
S `cestica_id` se cache nikad ne dijeli (svaki korisnik ima svoj redak čestice) → free tier puca na ~20 korisnika.
`arkod_id` nije dovoljan: ista ARKOD oznaka nakon ažuriranja može imati drugačiju granicu, a KML/ručni uvoz nema `arkod_id`.

## Odluka
- `cestice.geom_hash = md5(ST_AsBinary(geom_arkod))` (generirani stupac).
- `ndvi_cache` PK = `(geom_hash, datum)`. Piše ga samo Worker (service_role).
- RLS: korisnik čita statistiku samo za geometriju koju i sam ima.
- R2 ključ (Faza 2): `ndvi-shared/{geom_hash}/{datum}/{layer}.png`.
