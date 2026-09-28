import { publicEnv } from '../env';

/**
 * FeatureFlagsClient (01_ARHITEKTURA_v2.md). MVP: env varijable.
 * Kasnije PostHog/GrowthBook — mijenja se samo ovaj fajl.
 * Lekcija #11: umjesto "privremenog uklanjanja" featurea → flag.
 */
export type Flag = 'ai_advisor' | 'vra_7_zones' | 'realtime_collab';

export interface FeatureFlagsClient {
  isEnabled(flag: Flag): boolean;
}

export const envFlags: FeatureFlagsClient = {
  isEnabled(flag) {
    const env = publicEnv();
    switch (flag) {
      case 'ai_advisor':
        return env.NEXT_PUBLIC_FEATURE_AI === 'true';
      case 'vra_7_zones':
        return env.NEXT_PUBLIC_FEATURE_VRA7 === 'true';
      case 'realtime_collab':
        return false;
    }
  },
};

export const features = envFlags;
