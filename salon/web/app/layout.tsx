import type { Metadata, Viewport } from 'next';
import { Inter, Bodoni_Moda } from 'next/font/google';
import './globals.css';
import { SITE_URL } from '@/lib/site';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Bodoni_Moda({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const TITRE = "MUSE l'atelier — Coiffure, onglerie & soins à Abidjan";
const DESCRIPTION =
  "Salon de coiffure, onglerie et soins à Abidjan. Tresses, couleur, lissage, pose d'ongles et soins du visage. Réservation en ligne.";

export const metadata: Metadata = {
  // Sans metadataBase, Next émet des URL relatives dans les balises Open Graph —
  // que ni Google ni WhatsApp ne savent résoudre.
  metadataBase: new URL(SITE_URL),
  title: { default: TITRE, template: "%s — MUSE l'atelier" },
  description: DESCRIPTION,
  applicationName: "MUSE l'atelier",
  keywords: [
    'salon de coiffure Abidjan',
    'tresses Abidjan',
    'onglerie Abidjan',
    'lissage brésilien',
    'pose ongles gel',
    'soins visage Abidjan',
  ],
  alternates: { canonical: '/' },
  // WhatsApp et Instagram sont les premiers canaux de partage : sans ces
  // balises, un lien envoyé à une cliente s'affiche en texte nu.
  openGraph: {
    type: 'website',
    locale: 'fr_CI',
    url: SITE_URL,
    siteName: "MUSE l'atelier",
    title: TITRE,
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: TITRE, description: DESCRIPTION },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f5ef' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0807' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${sans.variable} ${display.variable}`}>
      <body
        className="min-h-dvh font-sans antialiased"
        style={{ fontFamily: 'var(--font-sans), system-ui, sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
