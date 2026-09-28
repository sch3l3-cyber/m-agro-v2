import { create } from 'zustand';

/**
 * Lekcija #13: jedan izvor istine za odabranu česticu i NDVI sloj — lista, karta i panel čitaju odavde.
 * `izvor` govori tko je promijenio odabir: karta ne radi flyTo kad je korisnik kliknuo na nju.
 */
export interface Overlay {
  cesticaId: string;
  url: string; // blob: URL PNG-a
  /** [zapad, jug, istok, sjever] */
  bbox: [number, number, number, number];
}

interface MapState {
  odabranaId: string | null;
  izvor: 'karta' | 'lista' | null;
  overlay: Overlay | null;
  odaberi: (id: string | null, izvor: 'karta' | 'lista') => void;
  postaviOverlay: (o: Overlay | null) => void;
}

export const useMapStore = create<MapState>()((set, get) => ({
  odabranaId: null,
  izvor: null,
  overlay: null,
  odaberi: (id, izvor) => {
    // promjena čestice → makni snimku prethodne
    if (id !== get().odabranaId) get().postaviOverlay(null);
    set({ odabranaId: id, izvor });
  },
  postaviOverlay: (o) => {
    const staro = get().overlay;
    if (staro && staro.url !== o?.url) URL.revokeObjectURL(staro.url);
    set({ overlay: o });
  },
}));
