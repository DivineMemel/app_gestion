import { SITE_URL } from '@/lib/site';
import type { ShopSettings } from '@/lib/types';

/**
 * Données structurées schema.org — le format que Google lit pour comprendre
 * qu'il a affaire à un commerce et non à un blog.
 *
 * C'est ce qui permet d'apparaître avec l'adresse, le téléphone et les
 * horaires dans les résultats, et d'alimenter la fiche du côté Maps. Pour un
 * commerce de quartier, c'est le balisage qui compte le plus — bien avant les
 * mots-clés.
 *
 * `HardwareStore` est le type schema.org exact pour une quincaillerie ; il
 * hérite de LocalBusiness, donc l'adresse et les horaires sont compris.
 */
export function DonneesStructurees({ shop }: { shop: ShopSettings }) {
  const donnees = {
    '@context': 'https://schema.org',
    '@type': 'HardwareStore',
    '@id': `${SITE_URL}/#boutique`,
    name: shop.name,
    description: shop.tagline ?? undefined,
    url: SITE_URL,
    telephone: shop.phone ?? undefined,
    email: shop.email ?? undefined,
    image: `${SITE_URL}/opengraph-image`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: shop.address ?? undefined,
      addressLocality: 'Bingerville',
      addressRegion: 'Abidjan',
      addressCountry: 'CI',
    },
    priceRange: 'XOF',
    currenciesAccepted: 'XOF',
    paymentAccepted: 'Espèces, Mobile Money, Virement, Chèque',
    areaServed: { '@type': 'City', name: 'Abidjan' },
    // Les prestations, qui ne sont pas des produits en rayon mais bien ce que
    // les gens cherchent : « fosse septique », « faux plafond ».
    makesOffer: [
      'Installation de fosse septique biodigesteur',
      'Pose de staff et faux plafond',
      'Décoration intérieure',
      'Plomberie',
      'Vente de matériaux décoratifs',
    ].map((nom) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: nom },
    })),
  };

  return (
    <script
      type="application/ld+json"
      // Contenu contrôlé par nous, pas par l'utilisateur : sérialisation directe.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(donnees) }}
    />
  );
}
