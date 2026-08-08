import type { Metadata, Viewport } from 'next';
import { Inter, Barlow_Condensed, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { SITE_URL } from '@/lib/site';

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

const TITRE = 'NADAL SERVICES — Matériaux, décoration & prestations à Abidjan';
const DESCRIPTION =
  'Staff et faux plafond, plomberie, décoration intérieure, fosse septique biodigesteur et vente de matériaux décoratifs. Bingerville, Abidjan. Commande en ligne et retrait en boutique.';

export const metadata: Metadata = {
  // Sans metadataBase, Next émet des URL relatives dans les balises Open Graph —
  // que ni Google ni WhatsApp ne savent résoudre.
  metadataBase: new URL(SITE_URL),
  title: { default: TITRE, template: '%s — NADAL SERVICES' },
  description: DESCRIPTION,
  manifest: '/manifest.json',
  applicationName: 'NADAL SERVICES',
  keywords: [
    'quincaillerie Abidjan',
    'fosse septique biodigesteur',
    'staff faux plafond',
    'décoration intérieure Abidjan',
    'matériaux décoratifs',
    'plomberie Bingerville',
  ],
  alternates: { canonical: '/' },
  // WhatsApp est le premier canal de partage ici : sans ces balises, un lien
  // envoyé à une cliente s'affiche en texte nu, sans titre ni image.
  openGraph: {
    type: 'website',
    locale: 'fr_CI',
    url: SITE_URL,
    siteName: 'NADAL SERVICES',
    title: TITRE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITRE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
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
