import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowLeft, Phone, Store } from 'lucide-react';
import { StoreNav } from '@/components/store/StoreNav';
import { AddToCart } from '@/components/store/AddToCart';
import { Footer } from '@/components/store/Footer';
import {
  getCategories,
  getProductBySlug,
  getShop,
  prixAffiche,
} from '@/lib/storefront';
import { SITE_URL } from '@/lib/site';
import { qty as fmtQty, xof } from '@/lib/format';

// Une page par article, régénérée toutes les 10 minutes. C'est ce qui permet
// de capter « fosse biodigesteur prix Abidjan » : une page entière parle de ce
// produit, au lieu d'une ligne noyée dans le catalogue.
export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) return { title: 'Article introuvable' };

  const u = prixAffiche(p);
  const prix = u ? ` — ${xof(u.price_xof)}` : '';

  return {
    title: p.name,
    description:
      p.description ??
      `${p.name}${prix}. Disponible chez NADAL MULTISERVICES à Bingerville, Abidjan. Commande en ligne, retrait en boutique.`,
    alternates: { canonical: `/produit/${p.slug ?? slug}` },
    openGraph: {
      type: 'website',
      title: p.name,
      description: p.description ?? undefined,
      images: p.image_url ? [{ url: p.image_url }] : undefined,
    },
  };
}

export default async function ProduitPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [produit, shop, rayons] = await Promise.all([
    getProductBySlug(slug),
    getShop(),
    getCategories(),
  ]);

  if (!produit) notFound();

  const unite = prixAffiche(produit);
  const rupture = produit.stock_qty <= 0;
  const rayon = rayons.find((r) => r.id === produit.category_id) ?? null;

  // Balisage Product : c'est lui qui fait apparaître le prix et la
  // disponibilité directement dans les résultats de recherche.
  const donnees = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: produit.name,
    description: produit.description ?? undefined,
    sku: produit.sku ?? undefined,
    image: produit.image_url ? [produit.image_url] : undefined,
    category: rayon?.name,
    brand: { '@type': 'Brand', name: shop.name },
    offers: unite
      ? {
          '@type': 'Offer',
          url: `${SITE_URL}/produit/${produit.slug ?? slug}`,
          priceCurrency: 'XOF',
          price: unite.price_xof,
          availability: rupture
            ? 'https://schema.org/OutOfStock'
            : 'https://schema.org/InStock',
          seller: { '@type': 'Organization', name: shop.name },
        }
      : undefined,
  };

  const fil = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: rayon?.name ?? 'Catalogue',
        item: `${SITE_URL}/catalogue${rayon ? `?rayon=${rayon.slug}` : ''}`,
      },
      { '@type': 'ListItem', position: 3, name: produit.name },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(donnees) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(fil) }}
      />

      <StoreNav shopName={shop.name} phone={shop.phone} />

      <div className="mx-auto max-w-5xl px-5 py-8">
        {/* Fil d'Ariane : oriente la visiteuse et le robot. */}
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-[13px]">
          <Link href="/catalogue" className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'rgb(var(--accent))' }}>
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Catalogue
          </Link>
          {rayon && (
            <>
              <span style={{ color: 'rgb(var(--muted-2))' }}>/</span>
              <Link href={`/catalogue?rayon=${rayon.slug}`} style={{ color: 'rgb(var(--muted))' }}>
                {rayon.name}
              </Link>
            </>
          )}
        </nav>

        <div className="grid gap-8 md:grid-cols-2">
          <div
            className="relative aspect-square w-full overflow-hidden border"
            style={{
              borderColor: 'rgb(var(--line))',
              background: 'rgb(var(--surface-2))',
            }}
          >
            {produit.image_url ? (
              <Image
                src={produit.image_url}
                alt={produit.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            ) : (
              <div
                className="grid h-full w-full place-items-center text-sm"
                style={{ color: 'rgb(var(--muted))' }}
              >
                Photo à venir
              </div>
            )}
          </div>

          <div className="flex flex-col">
            {rayon && <span className="eyebrow">{rayon.name}</span>}
            <h1 className="title-display mt-2 text-4xl md:text-5xl">{produit.name}</h1>

            {produit.sku && (
              <div
                className="mt-2 font-mono text-[12px]"
                style={{ color: 'rgb(var(--muted))' }}
              >
                Réf. {produit.sku}
              </div>
            )}

            <div className="mt-4">
              {rupture ? (
                <span className="badge badge-danger">Rupture de stock</span>
              ) : (
                <span className="badge badge-ok">
                  {fmtQty(produit.stock_qty)} {produit.base_unit} en stock
                </span>
              )}
            </div>

            {produit.description && (
              <p
                className="mt-5 text-[15px] leading-relaxed"
                style={{ color: 'rgb(var(--ink-soft))' }}
              >
                {produit.description}
              </p>
            )}

            <div className="mt-6">
              {unite ? (
                <AddToCart
                  productId={produit.id}
                  productName={produit.name}
                  unites={produit.product_units}
                  rupture={rupture}
                />
              ) : (
                <p className="text-[15px]" style={{ color: 'rgb(var(--muted))' }}>
                  Prix sur demande — appelez la boutique.
                </p>
              )}
            </div>

            <div
              className="mt-8 space-y-2 border-t pt-6 text-[13px]"
              style={{ borderColor: 'rgb(var(--line))', color: 'rgb(var(--muted))' }}
            >
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4" strokeWidth={1.75} />
                Retrait en boutique — {shop.address}
              </div>
              {shop.phone && (
                <a href={`tel:${shop.phone}`} className="flex items-center gap-2">
                  <Phone className="h-4 w-4" strokeWidth={1.75} />
                  {shop.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <Footer shop={shop} />
    </>
  );
}
