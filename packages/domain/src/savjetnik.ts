import { z } from 'zod';
import type { DanPrognoze } from './prognoza';
import { preporukaPrihrane } from './prognoza';

/**
 * AI savjetnik — sastavljanje konteksta (Faza 5). Čista funkcija: ista ulazna stanja → isti tekst,
 * pa se može testirati bez Claudea. Kontekst NE sadrži email, ime ni ARKOD ID (nisu potrebni za savjet).
 */
export const PitanjeSchema = z.object({
  cesticaId: z.uuid(),
  pitanje: z.string().trim().min(2, 'Upiši pitanje.').max(1000, 'Pitanje je predugo (najviše 1000 znakova).'),
  povijest: z
    .array(z.object({ uloga: z.enum(['korisnik', 'asistent']), tekst: z.string().max(4000) }))
    .max(8)
    .default([]),
});
export type Pitanje = z.output<typeof PitanjeSchema>;

export interface NdviZapis {
  datum: string;
  mean: number;
  p10: number | null;
  p90: number | null;
}

export interface OperacijaZapis {
  datum: string;
  tip: string;
  kultura: string | null;
  fert: string | null;
  product: string | null;
  amount: number | null;
  unit: string | null;
  note: string | null;
}

export interface KontekstUlaz {
  danas: string; // YYYY-MM-DD (Europe/Zagreb)
  naziv: string;
  kultura: string | null;
  povrsinaHa: number;
  lat: number;
  lon: number;
  ndvi: NdviZapis[];
  operacije: OperacijaZapis[];
  prognoza: DanPrognoze[] | null;
}

export const SUSTAV_SAVJETNIK = `Ti si M-AGRO savjetnik, agronom za ratarstvo u kontinentalnoj Hrvatskoj (Slavonija, Baranja, Posavina).
Odgovaraš farmeru na hrvatskom jeziku, kratko i praktično, kao iskusni kolega na polju.

Pravila:
- Oslanjaj se na PODATKE O ČESTICI ispod (NDVI sa Sentinel-2, evidencija operacija, prognoza). Kad nešto zaključuješ iz podataka, reci iz kojih.
- Ako podataka nema ili su stari, reci to i predloži što provjeriti na terenu. Ne izmišljaj brojeve ni datume.
- NDVI tumači u kontekstu kulture i faze (npr. pad NDVI-ja kod zrenja žitarica je normalan; kod uljane repice visoki NDVI u cvatnji može značiti rizik polijeganja, ne veći prinos).
- Doze gnojiva i zaštite daj kao okvirne raspone uz napomenu da se usklade s analizom tla, deklaracijom sredstva i propisima (nitratna direktiva, dopuštena sredstva, karence). Ne preporučuj sredstva koja nisu registrirana u RH.
- Za vrijeme rasipanja/prskanja uzmi u obzir vjetar i kišu iz prognoze.
- Najviše ~200 riječi osim ako farmer traži detaljnije. Bez uvoda i ponavljanja pitanja. Koristi kratke odlomke ili natuknice.
- Ti si pomoć pri odlučivanju, ne zamjena za agronoma na terenu — kod ozbiljnih problema (bolesti, štetnici) preporuči pregled polja.`;

const f2 = (n: number) => n.toFixed(2);

/** Trend zadnjih snimki: razlika zadnje i prosjeka prethodnih (do 3). */
export function ndviTrend(ndvi: NdviZapis[]): 'raste' | 'pada' | 'stabilno' | null {
  const zadnjaT = ndvi.at(-1);
  if (ndvi.length < 2 || !zadnjaT) return null;
  const zadnja = zadnjaT.mean;
  const prije = ndvi.slice(-4, -1);
  const pros = prije.reduce((s, t) => s + t.mean, 0) / prije.length;
  const d = zadnja - pros;
  if (d > 0.05) return 'raste';
  if (d < -0.05) return 'pada';
  return 'stabilno';
}

export function sastaviKontekst(k: KontekstUlaz): string {
  const r: string[] = [];
  r.push(`PODACI O ČESTICI (danas je ${k.danas})`);
  r.push(`Čestica: ${k.naziv}; kultura: ${k.kultura ?? 'nije upisana'}; površina: ${k.povrsinaHa.toFixed(2)} ha; lokacija ≈ ${k.lat.toFixed(3)}° N, ${k.lon.toFixed(3)}° E.`);

  if (k.ndvi.length === 0) {
    r.push('NDVI: nema spremljenih čistih snimki (farmer još nije otvarao satelit za ovu česticu ili je bilo oblačno).');
  } else {
    const t = ndviTrend(k.ndvi);
    r.push(`NDVI (Sentinel-2, prosjek čestice; p10–p90 = raspon unutar čestice), ${k.ndvi.length} čistih snimki${t ? `, trend: ${t}` : ''}:`);
    for (const n of k.ndvi) {
      const raspon = n.p10 !== null && n.p90 !== null ? ` (p10–p90: ${f2(n.p10)}–${f2(n.p90)})` : '';
      r.push(`- ${n.datum}: ${f2(n.mean)}${raspon}`);
    }
  }

  if (k.operacije.length === 0) {
    r.push('Operacije: ništa upisano u evidenciji.');
  } else {
    r.push(`Operacije (evidencija, najnovije prve, ${k.operacije.length}):`);
    for (const o of k.operacije) {
      const dijelovi = [o.tip, o.kultura, o.fert ?? o.product, o.amount !== null ? `${o.amount} ${o.unit ?? ''}`.trim() : null, o.note ? `bilješka: ${o.note.slice(0, 120)}` : null].filter(Boolean);
      r.push(`- ${o.datum}: ${dijelovi.join(', ')}`);
    }
  }

  if (!k.prognoza || k.prognoza.length === 0) {
    r.push('Prognoza: nedostupna.');
  } else {
    const ocjene = preporukaPrihrane(k.prognoza);
    r.push('Prognoza 7 dana (Open-Meteo) i ocjena za rasipanje N gnojiva:');
    k.prognoza.forEach((d, i) => {
      const o = ocjene[i];
      r.push(`- ${d.datum}: ${Math.round(d.tMin)}–${Math.round(d.tMax)} °C, kiša ${d.kisaMm.toFixed(1)} mm, vjetar do ${Math.round(d.vjetarMaxKmh)} km/h${o ? `; rasipanje: ${o.ocjena}` : ''}`);
    });
  }
  return r.join('\n');
}

/** Središte (prosjek vrhova vanjskog prstena) — dovoljno za prognozu. */
export function srediste(coords: number[][][][]): { lat: number; lon: number } {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const poli of coords) {
    for (const [px, py] of poli[0] ?? []) {
      if (px === undefined || py === undefined) continue;
      x += px;
      y += py;
      n++;
    }
  }
  return n === 0 ? { lat: 45.3, lon: 18.4 } : { lat: y / n, lon: x / n };
}
