/**
 * NDVI semafor za jednostavni način (Faza 6). Objašnjiv i konzervativan:
 * uspoređuje zadnju čistu snimku s medijanom prethodnih (do 3) u zadnjih 45 dana.
 * Pad nakon upisane žetve ili obrade nije alarm (očekivan je).
 */
export type SemaforBoja = 'zeleno' | 'zuto' | 'crveno' | 'sivo';

export interface Semafor {
  boja: SemaforBoja;
  /** kratko, za listu: "Raste", "Stabilno", "Pad", "Nagli pad", "Požnjeveno", "Nema svježe snimke" */
  naslov: string;
  /** jedna rečenica: zašto */
  razlog: string;
  zadnjiNdvi: number | null;
  zadnjiDatum: string | null;
}

export interface NdviMjerenje {
  datum: string; // YYYY-MM-DD
  mean: number;
}

const DAN = 86_400_000;
const dana = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAN);
const f2 = (n: number) => n.toFixed(2).replace('.', ',');

function medijan(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

/**
 * @param mjerenja čiste snimke čestice (bilo kojim redom)
 * @param danas YYYY-MM-DD
 * @param zadnjaZetvaIliObrada datum zadnje žetve/obrade te čestice (ako postoji)
 */
export function ndviSemafor(mjerenja: NdviMjerenje[], danas: string, zadnjaZetvaIliObrada: string | null = null): Semafor {
  const niz = [...mjerenja].filter((m) => dana(m.datum, danas) >= 0 && dana(m.datum, danas) <= 45).sort((a, b) => a.datum.localeCompare(b.datum));
  const zadnja = niz.at(-1);
  if (!zadnja || dana(zadnja.datum, danas) > 30) {
    return { boja: 'sivo', naslov: 'Nema svježe snimke', razlog: 'U zadnjih 30 dana nema čiste satelitske snimke (oblaci ili snimke još nisu učitane).', zadnjiNdvi: zadnja?.mean ?? null, zadnjiDatum: zadnja?.datum ?? null };
  }
  const osnova = { zadnjiNdvi: zadnja.mean, zadnjiDatum: zadnja.datum };
  const prethodne = niz.slice(-4, -1);
  if (zadnjaZetvaIliObrada && prethodne.length > 0 && zadnjaZetvaIliObrada >= (prethodne.at(-1)?.datum ?? '') && zadnjaZetvaIliObrada <= zadnja.datum) {
    return { boja: 'sivo', naslov: 'Požnjeveno / obrađeno', razlog: 'Pad je očekivan jer je upisana žetva ili obrada.', ...osnova };
  }
  if (prethodne.length === 0) {
    return { boja: 'zeleno', naslov: `NDVI ${f2(zadnja.mean)}`, razlog: 'Samo jedna svježa snimka — trend još nije poznat.', ...osnova };
  }
  const m = medijan(prethodne.map((p) => p.mean));
  const razlika = zadnja.mean - m;
  const opis = `${f2(zadnja.mean)} prema ${f2(m)} ranije`;
  if (razlika <= -0.15) return { boja: 'crveno', naslov: 'Nagli pad', razlog: `NDVI ${opis}. Pogledaj česticu na terenu.`, ...osnova };
  if (razlika <= -0.07) return { boja: 'zuto', naslov: 'Pad', razlog: `NDVI ${opis}. Prati sljedeću snimku.`, ...osnova };
  if (razlika >= 0.05) return { boja: 'zeleno', naslov: 'Raste', razlog: `NDVI ${opis}.`, ...osnova };
  return { boja: 'zeleno', naslov: 'Stabilno', razlog: `NDVI ${opis}.`, ...osnova };
}

/** Sažetak po kulturama za početni ekran: kultura → broj čestica i ha, najveće prve. */
export function sazetakKultura<T extends { kultura: string | null; povrsinaHa: number }>(cestice: T[]): { kultura: string | null; broj: number; ha: number }[] {
  const m = new Map<string | null, { broj: number; ha: number }>();
  for (const c of cestice) {
    const k = c.kultura?.trim() || null;
    const v = m.get(k) ?? { broj: 0, ha: 0 };
    v.broj++;
    v.ha += c.povrsinaHa;
    m.set(k, v);
  }
  return [...m.entries()].map(([kultura, v]) => ({ kultura, ...v })).sort((a, b) => (a.kultura === null ? 1 : b.kultura === null ? -1 : b.ha - a.ha));
}
