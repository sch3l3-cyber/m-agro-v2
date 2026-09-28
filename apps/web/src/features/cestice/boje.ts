/** Boje poligona po vrsti uporabe (JD Operations Center stil — puna boja, bez markera). */
const PO_SIFRI: Record<number, string> = {
  200: '#e3b23c', // oranice — žito
  210: '#9aa5b1', // plastenici
  300: '#6cc04a',
  310: '#6cc04a', // livade
  320: '#8fd16a', // pašnjaci
  410: '#9b4f96', // vinogradi
  421: '#7a8c3a', // maslinici
  422: '#e0714f', // voćnjaci
};
export const ZADANA_BOJA = '#f2c14e';

export function bojaCestice(landUseId: number | null): string {
  return (landUseId !== null && PO_SIFRI[landUseId]) || ZADANA_BOJA;
}
