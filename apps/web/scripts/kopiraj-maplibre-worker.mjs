// MapLibre 6 radi s modulskim web workerom koji traži ./maplibre-gl-shared.mjs pored sebe.
// Bundler (Turbopack) ne kopira te fajlove, pa ih stavljamo u public/ i Karta.tsx zove setWorkerUrl().
// Putanja sadrži verziju → nakon nadogradnje paketa preglednik ne koristi stari cache.
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkgPath = require.resolve('maplibre-gl/package.json');
const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));
const src = join(dirname(pkgPath), 'dist');
const dest = join(process.cwd(), 'public', 'maplibre');

rmSync(dest, { recursive: true, force: true });
mkdirSync(join(dest, version), { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(join(src, f), join(dest, version, f));
console.log(`[maplibre] worker ${version} → public/maplibre/${version}/`);
