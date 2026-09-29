import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SentryInit } from '@/components/SentryInit';

export const metadata: Metadata = {
  title: { default: 'M-AGRO', template: '%s · M-AGRO' },
  description: 'Besplatna platforma za precizno poljodjelstvo za hrvatske OPG-ove',
  applicationName: 'M-AGRO',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'M-AGRO', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2f6f2f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hr">
      <body className="font-sans antialiased">
        {children}
        <SentryInit />
      </body>
    </html>
  );
}
