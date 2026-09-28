/** ARKOD/LPIS šifre vrste uporabe zemljišta (portano iz v1). */
export const LPIS_SIFRE: Readonly<Record<number, string>> = {
  100: 'Obradivo zemljište',
  200: 'Oranice',
  210: 'Staklenici/plastenici',
  300: 'Trajni travnjaci',
  310: 'Livade',
  320: 'Pašnjaci',
  321: 'Krški pašnjaci',
  400: 'Trajni nasadi',
  410: 'Vinogradi',
  411: 'Iskrčeni vinograd',
  421: 'Maslinici',
  422: 'Voćne vrste',
  423: 'Bobičasto voće',
  430: 'Mješoviti trajni nasadi',
  450: 'Orašaste drvenaste kulture',
  451: 'Agrumi (citrusi)',
  490: 'Ostali trajni nasadi',
  500: 'Mješovito korištenje zemljišta',
  900: 'Ostale vrste korištenja',
  910: 'Iskrčena površina / pripremljeno tlo',
};

export function lpisNaziv(sifra: number | null | undefined): string | null {
  if (sifra === null || sifra === undefined || !Number.isFinite(sifra)) return null;
  return LPIS_SIFRE[sifra] ?? `Šifra ${sifra}`;
}
