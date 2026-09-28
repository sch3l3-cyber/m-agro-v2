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

export type VlasnikSloja = 'ndvi' | 'vra';

interface MapState {
  odabranaId: string | null;
  izvor: 'karta' | 'lista' | null;
  /** što karta TRENUTNO prikazuje = slojevi[aktivni] (Karta se pretplaćuje samo na ovo) */
  overlay: Overlay | null;
  /** svaki tab čuva svoj sloj; prebacivanje taba samo mijenja koji se prikazuje (bez ponovnog dohvata) */
  slojevi: Record<VlasnikSloja, Overlay | null>;
  aktivni: VlasnikSloja;
  postaviSloj: (vlasnik: VlasnikSloja, o: Overlay | null) => void;
  postaviAktivni: (v: VlasnikSloja) => void;
  /** px karte odozdo prekrivenih mobilnom pločom — karta centrira česticu iznad nje */
  donjiRub: number;
  postaviDonjiRub: (px: number) => void;
  odaberi: (id: string | null, izvor: 'karta' | 'lista') => void;
  postaviOverlay: (o: Overlay | null) => void;
}

export const useMapStore = create<MapState>()((set, get) => ({
  odabranaId: null,
  izvor: null,
  overlay: null,
  slojevi: { ndvi: null, vra: null },
  aktivni: 'ndvi',
  postaviSloj: (vlasnik, o) => {
    const staro = get().slojevi[vlasnik];
    if (staro && staro.url !== o?.url) URL.revokeObjectURL(staro.url);
    const slojevi = { ...get().slojevi, [vlasnik]: o };
    set({ slojevi, overlay: slojevi[get().aktivni] });
  },
  postaviAktivni: (v) => set({ aktivni: v, overlay: get().slojevi[v] }),
  donjiRub: 0,
  postaviDonjiRub: (px) => {
    if (Math.abs(px - get().donjiRub) > 2) set({ donjiRub: px });
  },
  odaberi: (id, izvor) => {
    // promjena čestice → makni snimke prethodne
    if (id !== get().odabranaId) {
      get().postaviSloj('ndvi', null);
      get().postaviSloj('vra', null);
    }
    set({ odabranaId: id, izvor });
  },
  /** NDVI tab (zadržano ime radi postojećeg koda) */
  postaviOverlay: (o) => get().postaviSloj('ndvi', o),
}));
