import 'server-only';
import type { AuthClient } from './types';
import { supabaseAuth } from './supabase';

export type { AuthClient, AuthUser, AuthResult, AuthErrorCode } from './types';

/** Jedina točka ulaza za auth u feature kodu. */
export function getAuth(): AuthClient {
  return supabaseAuth;
}
