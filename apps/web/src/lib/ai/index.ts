import 'server-only';
import { anthropicKlijent } from './anthropic';
import type { AIClient } from './types';

export type { AIClient, ChatDio, Poruka } from './types';
export { AIGreska } from './types';

export interface AiKonfiguracija {
  klijent: AIClient;
  budzetUsd: number;
}

/**
 * null = AI savjetnik nije uključen (nema ANTHROPIC_API_KEY secreta u Cloudflareu).
 * Ključ se čita u runtimeu (Cloudflare secret), nikad ne ide u build ni klijentu.
 */
export function getAi(): AiKonfiguracija | null {
  const kljuc = process.env.ANTHROPIC_API_KEY;
  if (!kljuc) return null;
  const model = process.env.AI_MODEL || 'claude-sonnet-5-5';
  const budzet = Number(process.env.AI_MONTHLY_BUDGET_USD || '5');
  return { klijent: anthropicKlijent(kljuc, model), budzetUsd: Number.isFinite(budzet) && budzet > 0 ? budzet : 5 };
}

export const aiUkljucen = (): boolean => !!process.env.ANTHROPIC_API_KEY;
