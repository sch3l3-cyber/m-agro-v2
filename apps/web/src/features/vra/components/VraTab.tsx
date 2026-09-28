'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { bojeZona, BROJ_ZONA, planVra, vraCsv, type BrojZona, type MetodaZona, type Strategija } from '@m-agro/domain';
import type { Cestica } from '@/lib/db';
import { dohvatiSliku, dohvatiTrend, SentinelKlijentGreska } from '@/lib/sentinel/client';
import { jeGreskaMreze, uRed } from '@/lib/offline/red';
import { useMapStore } from '@/stores/mapStore';
import { dodajOperaciju } from '@/features/operacije/actions';
import { PrognozaPrihrane } from './PrognozaPrihrane';

const fmtDan = new Intl.DateTimeFormat('hr-HR', { day: 'numeric', month: 'short' });
const n1 = (x: number) => x.toLocaleString('hr-HR', { maximumFractionDigits: 1 });
const n2 = (x: number) => x.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Raster {
  pikseli: Uint8Array;
  w: number;
  h: number;
}

function bboxOf(c: Cestica): [number, number, number, number] {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const poly of c.geom.coordinates)
    for (const ring of poly)
      for (const [x, y] of ring) {
        w = Math.min(w, x);
        s = Math.min(s, y);
        e = Math.max(e, x);
        n = Math.max(n, y);
      }
  return [w, s, e, n];
}

/** PNG (siva, UINT8) → točne vrijednosti piksela, bez korekcije boja/alfe. */
async function dekodirajPng(url: string): Promise<Raster> {
  const blob = await fetch(url).then((r) => r.blob());
  URL.revokeObjectURL(url);
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = cv.getContext('2d', { colorSpace: 'srgb' });
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bmp, 0, 0);
  const rgba = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const pikseli = new Uint8Array(bmp.width * bmp.height);
  for (let i = 0; i < pikseli.length; i++) pikseli[i] = rgba[i * 4] as number;
  return { pikseli, w: bmp.width, h: bmp.height };
}

/** Karta zona iz ISTOG niza koji je dao postotke (lekcija #12). */
async function slikaZona(zone: Int8Array, w: number, h: number, boje: string[]): Promise<string> {
  const cv = new OffscreenCanvas(w, h);
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const img = ctx.createImageData(w, h);
  const rgb = boje.map((b) => [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)]);
  for (let i = 0; i < zone.length; i++) {
    const z = zone[i] as number;
    if (z < 0) continue;
    const c = rgb[z] as number[];
    img.data.set([c[0] as number, c[1] as number, c[2] as number, 235], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return URL.createObjectURL(await cv.convertToBlob({ type: 'image/png' }));
}

type Stanje<T> = { status: 'ucitavam' } | { status: 'greska'; poruka: string } | { status: 'ok'; data: T };
const poruka = (e: unknown) => (e instanceof SentinelKlijentGreska ? e.message : 'Nešto je pošlo po zlu.');

export function VraTab({ cestica, gospodarstvoId, smijeUpisivati }: { cestica: Cestica; gospodarstvoId: string; smijeUpisivati: boolean }) {
  const postaviSloj = useMapStore((s) => s.postaviSloj);
  const bbox = useMemo(() => bboxOf(cestica), [cestica]);

  // čisti datumi (iz trenda — isti cache kao NDVI tab)
  const [datumi, setDatumi] = useState<Stanje<string[]>>({ status: 'ucitavam' });
  const [odabraniDatum, setDatum] = useState<string | null>(null);
  useEffect(() => {
    let a = true;
    dohvatiTrend(cestica.id)
      .then((t) => a && setDatumi({ status: 'ok', data: t.filter((x) => x.status === 'ok').map((x) => x.datum).reverse() }))
      .catch((e) => a && setDatumi({ status: 'greska', poruka: poruka(e) }));
    return () => {
      a = false;
    };
  }, [cestica.id]);
  const datum = odabraniDatum ?? (datumi.status === 'ok' ? (datumi.data[0] ?? null) : null);

  // sirovi NDVI za datum
  const [raster, setRaster] = useState<{ datum: string; s: Stanje<Raster> } | null>(null);
  useEffect(() => {
    if (!datum) return;
    let a = true;
    dohvatiSliku(cestica.id, datum, 'ndvi_sirovo')
      .then(dekodirajPng)
      .then((r) => a && setRaster({ datum, s: { status: 'ok', data: r } }))
      .catch((e) => a && setRaster({ datum, s: { status: 'greska', poruka: poruka(e) } }));
    return () => {
      a = false;
    };
  }, [cestica.id, datum]);
  const rs = useMemo<Stanje<Raster> | null>(() => (!datum ? null : raster?.datum === datum ? raster.s : { status: 'ucitavam' }), [datum, raster]);

  // postavke
  const [n, setN] = useState<BrojZona>(3);
  const [gnojivo, setGnojivo] = useState('KAN');
  const [dozaTekst, setDozaTekst] = useState('150');
  const [raspon, setRaspon] = useState(0.2);
  const [strategija, setStrategija] = useState<Strategija>('kompenzacijska');
  const [metoda, setMetoda] = useState<MetodaZona>('razmaci');
  const osnovna = Math.max(0, Number(dozaTekst.replace(',', '.')) || 0);

  const plan = useMemo(
    () => (rs?.status === 'ok' ? planVra(rs.data.pikseli, { n, cesticaHa: cestica.povrsinaHa, osnovnaDoza: osnovna, raspon, strategija, sirina: rs.data.w, metoda }) : null),
    [rs, n, cestica.povrsinaHa, osnovna, raspon, strategija, metoda],
  );
  const boje = bojeZona(n);

  // karta zona (ovisi samo o zonama, ne o dozi)
  const zonaPoPikselu = plan?.zonaPoPikselu;
  useEffect(() => {
    if (!zonaPoPikselu || rs?.status !== 'ok') return;
    let a = true;
    slikaZona(zonaPoPikselu, rs.data.w, rs.data.h, bojeZona(n)).then((url) => (a ? postaviSloj('vra', { cesticaId: cestica.id, url, bbox }) : URL.revokeObjectURL(url)));
    return () => {
      a = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zonaPoPikselu se mijenja s n/pikselima, ne s dozom
  }, [zonaPoPikselu, n]);
  useEffect(() => () => postaviSloj('vra', null), [postaviSloj]);

  // upis kao operacija
  const [upis, setUpis] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function upisi() {
    if (!plan || !datum) return;
    const prosjek = Math.round((plan.ukupno / Math.max(cestica.povrsinaHa, 1e-9)) * 10) / 10;
    const localId = crypto.randomUUID();
    const d = new Date();
    const danas = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const operacija = {
      tip: 'prihrana',
      localId,
      datum: danas,
      fert: gnojivo,
      amount: String(prosjek),
      unit: 'kg/ha',
      note: `VRA ${n} zona (NDVI ${datum}): ${plan.zone.map((z) => `${n1(z.dozaHa)}`).join(' / ')} kg/ha, ukupno ${n1(plan.ukupno)} kg`,
    };
    startTransition(async () => {
      try {
        const r = await dodajOperaciju({ cesticaId: cestica.id, gospodarstvoId, operacija });
        setUpis(r.ok ? 'Upisano u operacije (prosječna doza, zone u bilješci).' : r.poruka);
      } catch (e) {
        if (jeGreskaMreze(e)) {
          await uRed({ localId, cesticaId: cestica.id, gospodarstvoId, operacija });
          setUpis('Bez signala — upis čeka i poslat će se sam.');
        } else setUpis('Upis nije uspio.');
      }
    });
  }

  function izvoz() {
    if (!plan || !datum) return;
    const blob = new Blob([vraCsv(plan, { cestica: cestica.naziv, datum, gnojivo, jedinica: 'kg' })], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vra-${cestica.naziv.replace(/[^\p{L}\p{N}]+/gu, '-')}-${datum}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const razlika = plan ? plan.ukupno - plan.ukupnoJednoliko : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Snimka */}
      {datumi.status === 'ucitavam' && <p className="text-sm text-zinc-500">Tražim čiste snimke…</p>}
      {datumi.status === 'greska' && <p role="alert" className="text-sm text-red-700">{datumi.poruka}</p>}
      {datumi.status === 'ok' && datumi.data.length === 0 && <p className="text-sm text-zinc-600">Nema čistih snimaka u zadnjih 150 dana.</p>}
      {datumi.status === 'ok' && datumi.data.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium">Snimka</span>
          <select value={datum ?? ''} onChange={(e) => setDatum(e.target.value)} className="min-h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-2">
            {datumi.data.map((d) => (
              <option key={d} value={d}>
                {fmtDan.format(new Date(d))} {d.slice(0, 4)}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Postavke */}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1" role="radiogroup" aria-label="Broj zona">
        {BROJ_ZONA.map((z) => (
          <button key={z} type="button" role="radio" aria-checked={z === n} onClick={() => setN(z)} className={`min-h-10 rounded-md text-sm font-semibold ${z === n ? 'bg-white shadow-sm' : 'text-zinc-600'}`}>
            {z} zone
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Gnojivo</span>
          <input value={gnojivo} onChange={(e) => setGnojivo(e.target.value)} maxLength={60} className="min-h-11 rounded-lg border border-zinc-300 bg-white px-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Osnovna doza (kg/ha)</span>
          <input value={dozaTekst} onChange={(e) => setDozaTekst(e.target.value)} inputMode="decimal" className="min-h-11 rounded-lg border border-zinc-300 bg-white px-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Raspon doze</span>
          <select value={raspon} onChange={(e) => setRaspon(Number(e.target.value))} className="min-h-11 rounded-lg border border-zinc-300 bg-white px-2">
            {[0.1, 0.2, 0.3].map((r) => (
              <option key={r} value={r}>
                ±{r * 100} %
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-sm">
          <span className="font-medium">Podjela zona</span>
          <select value={metoda} onChange={(e) => setMetoda(e.target.value as MetodaZona)} className="min-h-11 rounded-lg border border-zinc-300 bg-white px-2">
            <option value="razmaci">po razlikama u usjevu (jednaki NDVI razmaci)</option>
            <option value="povrsine">jednake površine zona</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Više dobivaju</span>
          <select value={strategija} onChange={(e) => setStrategija(e.target.value as Strategija)} className="min-h-11 rounded-lg border border-zinc-300 bg-white px-2">
            <option value="kompenzacijska">slabiji dijelovi</option>
            <option value="produktivna">jači dijelovi</option>
          </select>
        </label>
      </div>

      <PrognozaPrihrane lat={(bbox[1] + bbox[3]) / 2} lon={(bbox[0] + bbox[2]) / 2} gnojivo={gnojivo} />

      {/* Rezultat */}
      {rs?.status === 'ucitavam' && <p className="text-sm text-zinc-500">Računam zone iz satelitske snimke…</p>}
      {rs?.status === 'greska' && <p role="alert" className="text-sm text-red-700">{rs.poruka}</p>}
      {plan && plan.cistihPiksela < 20 && <p className="rounded bg-zinc-100 p-2 text-sm">Premalo čistih piksela na toj snimci — odaberi drugu.</p>}
      {plan && plan.cistihPiksela >= 20 && (
        <>
          {plan.ujednaceno && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">Čestica je na ovoj snimci ujednačena — varijabilna doza ne donosi razliku.</p>}
          <table className="w-full text-sm" aria-label="Zone i doze">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="font-normal">Zona</th>
                <th className="font-normal">NDVI</th>
                <th className="text-right font-normal">Površina</th>
                <th className="text-right font-normal">Doza</th>
                <th className="text-right font-normal">Ukupno</th>
              </tr>
            </thead>
            <tbody>
              {plan.zone.map((z) => (
                <tr key={z.indeks} className="border-t border-zinc-100">
                  <td className="py-1">
                    <span className="mr-1.5 inline-block h-3 w-3 rounded-sm align-middle ring-1 ring-zinc-300" style={{ background: boje[z.indeks] }} aria-hidden />
                    {z.indeks + 1}
                  </td>
                  <td className="text-xs text-zinc-600">
                    {z.indeks === 0 ? '< ' + n2(z.do) : z.indeks === n - 1 ? '≥ ' + n2(z.od) : `${n2(z.od)}–${n2(z.do)}`}
                  </td>
                  <td className="text-right">
                    {z.postotak} %<span className="block text-xs text-zinc-500">{n2(z.ha)} ha</span>
                  </td>
                  <td className="text-right font-semibold">{n1(z.dozaHa)}</td>
                  <td className="text-right">{n1(z.ukupno)} kg</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-300 font-semibold">
                <td colSpan={2}>Ukupno</td>
                <td className="text-right">100 %</td>
                <td />
                <td className="text-right">{n1(plan.ukupno)} kg</td>
              </tr>
            </tfoot>
          </table>
          <p className="text-xs text-zinc-600">
            Jednolika doza {n1(osnovna)} kg/ha: {n1(plan.ukupnoJednoliko)} kg ({razlika >= 0 ? '+' : '−'}
            {n1(Math.abs(razlika))} kg s VRA). Zone su izračunate iz istih piksela koji su prikazani na karti.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={izvoz} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-list-700 ring-1 ring-zinc-300 hover:bg-list-500/10">
              Izvoz (CSV)
            </button>
            {smijeUpisivati && (
              <button type="button" onClick={upisi} disabled={pending} className="min-h-11 rounded-lg bg-list-600 px-3 text-sm font-semibold text-white hover:bg-list-700 disabled:opacity-60">
                {pending ? 'Upisujem…' : 'Upiši kao prihranu'}
              </button>
            )}
          </div>
          {upis && <p role="status" className="text-sm text-zinc-700">{upis}</p>}
        </>
      )}
    </div>
  );
}
