'use client';
import { useCallback, useEffect, useState } from 'react';

// Panier de la vitrine — conservé dans le navigateur.
//
// Aucun compte client en ligne : on ne demande le nom et le téléphone qu'au
// moment de valider. Le panier survit donc à un rafraîchissement, mais ne
// quitte jamais l'appareil avant la commande.

const CLE = 'qc_panier';
const EVT = 'qc_panier_change';

export type CartItem = {
  product_id: string;
  product_name: string;
  unit_label: string;
  unit_factor: number;
  unit_price_xof: number;
  qty: number;
};

function lire(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const brut = localStorage.getItem(CLE);
    const parsed = brut ? JSON.parse(brut) : [];
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

function ecrire(items: CartItem[]) {
  localStorage.setItem(CLE, JSON.stringify(items));
  // Prévient les autres composants montés (en-tête, page panier) dans cet
  // onglet — `storage` ne se déclenche que dans les AUTRES onglets.
  window.dispatchEvent(new Event(EVT));
}

const cle = (i: Pick<CartItem, 'product_id' | 'unit_label'>) =>
  `${i.product_id}:${i.unit_label}`;

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    setItems(lire());
    setPret(true);
    const sync = () => setItems(lire());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const ajouter = useCallback((item: CartItem) => {
    const cur = lire();
    const i = cur.findIndex((x) => cle(x) === cle(item));
    if (i >= 0) cur[i] = { ...cur[i], qty: cur[i].qty + item.qty };
    else cur.push(item);
    ecrire(cur);
  }, []);

  const definirQte = useCallback((k: string, qty: number) => {
    const cur = lire()
      .map((x) => (cle(x) === k ? { ...x, qty } : x))
      .filter((x) => x.qty > 0);
    ecrire(cur);
  }, []);

  const retirer = useCallback((k: string) => {
    ecrire(lire().filter((x) => cle(x) !== k));
  }, []);

  const vider = useCallback(() => ecrire([]), []);

  const total = items.reduce((s, i) => s + i.qty * i.unit_price_xof, 0);
  const nb = items.reduce((s, i) => s + i.qty, 0);

  return { items, pret, ajouter, definirQte, retirer, vider, total, nb, cle };
}
