import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { TIP_LABEL, TIPOVI_OPERACIJA, ukupnoInputa, type TipOperacije } from '@m-agro/domain';
import { getAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { GumbIspis } from './GumbIspis';

export const metadata: Metadata = { title: 'Godišnji izvještaj' };

const fmt = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 });
const fmt1 = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 1 });

/** Godišnji izvještaj OPG-a (05_ROADMAP Faza 5): čestice, kulture, operacije i potrošnja inputa. A4 / PDF. */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ godina?: string }> }) {
  const { id } = await params;
  const { godina: g } = await searchParams;
  const user = await getAuth().getUser();
  if (!user) redirect('/prijava');
  const db = getDb();
  const gosp = await db.gospodarstva.get(id, user.id);
  if (!gosp) notFound();
  const godina = g && /^\d{4}$/.test(g) ? Number(g) : new Date().getFullYear();
  const [cestice, ops] = await Promise.all([db.cestice.listByGospodarstvo(id), db.operacije.listByGospodarstvo(id, `${godina}-01-01`, `${godina}-12-31`)]);

  const ukupnoHa = cestice.reduce((a, c) => a + c.povrsinaHa, 0);
  const poKulturi = new Map<string, { ha: number; n: number }>();
  for (const c of cestice) {
    const k = c.kultura ?? 'nije upisano';
    const x = poKulturi.get(k) ?? { ha: 0, n: 0 };
    poKulturi.set(k, { ha: x.ha + c.povrsinaHa, n: x.n + 1 });
  }
  const poTipu = new Map<TipOperacije, number>();
  for (const o of ops) poTipu.set(o.tip, (poTipu.get(o.tip) ?? 0) + 1);
  const inputi = ukupnoInputa(ops);
  const zetve = ops.filter((o) => o.tip === 'zetva' && o.amount != null && o.unit === 't/ha');
  const poCestici = cestice
    .map((c) => ({ c, ops: ops.filter((o) => o.cesticaId === c.id) }))
    .filter((x) => x.ops.length > 0)
    .sort((a, b) => a.c.naziv.localeCompare(b.c.naziv, 'hr'));

  return (
    <article className="mx-auto max-w-[190mm] p-6 text-sm print:p-0">
      <GumbIspis />
      <header className="mb-4 border-b-2 border-list-700 pb-3">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Godišnji izvještaj · {godina}.</p>
        <h1 className="text-2xl font-bold">{gosp.naziv}</h1>
        {gosp.mibpg && <p className="text-zinc-600">MIBPG {gosp.mibpg}</p>}
        <p className="mt-1">
          <strong>{cestice.length}</strong> čestica · <strong>{fmt.format(ukupnoHa)} ha</strong> · <strong>{ops.length}</strong> operacija u {godina}.
        </p>
      </header>

      <section className="mb-5 break-inside-avoid">
        <h2 className="mb-1 text-base font-semibold">Struktura po kulturama</h2>
        <table className="w-full border-collapse">
          <tbody>
            {[...poKulturi].sort((a, b) => b[1].ha - a[1].ha).map(([k, x]) => (
              <tr key={k} className="border-b border-zinc-200">
                <td className="py-1">{k}</td>
                <td className="py-1 text-right">{x.n} čest.</td>
                <td className="py-1 text-right font-semibold">{fmt.format(x.ha)} ha</td>
                <td className="py-1 text-right text-zinc-500">{fmt1.format((x.ha / (ukupnoHa || 1)) * 100)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-5 break-inside-avoid">
        <h2 className="mb-1 text-base font-semibold">Operacije po vrsti</h2>
        <p>{TIPOVI_OPERACIJA.filter((t) => poTipu.get(t)).map((t) => `${TIP_LABEL[t]}: ${poTipu.get(t)}`).join(' · ') || 'Nema upisanih operacija.'}</p>
      </section>

      {inputi.length > 0 && (
        <section className="mb-5 break-inside-avoid">
          <h2 className="mb-1 text-base font-semibold">Potrošnja gnojiva i sredstava</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-400 text-left">
                <th className="py-1 font-semibold">Vrsta</th>
                <th className="py-1 font-semibold">Naziv</th>
                <th className="py-1 text-right font-semibold">Ukupno</th>
                <th className="py-1 text-right font-semibold">Tretirano</th>
              </tr>
            </thead>
            <tbody>
              {inputi.map((u) => (
                <tr key={`${u.tip}${u.naziv}${u.jedinica}`} className="border-b border-zinc-200">
                  <td className="py-1">{TIP_LABEL[u.tip]}</td>
                  <td className="py-1">{u.naziv}</td>
                  <td className="py-1 text-right font-semibold">
                    {fmt1.format(u.ukupno)} {u.jedinica}
                  </td>
                  <td className="py-1 text-right">
                    {fmt.format(u.ha)} ha · {u.primjena}×
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {zetve.length > 0 && (
        <section className="mb-5 break-inside-avoid">
          <h2 className="mb-1 text-base font-semibold">Žetva</h2>
          <table className="w-full border-collapse">
            <tbody>
              {zetve.map((o) => (
                <tr key={o.id} className="border-b border-zinc-200">
                  <td className="py-1">{o.cesticaNaziv}</td>
                  <td className="py-1">{o.kultura ?? ''}</td>
                  <td className="py-1 text-right font-semibold">{fmt1.format(o.amount ?? 0)} t/ha</td>
                  <td className="py-1 text-right">≈ {fmt1.format((o.amount ?? 0) * o.cesticaHa)} t</td>
                  <td className="py-1 text-right text-zinc-500">{o.vlaga != null ? `vlaga ${fmt1.format(o.vlaga)} %` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {poCestici.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-semibold">Po česticama</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-400 text-left">
                <th className="py-1 font-semibold">Čestica</th>
                <th className="py-1 font-semibold">Kultura</th>
                <th className="py-1 text-right font-semibold">ha</th>
                <th className="py-1 text-right font-semibold">Operacija</th>
              </tr>
            </thead>
            <tbody>
              {poCestici.map(({ c, ops: o }) => (
                <tr key={c.id} className="break-inside-avoid border-b border-zinc-200">
                  <td className="py-1">{c.naziv}</td>
                  <td className="py-1">{c.kultura ?? ''}</td>
                  <td className="py-1 text-right">{fmt.format(c.povrsinaHa)}</td>
                  <td className="py-1 text-right">{o.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="mt-8 border-t border-zinc-300 pt-2 text-xs text-zinc-500">Izrađeno u M-AGRO · {new Date().toLocaleDateString('hr-HR')}</footer>
    </article>
  );
}
