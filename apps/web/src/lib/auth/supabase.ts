import 'server-only';
import type { AuthError, EmailOtpType } from '@supabase/supabase-js';
import type { AuthClient, AuthErrorCode, AuthResult } from './types';
import { supabaseForRequest } from './supabase-server';

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'recovery', 'email', 'email_change', 'invite', 'magiclink'];

function mapError(err: AuthError): AuthResult {
  const code: AuthErrorCode =
    err.code === 'invalid_credentials'
      ? 'invalid_credentials'
      : err.code === 'email_not_confirmed'
        ? 'email_not_confirmed'
        : err.code === 'weak_password'
          ? 'weak_password'
          : err.status === 429 || err.code === 'over_email_send_rate_limit' || err.code === 'over_request_rate_limit'
            ? 'rate_limited'
            : err.code === 'otp_expired' || err.code === 'flow_state_not_found' || err.code === 'bad_code_verifier'
              ? 'invalid_link'
              : 'unknown';
  if (code === 'unknown') console.error('[auth] neočekivana greška', err.code, err.message);
  return { ok: false, code, message: err.message };
}

export const supabaseAuth: AuthClient = {
  async getUser() {
    const sb = await supabaseForRequest();
    // getUser() (ne getSession()) — provjerava JWT na serveru, ne vjeruje cookieju na slijepo
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) return null;
    return {
      id: data.user.id,
      email: data.user.email ?? '',
      emailVerified: Boolean(data.user.email_confirmed_at),
    };
  },

  async signIn(email, password) {
    const sb = await supabaseForRequest();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return error ? mapError(error) : { ok: true };
  },

  async signUp(email, password, redirectTo) {
    const sb = await supabaseForRequest();
    const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    return error ? mapError(error) : { ok: true };
  },

  async signOut() {
    const sb = await supabaseForRequest();
    // 'local': odjava samo na ovom uređaju (ne izbaci farmera i s mobitela na traktoru)
    const { error } = await sb.auth.signOut({ scope: 'local' });
    if (error) console.error('[auth] signOut', error.message);
  },

  async requestPasswordReset(email, redirectTo) {
    const sb = await supabaseForRequest();
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    return error ? mapError(error) : { ok: true };
  },

  async updatePassword(password) {
    const sb = await supabaseForRequest();
    const { error } = await sb.auth.updateUser({ password });
    return error ? mapError(error) : { ok: true };
  },

  async verifyEmailLink({ tokenHash, type, code }) {
    const sb = await supabaseForRequest();
    // token_hash flow radi i kad se link otvori na DRUGOM uređaju (registracija na laptopu,
    // potvrda na mobitelu) — PKCE `code` flow ne radi. Vidi docs/adr/0004.
    if (tokenHash && type && (OTP_TYPES as readonly string[]).includes(type)) {
      const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
      return error ? mapError(error) : { ok: true };
    }
    if (code) {
      const { error } = await sb.auth.exchangeCodeForSession(code);
      return error ? mapError(error) : { ok: true };
    }
    return { ok: false, code: 'invalid_link', message: 'Link nije potpun' };
  },
};
