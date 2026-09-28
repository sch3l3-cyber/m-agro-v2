/**
 * VRA (varijabilna primjena) — JEDINI izvor istine za zone (lekcija #12).
 * Isti niz piksela → pragovi → dodjela zone → postoci I slika na karti. Nikad dva algoritma.
 *
 * Kodiranje sirovog NDVI-ja (evalscript `ndvi_sirovo` u sentinel workeru): UINT8,
 *   0 = nema podatka (oblak, sjena, izvan čestice), 1..255 ↔ NDVI −0.2 … 1.0 linearno.
 */
export const BROJ_ZONA = [3, 5, 7] as const;
export type BrojZona = (typeof BROJ_ZONA)[number];

const NDVI_MIN = -0.2;
const NDVI_MAX = 1.0;

export function dekodirajNdvi(v: number): number | null {
  if (v === 0) return null;
  return NDVI_MIN + ((v - 1) / 254) * (NDVI_MAX - NDVI_MIN);
}
/** Za testove i evalscript (mora biti inverz od dekodirajNdvi). */
export function kodirajNdvi(ndvi: number): number {
  const t = (Math.min(NDVI_MAX, Math.max(NDVI_MIN, ndvi)) - NDVI_MIN) / (NDVI_MAX - NDVI_MIN);
  return 1 + Math.round(t * 254);
}

function kvantil(sortirano: Float32Array | number[], q: number): number {
  if (sortirano.length === 0) return NaN;
  const i = (sortirano.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  const a = sortirano[lo] as number;
  const b = sortirano[hi] as number;
  return a + (b - a) * (i - lo);
}

/** Ispod ove razlike (p95 − p5) čestica je praktički ujednačena → sve u srednju zonu. */
export const MIN_RASPON = 0.02;

/**
 * Pragovi (n−1 vrijednosti, rastuće): jednaki razmaci između p5 i p95 čestice.
 * Isti algoritam za 3, 5 i 7 zona; krajnjih 5 % s obje strane pada u rubne zone (šum, rubovi).
 * Ujednačena čestica → prazna lista (vidi dodijeliZonu).
 */
export function pragoviZona(vrijednosti: ArrayLike<number>, n: BrojZona): number[] {
  const s = Float32Array.from(vrijednosti).sort();
  const p5 = kvantil(s, 0.05);
  const p95 = kvantil(s, 0.95);
  if (!(p95 - p5 >= MIN_RASPON)) return [];
  return Array.from({ length: n - 1 }, (_, i) => p5 + ((p95 - p5) * (i + 1)) / n);
}

/** Zona 0 = najslabiji NDVI … n−1 = najjači. Bez pragova (ujednačeno) → srednja zona. */
export function dodijeliZonu(ndvi: number, pragovi: number[], n: BrojZona): number {
  if (pragovi.length === 0) return Math.floor(n / 2);
  let z = 0;
  while (z < pragovi.length && ndvi >= (pragovi[z] as number)) z++;
  return z;
}

/** Cjelobrojni postoci koji se UVIJEK zbrajaju u 100 (metoda najvećeg ostatka). */
export function postociIzBrojeva(brojevi: number[]): number[] {
  const ukupno = brojevi.reduce((a, b) => a + b, 0);
  if (ukupno === 0) return brojevi.map(() => 0);
  const sirovo = brojevi.map((b) => (b / ukupno) * 100);
  const cijeli = sirovo.map(Math.floor);
  let ostatak = 100 - cijeli.reduce((a, b) => a + b, 0);
  const poOstatku = sirovo.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of poOstatku) {
    if (ostatak-- <= 0) break;
    cijeli[i] = (cijeli[i] as number) + 1;
  }
  return cijeli;
}

export type Strategija = 'kompenzacijska' | 'produktivna';

export interface ZonaVra {
  indeks: number;
  /** [od, do) NDVI; rubne zone otvorene prema −0.2 / 1.0 */
  od: number;
  do: number;
  piksela: number;
  postotak: number;
  ha: number;
  dozaHa: number;
  ukupno: number;
}

export interface PlanVra {
  zone: ZonaVra[];
  ujednaceno: boolean;
  /** zbroj po zonama */
  ukupno: number;
  /** usporedba: ista osnovna doza na cijeloj čestici */
  ukupnoJednoliko: number;
  cistihPiksela: number;
  /** za crtanje karte: zona po pikselu, −1 = nema podatka */
  zonaPoPikselu: Int8Array;
}

/**
 * Doza po zoni: osnovna × (1 ± raspon), linearno od najslabije do najjače zone.
 *  - kompenzacijska: slabije zone dobivaju VIŠE (npr. dušik u prihrani, izjednačavanje)
 *  - produktivna: jače zone dobivaju više (ulaganje gdje je potencijal)
 */
export function dozeZona(osnovna: number, n: BrojZona, raspon: number, strategija: Strategija): number[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * 2 - 1; // −1 … +1
    const k = strategija === 'kompenzacijska' ? -t : t;
    return Math.round(osnovna * (1 + k * raspon) * 10) / 10;
  });
}

/** Cijeli plan iz sirovih piksela (UINT8, vidi kodiranje gore). */
export function planVra(
  pikseli: ArrayLike<number>,
  opcije: { n: BrojZona; cesticaHa: number; osnovnaDoza: number; raspon: number; strategija: Strategija },
): PlanVra {
  const { n, cesticaHa, osnovnaDoza, raspon, strategija } = opcije;
  const ndvi: number[] = [];
  for (let i = 0; i < pikseli.length; i++) {
    const v = dekodirajNdvi(pikseli[i] as number);
    if (v !== null) ndvi.push(v);
  }
  const pragovi = pragoviZona(ndvi, n);
  const zonaPoPikselu = new Int8Array(pikseli.length).fill(-1);
  const brojevi = new Array<number>(n).fill(0);
  for (let i = 0; i < pikseli.length; i++) {
    const v = dekodirajNdvi(pikseli[i] as number);
    if (v === null) continue;
    const z = dodijeliZonu(v, pragovi, n);
    zonaPoPikselu[i] = z;
    brojevi[z] = (brojevi[z] as number) + 1;
  }
  const postoci = postociIzBrojeva(brojevi);
  const doze = dozeZona(osnovnaDoza, n, raspon, strategija);
  const ukupnoPiks = ndvi.length;
  const zone: ZonaVra[] = brojevi.map((b, i) => {
    const ha = ukupnoPiks ? (b / ukupnoPiks) * cesticaHa : 0;
    const dozaHa = doze[i] as number;
    return {
      indeks: i,
      od: i === 0 ? NDVI_MIN : (pragovi[i - 1] ?? NDVI_MIN),
      do: i === n - 1 ? NDVI_MAX : (pragovi[i] ?? NDVI_MAX),
      piksela: b,
      postotak: postoci[i] as number,
      ha,
      dozaHa,
      ukupno: ha * dozaHa,
    };
  });
  return {
    zone,
    ujednaceno: pragovi.length === 0,
    ukupno: zone.reduce((a, z) => a + z.ukupno, 0),
    ukupnoJednoliko: osnovnaDoza * cesticaHa,
    cistihPiksela: ukupnoPiks,
    zonaPoPikselu,
  };
}

/** Boje zona: crveno (slabo) → žuto → zeleno (jako), isti redoslijed za 3/5/7. */
export function bojeZona(n: BrojZona): string[] {
  const P: Record<BrojZona, string[]> = {
    3: ['#d7301f', '#fdd835', '#2e7d32'],
    5: ['#d7301f', '#fc8d59', '#fdd835', '#91cf60', '#1a9850'],
    7: ['#b2182b', '#d7301f', '#fc8d59', '#fdd835', '#91cf60', '#1a9850', '#006837'],
  };
  return P[n];
}

/** CSV plana za Excel / ručni unos u terminal rasipača. */
export function vraCsv(plan: PlanVra, meta: { cestica: string; datum: string; gnojivo: string; jedinica: string }): string {
  const br = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
  const redovi = plan.zone.map((z) => [`Zona ${z.indeks + 1}`, `${br(z.od)}–${br(z.do)}`, String(z.postotak), br(z.ha), br(z.dozaHa, 1), br(z.ukupno, 1)].join(';'));
  return (
    '﻿' +
    [
      `Čestica;${meta.cestica}`,
      `NDVI snimka;${meta.datum}`,
      `Gnojivo;${meta.gnojivo}`,
      '',
      `Zona;NDVI;Površina %;ha;Doza (${meta.jedinica}/ha);Ukupno (${meta.jedinica})`,
      ...redovi,
      `Ukupno;;100;${br(plan.zone.reduce((a, z) => a + z.ha, 0))};;${br(plan.ukupno, 1)}`,
    ].join('\r\n')
  );
}
