import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import './globals.css';

// نفس خط تطبيق الجوبي وموقعه
const plex = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '600', '700'], variable: '--font-plex' });

export const metadata: Metadata = {
  title: { default: 'خدمات الجوبي الميدانية', template: '%s · خدمات الجوبي' },
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { themeColor: '#316A21', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={plex.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
