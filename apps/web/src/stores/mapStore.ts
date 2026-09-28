import { create } from 'zustand';

/**
 * Lekcija #13: jedan izvor istine za odabranu česticu — i lista i karta čitaju odavde.
 * `izvor` govori tko je promijenio odabir: karta ne radi flyTo kad je korisnik kliknuo na nju.
 */
interface MapState {
  odabranaId: string | null;
  izvor: 'karta' | 'lista' | null;
  odaberi: (id: string | null, izvor: 'karta' | 'lista') => void;
}

export const useMapStore = create<MapState>()((set) => ({
  odabranaId: null,
  izvor: null,
  odaberi: (id, izvor) => set({ odabranaId: id, izvor }),
}));
