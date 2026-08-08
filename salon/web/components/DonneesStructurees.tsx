import { SITE_URL } from '@/lib/site';
import type { SalonSettings, Service } from '@/lib/types';

/**
 * Données structurées schema.org.
 *
 * `HairSalon` est le type exact d'un salon de coiffure ; il hérite de
 * LocalBusiness, donc l'adresse, le téléphone et les horaires sont compris par
 * Google. C'est ce balisage qui alimente la fiche affichée dans les résultats
 * et dans Maps — pour un salon de quartier, il pèse bien plus que les
 * mots-clés.
 */

const JOURS: Record<string, string> = {
  lundi: 'Monday',
  mardi: 'Tuesday',
  mercredi: 'Wednesday',
  jeudi: 'Thursday',
  vendredi: 'Friday',
  samedi: 'Saturday',
  dimanche: 'Sunday',
};

/** Traduit `opening_hours` en `OpeningHoursSpecification` schema.org. */
function horaires(brut: unknown) {
  if (!brut || typeof brut !== 'object') return undefined;
  const table = brut as Record<string, { open?: string; close?: string } | null>;

  const specs = Object.entries(table)
    .filter(([jour, h]) => JOURS[jour] && h?.open && h?.close)
    .map(([jour, h]) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${JOURS[jour]}`,
      opens: h!.open,
      closes: h!.close,
    }));

  return specs.length > 0 ? specs : undefined;
}

export function DonneesStructurees({
  settings,
  services,
}: {
  settings: SalonSettings | null;
  services: Service[];
}) {
  const nom = settings?.name ?? 'MUSE l’atelier';

  const donnees = {
    '@context': 'https://schema.org',
    '@type': 'HairSalon',
    '@id': `${SITE_URL}/#salon`,
    name: nom,
    description: settings?.tagline ?? undefined,
    url: SITE_URL,
    telephone: settings?.phone ?? undefined,
    email: settings?.email ?? undefined,
    image: `${SITE_URL}/opengraph-image`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: settings?.address ?? undefined,
      addressLocality: 'Abidjan',
      addressCountry: 'CI',
    },
    priceRange: 'XOF',
    currenciesAccepted: 'XOF',
    openingHoursSpecification: horaires(
      (settings as unknown as { opening_hours?: unknown })?.opening_hours,
    ),
    sameAs: settings?.instagram ? [settings.instagram] : undefined,
    // Le catalogue de prestations : ce que les clientes tapent réellement
    // — « tresses Abidjan », « pose ongles ».
    hasOfferCatalog: services.length
      ? {
          '@type': 'OfferCatalog',
          name: 'Prestations',
          itemListElement: services.slice(0, 30).map((s) => ({
            '@type': 'Offer',
            itemOffered: { '@type': 'Service', name: s.name },
            priceCurrency: 'XOF',
            price: s.price_xof || undefined,
          })),
        }
      : undefined,
    potentialAction: {
      '@type': 'ReserveAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/reserver`,
        actionPlatform: [
          'https://schema.org/DesktopWebPlatform',
          'https://schema.org/MobileWebPlatform',
        ],
      },
      result: { '@type': 'Reservation', name: 'Rendez-vous' },
    },
  };

  return (
    <script
      type="application/ld+json"
      // Contenu contrôlé par nous, pas par l'utilisateur.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(donnees) }}
    />
  );
}
