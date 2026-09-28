/**
 * AuthClient — tanka fasada (07_FREE_TIER_STRATEGY.md: "5 metoda, ne 3 sloja").
 * Implementacija: supabase.ts. Zamjena (Clerk/Keycloak) = novi fajl, isti interface.
 */
export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

export type AuthResult = { ok: true } | { ok: false; code: AuthErrorCode; message: string };

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'rate_limited'
  | 'invalid_link'
  | 'invalid_code'
  | 'unknown';

export interface AuthClient {
  getUser(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string, redirectTo: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<AuthResult>;
  updatePassword(password: string): Promise<AuthResult>;
  /** Potvrda linka iz emaila (verifikacija / reset lozinke). */
  verifyEmailLink(params: { tokenHash?: string | null; type?: string | null; code?: string | null }): Promise<AuthResult>;
  // ---- MFA (TOTP) ----
  /** current = razina ove sesije; potrebnoAal2 = korisnik ima potvrđen faktor, a sesija je još aal1 */
  mfaStatus(): Promise<MfaStatus>;
  /** Novi (nepotvrđeni) TOTP faktor: QR (SVG data URI) + tajna za ručni unos. */
  mfaUkljuci(): Promise<{ ok: true; factorId: string; qr: string; tajna: string } | { ok: false; message: string }>;
  /** Kod iz aplikacije → potvrđuje faktor (pri uključivanju) ili podiže sesiju na aal2 (pri prijavi). */
  mfaPotvrdi(factorId: string, kod: string): Promise<AuthResult>;
  mfaIskljuci(factorId: string): Promise<AuthResult>;
}

export interface MfaStatus {
  current: 'aal1' | 'aal2';
  potrebnoAal2: boolean;
  faktori: { id: string; naziv: string; potvrden: boolean }[];
}
