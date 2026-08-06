import type { Metadata, Viewport } from 'next';
import { Inter, Barlow_Condensed, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

// Condensé, signalétique : le registre « panneau d'atelier ».
const display = Barlow_Condensed({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '600', '700'],
});

// Références produit et montants : le monospace évite de confondre 0/O et 1/l
// sur un SKU lu à voix haute au comptoir.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'NADAL SERVICES — Matériaux, décoration & prestations',
  description:
    'Staff, plomberie, décoration intérieure, fosse septique biodigesteur et vente de matériaux décoratifs. Bingerville, Abidjan.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f4f2' },
    { media: '(prefers-color-scheme: dark)', color: '#121211' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body
        className="min-h-dvh font-sans antialiased"
        style={{ fontFamily: 'var(--font-sans), system-ui, sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
