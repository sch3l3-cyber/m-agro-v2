import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { opisOperacije, TIP_LABEL, ukupnoInputa } from '@m-agro/domain';
import { getDb } from '@/lib/db';
import { GumbIspis } from './GumbIspis';

export const metadata: Metadata = { title: 'Kartica čestice' };

const fmtDatum = new Intl.DateTimeFormat('hr-HR', { day: 'numeric', month: 'numeric', year: 'numeric' });
const fmtBroj = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 });

/** Obris čestice kao SVG (lokalna ekvidistantna projekcija — dovoljno točno za crtež jedne čestice). */
function obris(geom: { coordinates: number[][][][] }, W = 260, H = 180) {
  const pts = geom.coordinates.flat(2) as number[][];
  const lat0 = (Math.min(...pts.map((p) => p[1] ?? 0)) + Math.max(...pts.map((p) => p[1] ?? 0))) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => (p[0] ?? 0) * k);
  const ys = pts.map((p) => p[1] ?? 0);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min((W - 10) / (x1 - x0 || 1), (H - 10) / (y1 - y0 || 1));
  const d = geom.coordinates
    .flatMap((poly) => poly.map((ring) => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${(5 + ((x ?? 0) * k - x0) * s).toFixed(1)},${(5 + (y1 - (y ?? 0)) * s).toFixed(1)}`).join('') + 'Z'))
    .join('');
  const sirinaM = (x1 - x0) * 111_320;
  return { d, W, H, mjerilo: sirinaM };
}

export default async function Page({ params, searchParams }: { params: Promise<{ cid: string }>; searchParams: Promise<{ gosp?: string; godina?: string }> }) {
  const { cid } = await params;
  const { gosp, godina: g } = await searchParams;
  if (!gosp || !/^[0-9a-f-]{36}$/.test(cid) || !/^[0-9a-f-]{36}$/.test(gosp)) notFound();
  const db = getDb();
  const cestica = (await db.cestice.listByGospodarstvo(gosp)).find((c) => c.id === cid);
  if (!cestica) notFound();
  const godina = g && /^\d{4}$/.test(g) ? Number(g) : new Date().getFullYear();
  const ops = (await db.operacije.listByCestica(cid)).filter((o) => o.datum.startsWith(String(godina))).reverse();
  const ukupno = ukupnoInputa(ops.map((o) => ({ ...o, cesticaNaziv: cestica.naziv, cesticaHa: cestica.povrsinaHa })));
  const o = obris(cestica.geom as unknown as { coordinates: number[][][][] });

  return (
    <article className="mx-auto max-w-[190mm] p-6 print:p-0">
      <GumbIspis />
      <header className="mb-4 flex items-start justify-between gap-4 border-b-2 border-list-700 pb-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Kartica čestice · {godina}.</p>
          <h1 className="text-2xl font-bold">{cestica.naziv}</h1>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
            <dt className="text-zinc-500">Površina</dt>
            <dd className="font-semibold">{fmtBroj.format(cestica.povrsinaHa)} ha</dd>
            {cestica.arkodId && (
              <>
                <dt className="text-zinc-500">ARKOD</dt>
                <dd>{cestica.arkodId}</dd>
              </>
            )}
            <dt className="text-zinc-500">Kultura</dt>
            <dd>{cestica.kultura ?? '—'}</dd>
          </dl>
        </div>
        <svg viewBox={`0 0 ${o.W} ${o.H}`} width={o.W} height={o.H} className="flex-shrink-0" role="img" aria-label="Obris čestice">
          <path d={o.d} fill="#a1d76a" fillOpacity={0.35} stroke="#2f6f2f" strokeWidth={1.5} />
          <text x={o.W - 4} y={o.H - 4} textAnchor="end" fontSize={9} fill="#71717a">
            širina ≈ {Math.round(o.mjerilo)} m · sjever gore
          </text>
        </svg>
      </header>

      <h2 className="mb-2 text-lg font-semibold">Operacije ({ops.length})</h2>
      {ops.length === 0 ? (
        <p className="text-sm text-zinc-600">U {godina}. nema upisanih operacija.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-400 text-left">
              <th className="py-1 pr-2 font-semibold">Datum</th>
              <th className="py-1 pr-2 font-semibold">Vrsta</th>
              <th className="py-1 pr-2 font-semibold">Opis</th>
              <th className="py-1 font-semibold">Bilješka</th>
            </tr>
          </thead>
          <tbody>
            {ops.map((x) => (
              <tr key={x.id} className="break-inside-avoid border-b border-zinc-200 align-top">
                <td className="whitespace-nowrap py-1 pr-2">{fmtDatum.format(new Date(`${x.datum}T12:00:00`))}</td>
                <td className="py-1 pr-2">{TIP_LABEL[x.tip]}</td>
                <td className="py-1 pr-2">{opisOperacije(x)}</td>
                <td className="py-1 text-zinc-600">{x.tip === 'ostalo' ? '' : (x.note ?? '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {ukupno.length > 0 && (
        <>
          <h2 className="mb-2 mt-5 text-lg font-semibold">Ukupno potrošeno</h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {ukupno.map((u) => (
                <tr key={`${u.tip}${u.naziv}${u.jedinica}`} className="border-b border-zinc-200">
                  <td className="py-1 pr-2">{TIP_LABEL[u.tip]}</td>
                  <td className="py-1 pr-2">{u.naziv}</td>
                  <td className="py-1 pr-2 text-right font-semibold">
                    {fmtBroj.format(u.ukupno)} {u.jedinica}
                  </td>
                  <td className="py-1 text-right text-zinc-600">{fmtBroj.format(u.ukupno / cestica.povrsinaHa)} {u.jedinica}/ha</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <footer className="mt-8 border-t border-zinc-300 pt-2 text-xs text-zinc-500">
        Izrađeno u M-AGRO · {fmtDatum.format(new Date())}
      </footer>
    </article>
  );
}
