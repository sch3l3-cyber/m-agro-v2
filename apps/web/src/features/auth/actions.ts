'use server';

import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { NovaLozinkaSchema, PrijavaSchema, RegistracijaSchema, ResetZahtjevSchema } from '@m-agro/domain';
import { getAuth, type AuthErrorCode } from '@/lib/auth';
import { publicEnv } from '@/lib/env';
import { type FormState, safeNext } from './state';

const PORUKE: Record<AuthErrorCode, string> = {
  invalid_credentials: 'Pogrešan email ili lozinka.',
  email_not_confirmed: 'Email još nije potvrđen. Provjeri poštu (i spam) za link.',
  weak_password: 'Lozinka je preslaba.',
  rate_limited: 'Previše pokušaja. Pričekaj nekoliko minuta pa pokušaj ponovo.',
  invalid_link: 'Link je istekao ili je već iskorišten. Zatraži novi.',
  invalid_code: 'Kod nije ispravan ili je istekao. Upiši novi kod iz aplikacije.',
  unknown: 'Nešto je pošlo po zlu. Pokušaj ponovo.',
};

function fieldErrors(err: z.ZodError): FormState {
  const fe: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? 'form');
    fe[k] ??= i.message;
  }
  return { status: 'error', message: 'Provjeri označena polja.', fieldErrors: fe };
}

const potvrdaUrl = (next: string) => `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/potvrda?next=${encodeURIComponent(next)}`;

export async function prijava(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = PrijavaSchema.safeParse({ email: fd.get('email'), lozinka: fd.get('lozinka') });
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = getAuth();
  const res = await auth.signIn(parsed.data.email, parsed.data.lozinka);
  if (!res.ok) return { status: 'error', message: PORUKE[res.code] };
  const next = safeNext(fd.get('next'));
  // uključen MFA → lozinka nije dovoljna, traži kod (sesija je aal1 dok se ne potvrdi)
  if ((await auth.mfaStatus()).potrebnoAal2) redirect(`/prijava/mfa?next=${encodeURIComponent(next)}`);
  redirect(next);
}

const Kod = /^\d{6}$/;

/** Drugi korak prijave: 6-znamenkasti kod iz aplikacije → sesija aal2. */
export async function mfaPrijava(_: FormState, fd: FormData): Promise<FormState> {
  const kod = String(fd.get('kod') ?? '').replace(/\s/g, '');
  if (!Kod.test(kod)) return { status: 'error', message: 'Upiši 6 znamenki iz aplikacije.', fieldErrors: { kod: '6 znamenki' } };
  const auth = getAuth();
  const faktor = (await auth.mfaStatus()).faktori.find((f) => f.potvrden);
  if (!faktor) redirect('/');
  const res = await auth.mfaPotvrdi(faktor.id, kod);
  if (!res.ok) return { status: 'error', message: PORUKE[res.code] };
  redirect(safeNext(fd.get('next')));
}

// ---- uključivanje / isključivanje (stranica Račun) ----
export type MfaUkljuciOdgovor = { ok: true; factorId: string; qr: string; tajna: string } | { ok: false; poruka: string };

export async function mfaZapocni(): Promise<MfaUkljuciOdgovor> {
  const r = await getAuth().mfaUkljuci();
  return r.ok ? r : { ok: false, poruka: 'Uključivanje nije uspjelo. Pokušaj ponovo.' };
}

export async function mfaPotvrdiUkljucivanje(factorId: unknown, kod: unknown): Promise<{ ok: true } | { ok: false; poruka: string }> {
  const k = String(kod ?? '').replace(/\s/g, '');
  if (typeof factorId !== 'string' || !Kod.test(k)) return { ok: false, poruka: 'Upiši 6 znamenki iz aplikacije.' };
  const r = await getAuth().mfaPotvrdi(factorId, k);
  return r.ok ? { ok: true } : { ok: false, poruka: PORUKE[r.code] };
}

export async function mfaIskljuci(factorId: unknown): Promise<{ ok: true } | { ok: false; poruka: string }> {
  if (typeof factorId !== 'string') return { ok: false, poruka: 'Neispravan zahtjev.' };
  const auth = getAuth();
  if ((await auth.mfaStatus()).current !== 'aal2') return { ok: false, poruka: 'Za isključivanje se prijavi s kodom.' };
  const r = await auth.mfaIskljuci(factorId);
  return r.ok ? { ok: true } : { ok: false, poruka: 'Isključivanje nije uspjelo.' };
}

export async function registracija(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = RegistracijaSchema.safeParse({ email: fd.get('email'), lozinka: fd.get('lozinka') });
  if (!parsed.success) return fieldErrors(parsed.error);

  const res = await getAuth().signUp(parsed.data.email, parsed.data.lozinka, potvrdaUrl('/'));
  if (!res.ok && res.code !== 'unknown') {
    return { status: 'error', message: PORUKE[res.code] };
  }
  // Ne otkrivamo postoji li račun (03_SIGURNOST.md) — ista poruka u oba slučaja
  return { status: 'success', message: 'Poslali smo ti email s linkom za potvrdu. Otvori ga (može i na mobitelu) i prijavi se.' };
}

export async function zatraziReset(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = ResetZahtjevSchema.safeParse({ email: fd.get('email') });
  if (!parsed.success) return fieldErrors(parsed.error);

  const res = await getAuth().requestPasswordReset(parsed.data.email, potvrdaUrl('/nova-lozinka'));
  if (!res.ok && res.code === 'rate_limited') return { status: 'error', message: PORUKE.rate_limited };
  return { status: 'success', message: 'Ako je email registriran, poslali smo link za novu lozinku.' };
}

export async function postaviNovuLozinku(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = NovaLozinkaSchema.safeParse({ lozinka: fd.get('lozinka') });
  if (!parsed.success) return fieldErrors(parsed.error);
  if (fd.get('lozinka') !== fd.get('potvrda')) {
    return { status: 'error', message: 'Lozinke se ne podudaraju.', fieldErrors: { potvrda: 'Lozinke se ne podudaraju' } };
  }
  const res = await getAuth().updatePassword(parsed.data.lozinka);
  if (!res.ok) return { status: 'error', message: PORUKE[res.code] };
  redirect('/');
}

export async function odjava(): Promise<void> {
  await getAuth().signOut();
  redirect('/prijava');
}
