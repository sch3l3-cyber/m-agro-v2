import { getAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GDPR izvoz (03_SIGURNOST: "korisnik može zatražiti export svih svojih podataka").
 * Samo ono što RLS dopušta ovom korisniku: gospodarstva gdje je član, njihove čestice (GeoJSON) i operacije.
 */
export async function GET() {
  const auth = getAuth();
  const user = await auth.getUser();
  if (!user) return new Response('Potrebna je prijava', { status: 401 });
  if ((await auth.mfaStatus()).potrebnoAal2) return new Response('Potreban je MFA kod', { status: 403 });

  const db = getDb();
  const gospodarstva = await db.gospodarstva.listMine(user.id);
  const podaci = await Promise.all(
    gospodarstva.map(async (g) => {
      const [cestice, operacije] = await Promise.all([db.cestice.listByGospodarstvo(g.id), db.operacije.listByGospodarstvo(g.id, '1900-01-01', '2999-12-31')]);
      return {
        ...g,
        cestice: {
          type: 'FeatureCollection',
          features: cestice.map(({ geom, ...svojstva }) => ({ type: 'Feature', properties: svojstva, geometry: geom })),
        },
        operacije,
      };
    }),
  );

  const izvoz = {
    izvezeno: new Date().toISOString(),
    napomena: 'Izvoz osobnih podataka iz M-AGRO (GDPR čl. 15 i 20). Čestice su GeoJSON (WGS84).',
    korisnik: { id: user.id, email: user.email },
    gospodarstva: podaci,
  };
  const datum = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(izvoz, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="m-agro-moji-podaci-${datum}.json"`,
      'cache-control': 'no-store',
    },
  });
}
