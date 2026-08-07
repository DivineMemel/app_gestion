import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, MapPin, Phone, Store, Truck } from 'lucide-react';
import { StoreNav } from '@/components/store/StoreNav';
import { AddToCart } from '@/components/store/AddToCart';
import { Footer } from '@/components/store/Footer';
import { getCategories, getProducts, getShop, prixAffiche } from '@/lib/storefront';
import { xof } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AccueilPage() {
  const [shop, rayons, produits] = await Promise.all([
    getShop(),
    getCategories(),
    getProducts(),
  ]);

  const vedettes = produits.filter((p) => p.stock_qty > 0).slice(0, 6);

  return (
    <>
      <StoreNav shopName={shop.name} phone={shop.phone} />

      {/* ---------- Bandeau ---------- */}
      <section className="relative overflow-hidden">
        <div className="hazard h-1.5" aria-hidden />
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <span className="eyebrow">{shop.tagline}</span>
          <h1 className="title-display mt-3 text-5xl md:text-7xl">
            Bâtir, aménager,
            <br />
            <span style={{ color: 'rgb(var(--accent))' }}>assainir.</span>
          </h1>
          <p
            className="mt-5 max-w-xl text-lg"
            style={{ color: 'rgb(var(--ink-soft))' }}
          >
            Staff et faux plafond, plomberie, décoration intérieure, fosse
            septique biodigesteur et matériaux décoratifs. Commandez en ligne,
            retirez en boutique — on prépare pendant que vous arrivez.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/catalogue" className="btn-primary">
              Voir le catalogue
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
            {shop.phone && (
              <a href={`tel:${shop.phone}`} className="btn-outline">
                <Phone className="h-4 w-4" strokeWidth={1.75} />
                {shop.phone}
              </a>
            )}
          </div>

          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-[13px]">
            <Atout icon={<Store className="h-4 w-4" strokeWidth={1.75} />} texte="Retrait en boutique" />
            <Atout icon={<Truck className="h-4 w-4" strokeWidth={1.75} />} texte="Livraison chantier sur devis" />
            {shop.address && (
              <Atout icon={<MapPin className="h-4 w-4" strokeWidth={1.75} />} texte={shop.address} />
            )}
          </div>
        </div>
      </section>

      {/* ---------- Rayons ---------- */}
      {rayons.length > 0 && (
        <section
          className="border-y py-14"
          style={{
            borderColor: 'rgb(var(--line))',
            background: 'rgb(var(--surface-2))',
          }}
        >
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="title-display text-3xl">Nos rayons</h2>
            <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rayons.map((r) => (
                <Link
                  key={r.id}
                  href={`/catalogue?rayon=${r.slug}`}
                  className="surface group flex items-center justify-between p-4 transition-colors hover:border-[rgb(var(--accent))]"
                >
                  <span className="font-medium">{r.name}</span>
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                    strokeWidth={1.75}
                    style={{ color: 'rgb(var(--accent))' }}
                  />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Sélection ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="title-display text-3xl">En rayon aujourd’hui</h2>
          <Link
            href="/catalogue"
            className="inline-flex items-center gap-1 text-[13px] font-semibold"
            style={{ color: 'rgb(var(--accent))' }}
          >
            Tout voir <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>

        {vedettes.length === 0 ? (
          <p className="surface p-8 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
            Le catalogue est en cours de préparation. Appelez-nous en attendant.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vedettes.map((p) => {
              const u = prixAffiche(p);
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
                  <h3 className="font-medium">{p.name}</h3>
                  {p.description && (
                    <p
                      className="mt-1 line-clamp-2 text-[13px]"
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
                        rupture={p.stock_qty <= 0}
                      />
                    ) : (
                      <p className="mt-3 text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
                        Prix sur demande
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Footer shop={shop} />
    </>
  );
}

function Atout({ icon, texte }: { icon: React.ReactNode; texte: string }) {
  return (
    <span className="inline-flex items-center gap-2" style={{ color: 'rgb(var(--muted))' }}>
      <span style={{ color: 'rgb(var(--accent))' }}>{icon}</span>
      {texte}
    </span>
  );
}
