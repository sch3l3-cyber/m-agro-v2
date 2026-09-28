import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const TILES = 'https://server.arcgisonline.com https://*.basemaps.cartocdn.com';

// 03_SIGURNOST.md — CSP. 'unsafe-inline' za skripte je potreban dok ne uvedemo nonce (Faza 1).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  // Karta: Esri satelit + Carto nazivi (MapLibre dohvaća pločice fetchom → i connect-src)
  `img-src 'self' blob: data: ${supabaseUrl} https://*.workers.dev ${TILES}`,
  `connect-src 'self' ${supabaseUrl} ${supabaseUrl.replace('https://', 'wss://')} https://*.workers.dev https://api.open-meteo.com ${TILES}`,
  "worker-src 'self' blob:",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@m-agro/domain'],
  // Uvoz čestica šalje geometrije kroz server action (5000 čestica ≈ nekoliko MB)
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
