# ADR-0001: Stack za v2 — Next.js 16 + OpenNext na Cloudflare Workers

**Status:** prihvaćeno (2026-09-28)

## Odluka
- Next.js **16** (App Router) + TypeScript 6 strict + Tailwind 4, monorepo (pnpm + turbo).
- Deploy: `@opennextjs/cloudflare` → Cloudflare **Workers** (ne Pages). `next-on-pages` je napušten.
- Brief je tražio Next 14, Ivan je odabrao "Next 15 + OpenNext"; uzeli smo aktualni 16 jer je 15 u održavanju, a OpenNext podržava oba.

## Posljedice
- **Veličina bundlea** je glavni rizik: free Workers = 3 MiB gzip. Faza 0 = ~2.1 MiB (68 %).
  CI pada iznad 2.8 MiB (`scripts/check-worker-size.mjs`). MapLibre/Recharts smiju biti samo client-side (`dynamic(..., { ssr: false })`).
- **`middleware.ts` umjesto `proxy.ts`.** Next 16 `proxy.ts` radi na Node runtimeu, što OpenNext na Cloudflareu
  označava kao eksperimentalno, a bundle naraste na 3.4 MiB (preko limita). Edge `middleware.ts` je deprecated
  ali podržan; build ispisuje upozorenje. Prelazimo na `proxy.ts` kad ga OpenNext službeno podrži.
