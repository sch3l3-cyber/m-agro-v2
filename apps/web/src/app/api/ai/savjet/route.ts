import { after } from 'next/server';
import { PitanjeSchema, SUSTAV_SAVJETNIK, sastaviKontekst, srediste } from '@m-agro/domain';
import { getAi, AIGreska } from '@/lib/ai';
import { getAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { dohvatiOpenMeteo } from '@/lib/meteo/openmeteo';
import { posaljiGreskuServer } from '@/lib/monitoring/server';

export const dynamic = 'force-dynamic';

const PO_SATU = 20; // 03_SIGURNOST: 20 poruka/h po korisniku
const PROCJENA_PREKIDA_USD = 0.02; // ako se tok prekine prije kraja, knjiži se procjena

const odgovor = (status: number, poruka: string) => new Response(poruka, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

/**
 * AI savjetnik (Faza 5): pitanje o čestici → Claude odgovor kao text stream.
 * Kontekst (NDVI iz cachea, operacije, prognoza) sastavlja server — klijent šalje samo id čestice i pitanje.
 */
export async function POST(req: Request) {
  const ai = getAi();
  if (!ai) return odgovor(503, 'AI savjetnik još nije uključen.');

  const auth = getAuth();
  const user = await auth.getUser();
  if (!user) return odgovor(401, 'Potrebna je prijava.');
  if ((await auth.mfaStatus()).potrebnoAal2) return odgovor(403, 'Potreban je MFA kod.');

  const ulaz = PitanjeSchema.safeParse(await req.json().catch(() => null));
  if (!ulaz.success) return odgovor(400, ulaz.error.issues[0]?.message ?? 'Neispravan upit.');
  const { cesticaId, pitanje, povijest } = ulaz.data;

  const db = getDb();
  const kontekst = await db.cestice.kontekst(cesticaId, 12);
  if (!kontekst) return odgovor(404, 'Čestica ne postoji ili nemaš pristup.');

  const rez = await db.ai.rezerviraj(ai.budzetUsd, PO_SATU);
  if (rez === 'sat') return odgovor(429, `Najviše ${PO_SATU} pitanja na sat. Pokušaj malo kasnije.`);
  if (rez === 'mjesec') return odgovor(429, 'Mjesečni budžet AI savjetnika je potrošen. Radi opet od prvog u mjesecu.');

  const { lat, lon } = srediste(kontekst.cestica.geom.coordinates);
  const godinuDana = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const [operacije, prognoza] = await Promise.all([
    db.operacije.listByCestica(cesticaId).then((o) => o.filter((x) => x.datum >= godinuDana).slice(0, 25)),
    dohvatiOpenMeteo(lat, lon, 6000).catch(() => null),
  ]);
  const danas = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb' }).format(new Date());
  const tekstKonteksta = sastaviKontekst({
    danas,
    naziv: kontekst.cestica.naziv,
    kultura: kontekst.cestica.kultura,
    povrsinaHa: kontekst.cestica.povrsinaHa,
    lat,
    lon,
    ndvi: kontekst.ndvi,
    operacije,
    prognoza,
  });

  // trošak se knjiži nakon što odgovor završi (after = waitUntil na Cloudflareu)
  let knjizi: (usd: number) => void = () => undefined;
  const trosak = new Promise<number>((r) => (knjizi = r));
  after(async () => {
    try {
      await db.ai.evidentiraj(await trosak);
    } catch (e) {
      console.error('[ai] evidentiraj', e);
    }
  });

  const enc = new TextEncoder();
  let zavrseno = false;
  let poceo = false;
  const tok = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      try {
        for await (const d of ai.klijent.stream([...povijest, { uloga: 'korisnik', tekst: pitanje }], {
          sustav: `${SUSTAV_SAVJETNIK}\n\n${tekstKonteksta}`,
          maxTokena: 1024,
          signal: req.signal,
        })) {
          if (d.vrsta === 'tekst') {
            poceo = true;
            ctrl.enqueue(enc.encode(d.tekst));
          }
          else {
            zavrseno = true;
            knjizi(d.usd);
          }
        }
        ctrl.close();
      } catch (e) {
        const status = e instanceof AIGreska ? e.status : 0;
        if (status !== 0 || !(e instanceof Error && e.name === 'AbortError')) {
          void posaljiGreskuServer(e, { putanja: '/api/ai/savjet', metoda: 'POST', ruta: '/api/ai/savjet', vrsta: 'ai' });
        }
        ctrl.enqueue(enc.encode(status === 529 || status === 429 ? '\n\n[Savjetnik je trenutno preopterećen — pokušaj za minutu.]' : '\n\n[Odgovor je prekinut — pokušaj ponovo.]'));
        ctrl.close();
      } finally {
        if (!zavrseno) knjizi(poceo ? PROCJENA_PREKIDA_USD : 0);
      }
    },
  });

  return new Response(tok, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
