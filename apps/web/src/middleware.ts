import { NextResponse, type NextRequest } from 'next/server';
import { refreshSession } from '@/lib/auth/session-proxy';

// Rute dostupne bez prijave
const JAVNE = ['/prijava', '/registracija', '/zaboravljena-lozinka', '/auth/', '/api/health'];

export async function middleware(request: NextRequest) {
  const { response, userId } = await refreshSession(request);
  const path = request.nextUrl.pathname;
  const javna = JAVNE.some((p) => path === p || path.startsWith(p));

  if (!userId && !javna) {
    const url = request.nextUrl.clone();
    url.pathname = '/prijava';
    url.search = path === '/' ? '' : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  if (userId && (path === '/prijava' || path === '/registracija')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
