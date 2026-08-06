'use client';
import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { xof } from '@/lib/format';
import type { ProductUnit } from '@/lib/types';

/**
 * Sélecteur d'unité + ajout au panier.
 *
 * Le choix « au détail ou en gros » est le geste central d'une quincaillerie :
 * il est donc présenté sur la fiche produit, pas caché derrière un menu.
 */
export function AddToCart({
  productId,
  productName,
  unites,
  rupture,
}: {
  productId: string;
  productName: string;
  unites: ProductUnit[];
  rupture: boolean;
}) {
  const { ajouter } = useCart();
  const tri = [...unites].sort(
    (a, b) =>
      Number(b.is_default) - Number(a.is_default) ||
      a.position - b.position ||
      Number(a.factor) - Number(b.factor),
  );
  const [choisie, setChoisie] = useState(tri[0]?.id ?? '');
  const [ajoute, setAjoute] = useState(false);

  if (tri.length === 0) return null;
  const unite = tri.find((u) => u.id === choisie) ?? tri[0];

  function onAjouter() {
    ajouter({
      product_id: productId,
      product_name: productName,
      unit_label: unite.label,
      unit_factor: Number(unite.factor),
      unit_price_xof: Number(unite.price_xof),
      qty: 1,
    });
    setAjoute(true);
    setTimeout(() => setAjoute(false), 1400);
  }

  return (
    <div className="mt-3">
      {tri.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tri.map((u) => (
            <button
              key={u.id}
              onClick={() => setChoisie(u.id)}
              className={u.id === unite.id ? 'btn-solid px-2.5 py-1 text-[12px]' : 'btn-outline px-2.5 py-1 text-[12px]'}
            >
              {u.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="tnum text-lg font-semibold">{xof(unite.price_xof)}</span>
        <button
          onClick={onAjouter}
          className={ajoute ? 'btn-solid' : 'btn-primary'}
          disabled={rupture}
        >
          {rupture ? (
            'Rupture'
          ) : ajoute ? (
            <>
              <Check className="h-4 w-4" strokeWidth={2} />
              Ajouté
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Ajouter
            </>
          )}
        </button>
      </div>
    </div>
  );
}
