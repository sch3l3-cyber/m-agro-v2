# ADR-0003: Vendor SDK-ovi samo u `src/lib/**`

**Status:** prihvaćeno (2026-09-28)

- Feature kod koristi `getDb()`, `getAuth()`, `features.isEnabled()`; nikad `@supabase/*`, `@aws-sdk/*`, `@anthropic-ai/sdk`, `@sentry/*`.
- Pravilo: `packages/eslint-config` → `vendorBoundary()`. `packages/domain` nema nikakvih izuzetaka.
- Test koji dokazuje da pravilo radi: `apps/web/tests/vendor-boundary.test.ts`.
- `StorageClient`/`QueueClient` imaju samo sučelje dok se ne pojavi prvi potrošač (Faza 2) — 07: "ne praviti možda-će-trebati apstrakcije".
