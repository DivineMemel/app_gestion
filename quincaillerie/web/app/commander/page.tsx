'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, Trash2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { MODE_DEMO } from '@/lib/admin-db';
import { creerCommandeDemo } from '@/lib/demo-store';
import { xof } from '@/lib/format';

export default function CommanderPage() {
  const { items, pret, definirQte, retirer, vider, total, cle } = useCart();

  const [form, setForm] = useState({ name: '', phone: '', email: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirme, setConfirme] = useState<{ number: string; total_xof: number } | null>(
    null,
  );
  const [shopName, setShopName] = useState('NADAL MULTISERVICES');

  useEffect(() => {
    // Le nom de la boutique est purement décoratif ici : on évite un aller-
    // retour serveur bloquant et on garde la page instantanée.
    document.title = 'Commander — NADAL MULTISERVICES';
    setShopName('NADAL MULTISERVICES');
  }, []);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) return;
    setBusy(true);
    setErreur(null);

    // En démo, la commande est écrite dans le magasin local : elle apparaît
    // aussitôt dans /admin/commandes, exactement comme en base.
    if (MODE_DEMO) {
      const res = creerCommandeDemo({
        customer: { name: form.name, phone: form.phone, email: form.email || null },
        note: form.note,
        items: items.map((i) => ({
          product_id: i.product_id,
          unit_label: i.unit_label,
          qty: i.qty,
        })),
      });
      if (res.ok && res.order) {
        setConfirme(res.order);
        vider();
      } else {
        setErreur(res.reason ?? 'Commande impossible.');
      }
      setBusy(false);
      return;
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customer: {
            name: form.name,
            phone: form.phone,
            email: form.email || null,
          },
          note: form.note,
          items: items.map((i) => ({
            product_id: i.product_id,
            unit_label: i.unit_label,
            qty: i.qty,
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setConfirme(json.order);
        vider();
      } else {
        setErreur(json?.reason ?? 'Commande impossible pour le moment.');
      }
    } catch {
      setErreur('Connexion perdue. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  if (confirme) {
    return (
      <main className="mx-auto max-w-md px-5 py-20 text-center">
        <CheckCircle2
          className="mx-auto h-14 w-14"
          strokeWidth={1.25}
          style={{ color: 'rgb(var(--ok))' }}
        />
        <h1 className="title-display mt-5 text-3xl">Commande enregistrée</h1>
        <p className="mt-2 text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Votre numéro de retrait :
        </p>
        <p className="mt-1 font-mono text-2xl font-bold">{confirme.number}</p>
        <p className="mt-4 text-sm" style={{ color: 'rgb(var(--ink-soft))' }}>
          Montant à régler au comptoir : <strong>{xof(confirme.total_xof)}</strong>.
          La boutique prépare votre commande et vous rappelle dès qu’elle est
          prête.
        </p>
        <Link href="/catalogue" className="btn-outline mt-8">
          Continuer mes achats
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href="/catalogue"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
        style={{ color: 'rgb(var(--accent))' }}
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        Retour au catalogue
      </Link>

      <h1 className="title-display mt-4 text-4xl">Votre panier</h1>

      {!pret ? (
        <p className="mt-8 text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Chargement…
        </p>
      ) : items.length === 0 ? (
        <div className="surface mt-6 p-10 text-center">
          <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
            Votre panier est vide.
          </p>
          <Link href="/catalogue" className="btn-primary mt-5">
            Parcourir le catalogue
          </Link>
        </div>
      ) : (
        <>
          <ul className="surface mt-6">
            {items.map((i) => {
              const k = cle(i);
              return (
                <li
                  key={k}
                  className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-b-0"
                  style={{ borderColor: 'rgb(var(--line))' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{i.product_name}</div>
                    <div className="text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
                      {i.unit_label} · {xof(i.unit_price_xof)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      className="btn-outline px-2 py-1"
                      onClick={() => definirQte(k, i.qty - 1)}
                      aria-label="Diminuer"
                    >
                      <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                    <span className="tnum w-10 text-center font-semibold">{i.qty}</span>
                    <button
                      className="btn-outline px-2 py-1"
                      onClick={() => definirQte(k, i.qty + 1)}
                      aria-label="Augmenter"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>

                  <div className="tnum w-28 text-right font-semibold">
                    {xof(i.qty * i.unit_price_xof)}
                  </div>

                  <button
                    onClick={() => retirer(k)}
                    className="btn-ghost"
                    aria-label="Retirer"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex items-center justify-between text-xl font-bold">
            <span>Total</span>
            <span className="tnum">{xof(total)}</span>
          </div>
          <p className="mt-1 text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
            Paiement au comptoir, au moment du retrait. Les prix sont revérifiés
            par la boutique à l’enregistrement.
          </p>

          <form onSubmit={envoyer} className="surface mt-8 p-5">
            <h2 className="eyebrow mb-4">Vos coordonnées</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Nom</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">Téléphone</label>
                <input
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+225 …"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">E-mail (facultatif)</label>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Précisions (facultatif)</label>
                <textarea
                  className="input"
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="Heure de retrait, chantier concerné…"
                />
              </div>
            </div>

            {erreur && (
              <p className="mt-4 text-sm" style={{ color: 'rgb(var(--danger))' }}>
                {erreur}
              </p>
            )}

            <button type="submit" className="btn-primary mt-5 w-full" disabled={busy}>
              {busy ? 'Envoi…' : `Commander pour ${xof(total)}`}
            </button>
          </form>
        </>
      )}

      <footer
        className="mt-12 border-t pt-6 text-[13px]"
        style={{ borderColor: 'rgb(var(--line))', color: 'rgb(var(--muted))' }}
      >
        {shopName}
      </footer>
    </main>
  );
}
