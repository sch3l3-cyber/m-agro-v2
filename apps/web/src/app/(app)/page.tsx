import Link from 'next/link';
import { getAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { NovoGospodarstvoForm } from '@/features/gospodarstva/components/NovoGospodarstvoForm';

const ULOGA_LABEL = { vlasnik: 'Vlasnik', clan: 'Član', citanje: 'Samo čitanje' } as const;

export default async function Dashboard() {
  const user = await getAuth().getUser();
  if (!user) return null; // layout je već preusmjerio
  const gospodarstva = await getDb().gospodarstva.listMine(user.id);

  if (gospodarstva.length === 0) {
    return (
      <Stranica>
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <h1 className="mb-1 text-xl font-semibold">Dobro došao!</h1>
        <p className="mb-5 text-zinc-600">Za početak kreiraj svoje gospodarstvo. Čestice ćeš dodati u sljedećem koraku.</p>
        <NovoGospodarstvoForm />
      </section>
      </Stranica>
    );
  }

  return (
    <Stranica>
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Moja gospodarstva</h1>
      <ul className="flex flex-col gap-3">
        {gospodarstva.map((g) => (
          <li key={g.id}>
            <Link
              href={`/gospodarstvo/${g.id}`}
              className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition-colors hover:bg-zinc-50"
            >
              <p className="font-semibold">{g.naziv}</p>
              <p className="text-sm text-zinc-600">
                {g.mibpg ? `MIBPG ${g.mibpg} · ` : ''}
                {ULOGA_LABEL[g.uloga]}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
    </Stranica>
  );
}

function Stranica({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </div>
  );
}
