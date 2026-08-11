import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { StoreNav } from '@/components/store/StoreNav';
import { AddToCart } from '@/components/store/AddToCart';
import { Footer } from '@/components/store/Footer';
import { getCategories, getProducts, getShop, prixAffiche } from '@/lib/storefront';
import { qty as fmtQty } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Le titre reprend le rayon consulté : « Plomberie — NADAL MULTISERVICES » est une
// bien meilleure entrée de résultat que « Catalogue » répété douze fois.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ rayon?: string }>;
}): Promise<Metadata> {
  const { rayon } = await searchParams;
  const rayons = await getCategories();
  const actif = rayons.find((r) => r.slug === rayon);

  return {
    title: actif ? actif.name : 'Catalogue',
    description: actif
      ? `${actif.name} — disponible en boutique à Bingerville, Abidjan. Commande en ligne et retrait sur place.`
      : 'Tout le catalogue NADAL MULTISERVICES : staff, plomberie, décoration, fosse septique, matériaux décoratifs.',
    alternates: { canonical: actif ? `/catalogue?rayon=${actif.slug}` : '/catalogue' },
  };
}

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ rayon?: string }>;
}) {
  const { rayon } = await searchParams;
  const [shop, rayons] = await Promise.all([getShop(), getCategories()]);
  const actif = rayons.find((r) => r.slug === rayon) ?? null;
  const produits = await getProducts(actif?.id);

  return (
    <>
      <StoreNav shopName={shop.name} phone={shop.phone} />

      <div className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="title-display text-4xl">
          {actif ? actif.name : 'Catalogue'}
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'rgb(var(--muted))' }}>
          {produits.length} article{produits.length > 1 ? 's' : ''} en rayon
        </p>

        {/* ---------- Filtres ---------- */}
        <div className="mt-6 flex flex-wrap gap-1.5">
          <Link
            href="/catalogue"
            className={!actif ? 'btn-solid px-3 py-1.5 text-[12px]' : 'btn-outline px-3 py-1.5 text-[12px]'}
          >
            Tout
          </Link>
          {rayons.map((r) => (
            <Link
              key={r.id}
              href={`/catalogue?rayon=${r.slug}`}
              className={
                actif?.id === r.id
                  ? 'btn-solid px-3 py-1.5 text-[12px]'
                  : 'btn-outline px-3 py-1.5 text-[12px]'
              }
            >
              {r.name}
            </Link>
          ))}
        </div>

        {/* ---------- Grille ---------- */}
        {produits.length === 0 ? (
          <p
            className="surface mt-8 p-10 text-center text-sm"
            style={{ color: 'rgb(var(--muted))' }}
          >
            Aucun article publié dans ce rayon pour le moment.
          </p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {produits.map((p) => {
              const u = prixAffiche(p);
              const rupture = p.stock_qty <= 0;
              return (
                <article key={p.id} className="surface flex flex-col p-4">
                  {p.image_url && (
                    <div
                      className="relative mb-3 aspect-[4/3] w-full overflow-hidden border"
                      style={{ borderColor: 'rgb(var(--line))' }}
                    >
                      <Image
                        src={p.image_url}
                        alt={p.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium">
                      <Link href={`/produit/${p.slug ?? p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </h2>
                    {rupture ? (
                      <span className="badge badge-danger shrink-0">Rupture</span>
                    ) : (
                      <span className="badge badge-ok shrink-0">
                        {fmtQty(p.stock_qty)} {p.base_unit}
                      </span>
                    )}
                  </div>

                  {p.sku && (
                    <div
                      className="mt-0.5 font-mono text-[11px]"
                      style={{ color: 'rgb(var(--muted))' }}
                    >
                      {p.sku}
                    </div>
                  )}

                  {p.description && (
                    <p
                      className="mt-2 line-clamp-3 text-[13px]"
                      style={{ color: 'rgb(var(--muted))' }}
                    >
                      {p.description}
                    </p>
                  )}

                  <div className="mt-auto">
                    {u ? (
                      <AddToCart
                        productId={p.id}
                        productName={p.name}
                        unites={p.product_units}
                        rupture={rupture}
                      />
                    ) : (
                      <p
                        className="mt-3 text-[13px]"
                        style={{ color: 'rgb(var(--muted))' }}
                      >
                        Prix sur demande — appelez la boutique.
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <Footer shop={shop} />
    </>
  );
}
