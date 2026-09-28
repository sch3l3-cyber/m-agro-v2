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
  // MFA (TOTP) — Faza 1
}
