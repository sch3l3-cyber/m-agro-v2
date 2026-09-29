'use client';

import dynamic from 'next/dynamic';

// ssr:false → @sentry/browser (~400 KB) ne ulazi u serverski bundle workera (3 MiB limit)
export const SentryLoader = dynamic(() => import('./SentryInit').then((m) => m.SentryInit), { ssr: false });
export const ProbaSentryLoader = dynamic(() => import('@/features/admin/ProbaSentry').then((m) => m.ProbaSentry), { ssr: false });
