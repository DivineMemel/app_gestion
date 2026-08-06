'use client';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { Wordmark } from '@/components/Wordmark';
import { useCart } from '@/lib/cart';

export function StoreNav({ shopName, phone }: { shopName: string; phone?: string | null }) {
  const { nb, pret } = useCart();

  return (
    <header
      className="glass sticky top-0 z-40 border-b"
      style={{ borderColor: 'rgb(var(--line))' }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Wordmark size="sm" href="/" name={shopName} />

        <nav className="flex items-center gap-1 text-[13px]">
          <Link href="/catalogue" className="btn-ghost">
            Catalogue
          </Link>
          {phone && (
            <a href={`tel:${phone}`} className="btn-ghost hidden sm:inline-flex">
              {phone}
            </a>
          )}
          <Link href="/commander" className="btn-outline relative">
            <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
            Panier
            {/* `pret` évite un écart entre le rendu serveur (0) et le
                localStorage lu au montage. */}
            {pret && nb > 0 && (
              <span
                className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center px-1 text-[11px] font-bold"
                style={{
                  background: 'rgb(var(--accent))',
                  color: 'rgb(var(--accent-ink))',
                }}
              >
                {nb}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
