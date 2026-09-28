import { NextResponse, type NextRequest } from 'next/server';
import { getAuth } from '@/lib/auth';
import { safeNext } from '@/features/auth/state';

// Cilj linkova iz emaila: potvrda registracije i reset lozinke (ADR-0004)
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const res = await getAuth().verifyEmailLink({
    tokenHash: sp.get('token_hash'),
    type: sp.get('type'),
    code: sp.get('code'),
  });

  const url = request.nextUrl.clone();
  url.search = '';
  if (!res.ok) {
    url.pathname = '/prijava';
    url.searchParams.set('greska', 'link');
    return NextResponse.redirect(url);
  }
  url.pathname = sp.get('type') === 'recovery' ? '/nova-lozinka' : safeNext(sp.get('next'));
  return NextResponse.redirect(url);
}
