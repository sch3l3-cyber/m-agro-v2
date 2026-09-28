import type { MetadataRoute } from 'next';

/** PWA manifest (/manifest.webmanifest) — instalacija na mobitel, pokretanje bez adresne trake. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'M-AGRO — precizno poljodjelstvo',
    short_name: 'M-AGRO',
    description: 'Čestice, NDVI i evidencija operacija za OPG — radi i bez signala na polju.',
    lang: 'hr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7f5ef',
    theme_color: '#2f6f2f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
