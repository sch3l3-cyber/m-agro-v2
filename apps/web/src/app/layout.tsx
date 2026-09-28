import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'M-AGRO', template: '%s · M-AGRO' },
  description: 'Besplatna platforma za precizno poljodjelstvo za hrvatske OPG-ove',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2f7a2c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hr">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
