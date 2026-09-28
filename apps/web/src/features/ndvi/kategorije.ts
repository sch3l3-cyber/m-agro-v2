/** Kvalitativne kategorije NDVI-ja — iste granice kao paleta slike (evalscript NDVI, v1). */
export const NDVI_RAZREDI = [
  { do: 0, boja: '#4575b4', naziv: 'Voda / oblaci' },
  { do: 0.1, boja: '#a66218', naziv: 'Gola zemlja' },
  { do: 0.2, boja: '#dfc27d', naziv: 'Vrlo slaba vegetacija' },
  { do: 0.35, boja: '#ffe664', naziv: 'Slaba vegetacija' },
  { do: 0.5, boja: '#a1d76a', naziv: 'Umjerena vegetacija' },
  { do: 0.65, boja: '#4dac26', naziv: 'Dobra vegetacija' },
  { do: Infinity, boja: '#006837', naziv: 'Gusta, zdrava vegetacija' },
] as const;

export function razred(ndvi: number) {
  // zadnji razred ima do = Infinity, pa find uvijek nešto nađe (osim NaN)
  return NDVI_RAZREDI.find((r) => ndvi < r.do) ?? NDVI_RAZREDI[6];
}

export const KONTRAST_LEGENDA = ['#d73027', '#f46d43', '#fdae61', '#fee08b', '#a6d96a', '#66bd63', '#1a9850'];
