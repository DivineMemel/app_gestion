import type { Metadata, Viewport } from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';
import './globals.css';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Salon — Atelier de coiffure',
  description: 'Coiffure, soin et beauté. Réservez votre rendez-vous en ligne.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcf8f0' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0a06' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${sans.variable} ${display.variable}`}>
      <body
        className="min-h-dvh font-sans"
        style={{ fontFamily: 'var(--font-sans), system-ui, sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
