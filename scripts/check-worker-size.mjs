// Free Workers plan: max 3 MiB (gzip) po workeru. Pucamo build na 2.8 MiB da imamo rezervu.
// Pokretanje (nakon build:worker): node scripts/check-worker-size.mjs apps/web
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'apps/web';
const LIMIT_KIB = Number(process.env.WORKER_GZIP_LIMIT_KIB ?? 2867);
const out = execFileSync('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', mkdtempSync(join(tmpdir(), 'wsize-'))], {
  cwd: dir,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const m = out.match(/gzip:\s*([\d.]+)\s*KiB/);
if (!m) {
  console.error('Ne mogu pročitati veličinu bundlea iz wrangler outputa:\n' + out);
  process.exit(2);
}
const kib = Number(m[1]);
const pct = ((kib / 3072) * 100).toFixed(0);
console.log(`Worker ${dir}: ${kib} KiB gzip (${pct}% od 3 MiB free limita, prag ${LIMIT_KIB} KiB)`);
if (kib > LIMIT_KIB) {
  console.error('Bundle prevelik za free plan. Provjeri nove ovisnosti (MapLibre/Recharts moraju biti samo client-side).');
  process.exit(1);
}
