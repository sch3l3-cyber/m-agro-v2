/**
 * Preporuka termina za prihranu (rasipanje mineralnog N) iz dnevne prognoze.
 * Agronomska pravila (konzervativno, objašnjivo farmeru):
 *  - vjetar: rasipač baca neravnomjerno iznad ~25 km/h (udari), idealno < 15
 *  - jaka kiša istog/sljedećeg dana (> 20 mm): ispiranje i otjecanje → loše
 *  - umjerena kiša 3–15 mm u 1–3 dana NAKON: otapa i unosi gnojivo → idealno
 *  - UREA bez kiše 5+ dana uz toplo (> 20 °C): gubici amonijaka (hlapljenje) → oprez
 *  - smrznuto tlo (min < −3 °C): ne rasipati (otjecanje po smrznutom)
 */
export interface DanPrognoze {
  datum: string;
  kisaMm: number;
  vjetarMaxKmh: number;
  tMax: number;
  tMin: number;
}

export type Ocjena = 'dobro' | 'uvjetno' | 'lose';

export interface PreporukaDana {
  datum: string;
  ocjena: Ocjena;
  razlozi: string[];
}

export function preporukaPrihrane(dani: DanPrognoze[], gnojivo = 'KAN'): PreporukaDana[] {
  const urea = /urea/i.test(gnojivo);
  return dani.map((d, i) => {
    const razlozi: string[] = [];
    let ocjena: Ocjena = 'dobro';
    const pogorsaj = (o: Ocjena) => {
      if (o === 'lose' || (o === 'uvjetno' && ocjena === 'dobro')) ocjena = o;
    };
    const sutra = dani[i + 1];
    const kisaNakon = dani.slice(i + 1, i + 4).reduce((a, x) => a + x.kisaMm, 0);

    if (d.vjetarMaxKmh > 25) {
      pogorsaj('lose');
      razlozi.push(`jak vjetar (${Math.round(d.vjetarMaxKmh)} km/h)`);
    } else if (d.vjetarMaxKmh > 15) {
      pogorsaj('uvjetno');
      razlozi.push(`vjetar ${Math.round(d.vjetarMaxKmh)} km/h — rasipati ujutro`);
    }
    if (d.kisaMm > 20 || (sutra && sutra.kisaMm > 20)) {
      pogorsaj('lose');
      razlozi.push('jaka kiša — ispiranje');
    } else if (d.kisaMm > 8) {
      pogorsaj('uvjetno');
      razlozi.push(`kiša isti dan (${Math.round(d.kisaMm)} mm)`);
    }
    if (d.tMin < -3) {
      pogorsaj('lose');
      razlozi.push('smrznuto tlo');
    }
    if (kisaNakon >= 3 && kisaNakon <= 15 && !razlozi.some((r) => r.includes('jaka kiša'))) {
      razlozi.push(`kiša u sljedeća 3 dana (${Math.round(kisaNakon)} mm) unijet će gnojivo`);
    } else if (kisaNakon < 3) {
      if (urea && d.tMax > 20) {
        pogorsaj('uvjetno');
        razlozi.push('UREA bez kiše na toplom — gubici hlapljenjem');
      } else if (dani.length - i > 3) {
        razlozi.push('bez kiše 3 dana — gnojivo čeka vlagu');
      }
    }
    return { datum: d.datum, ocjena, razlozi };
  });
}
