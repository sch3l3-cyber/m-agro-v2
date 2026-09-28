import { describe, expect, it } from 'vitest';
import { sinkroniziraj, type Spremiste, type StavkaReda } from '../src/lib/offline/sinkronizacija';

function memorija(pocetno: StavkaReda[]): Spremiste & { mapa: Map<string, StavkaReda> } {
  const mapa = new Map(pocetno.map((s) => [s.localId, s]));
  return { mapa, sve: async () => [...mapa.values()], spremi: async (s) => void mapa.set(s.localId, s), obrisi: async (id) => void mapa.delete(id) };
}
const st = (id: string, dodano: string): StavkaReda => ({
  localId: id,
  cesticaId: 'c',
  gospodarstvoId: 'g',
  operacija: { tip: 'prihrana', datum: '2026-10-01', localId: id },
  dodano,
  pokusaja: 0,
});

describe('sinkronizacija reda (offline upis)', () => {
  it('šalje od najstarije i briše poslane', async () => {
    const m = memorija([st('b', '2026-10-01T10:00'), st('a', '2026-10-01T09:00')]);
    const redoslijed: string[] = [];
    const r = await sinkroniziraj(m, async (s) => (redoslijed.push(s.localId), 'ok'));
    expect(redoslijed).toEqual(['a', 'b']);
    expect(r).toEqual({ poslano: 2, greske: 0, bezMreze: false });
    expect(m.mapa.size).toBe(0);
  });

  it('bez mreže: staje, ništa se ne gubi, broji pokušaj', async () => {
    const m = memorija([st('a', '1'), st('b', '2')]);
    const r = await sinkroniziraj(m, async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(r.bezMreze).toBe(true);
    expect(m.mapa.size).toBe(2);
    expect(m.mapa.get('a')?.pokusaja).toBe(1);
  });

  it('trajna greška se označi i ne blokira ostale; sljedeći sink je preskače', async () => {
    const m = memorija([st('a', '1'), st('b', '2')]);
    const r = await sinkroniziraj(m, async (s) => (s.localId === 'a' ? { greska: 'Upiši gnojivo' } : 'ok'));
    expect(r).toEqual({ poslano: 1, greske: 1, bezMreze: false });
    expect(m.mapa.get('a')?.greska).toBe('Upiši gnojivo');
    let pozvano = 0;
    await sinkroniziraj(m, async () => (pozvano++, 'ok'));
    expect(pozvano).toBe(0);
  });
});
