'use client';

import { useEffect } from 'react';
import { pokreniSentryKlijent } from '@/lib/monitoring/client';

export function SentryInit() {
  useEffect(() => {
    // nakon što se stranica prikaže — Sentry ne smije usporiti prvo otvaranje na polju
    const t = setTimeout(() => void pokreniSentryKlijent(), 1500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
