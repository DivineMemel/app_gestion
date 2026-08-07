'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  UserPlus,
  X,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { db } from '@/lib/admin-db';
import { useMember } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { Ticket, type TicketData, type ShopHeader } from '@/components/admin/Ticket';
import { qty as fmtQty, xof } from '@/lib/format';
import {
  PAYMENT_LABELS,
  type CartLine,
  type Customer,
  type PaymentMethod,
  type ProductUnit,
} from '@/lib/types';

type CatalogItem = {
  id: string;
  name: string;
  sku: string | null;
  base_unit: string;
  stock_qty: number;
  image_url: string | null;
  product_units: ProductUnit[];
};

const MOYENS: PaymentMethod[] = [
  'especes',
  'mobile_money',
  'virement',
  'cheque',
  'credit',
];

export default function CaissePage() {
  const me = useMember();

  const [catalogue, setCatalogue] = useState<CatalogItem[]>([]);
  const [clients, setClients] = useState<Customer[]>([]);
  const [shop, setShop] = useState<ShopHeader>({ name: 'NADAL SERVICES' });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [recherche, setRecherche] = useState('');
  const [panier, setPanier] = useState<CartLine[]>([]);
  const [remise, setRemise] = useState(0);
  const [clientId, setClientId] = useState<string | null>(null);
  const [moyen, setMoyen] = useState<PaymentMethod>('especes');
  const [regle, setRegle] = useState<string>('');
  const [note, setNote] = useState('');
  const [encaissement, setEncaissement] = useState(false);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [chercheClient, setChercheClient] = useState('');
  const [ouvreClients, setOuvreClients] = useState(false);
  // Création de fiche depuis la caisse : au comptoir, personne ne quitte
  // l'écran de vente pour aller créer un client dans un autre menu.
  const [creationClient, setCreationClient] = useState(false);
  const [nouveauClient, setNouveauClient] = useState({
    name: '',
    phone: '',
    credit_limit_xof: '',
  });
  const [busyClient, setBusyClient] = useState(false);

  const champRecherche = useRef<HTMLInputElement>(null);

  /**
   * Le catalogue entier est chargé une fois puis filtré en mémoire. Une
   * requête par frappe rendrait la caisse inutilisable dès que la connexion
   * faiblit — et au comptoir, elle faiblit.
   */
  const charger = useCallback(async () => {
    setChargement(true);
    const [prods, cls, params] = await Promise.all([
      db
        .from('products')
        .select(
          'id, name, sku, base_unit, stock_qty, image_url, product_units(id, product_id, label, factor, price_xof, is_default, position)',
        )
        .eq('active', true)
        .order('name'),
      db.from('customers').select('*').order('name'),
      db
        .from('shop_settings')
        .select('name, address, phone, invoice_footer')
        .eq('id', 1)
        .maybeSingle(),
    ]);

    setErreur(prods.error?.message ?? cls.error?.message ?? null);
    setCatalogue((prods.data ?? []) as CatalogItem[]);
    setClients((cls.data ?? []) as Customer[]);
    if (params.data) setShop(params.data as ShopHeader);
    setChargement(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return catalogue.slice(0, 24);
    return catalogue
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? '').toLowerCase().includes(q),
      )
      .slice(0, 24);
  }, [catalogue, recherche]);

  const clientsFiltres = useMemo(() => {
    const q = chercheClient.trim().toLowerCase();
    if (!q) return clients.slice(0, 30);
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q),
      )
      .slice(0, 30);
  }, [clients, chercheClient]);

  const client = clients.find((c) => c.id === clientId) ?? null;

  const sousTotal = panier.reduce((s, l) => s + l.qty * l.unit_price_xof, 0);
  const total = Math.max(sousTotal - remise, 0);
  const regleNum = Math.min(Math.max(Number(regle) || 0, 0), total);
  const reste = total - regleNum;

  function ajouter(p: CatalogItem, unite: ProductUnit) {
    const key = `${p.id}:${unite.label}`;
    setPanier((cur) => {
      const i = cur.findIndex((l) => l.key === key);
      if (i >= 0) {
        const copie = [...cur];
        copie[i] = { ...copie[i], qty: copie[i].qty + 1 };
        return copie;
      }
      return [
        ...cur,
        {
          key,
          product_id: p.id,
          product_name: p.name,
          base_unit: p.base_unit,
          stock_qty: p.stock_qty,
          unit_label: unite.label,
          unit_factor: Number(unite.factor),
          unit_price_xof: Number(unite.price_xof),
          qty: 1,
        },
      ];
    });
    setRecherche('');
    champRecherche.current?.focus();
  }

  function majLigne(key: string, patch: Partial<CartLine>) {
    setPanier((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function retirer(key: string) {
    setPanier((cur) => cur.filter((l) => l.key !== key));
  }

  function vider() {
    setPanier([]);
    setRemise(0);
    setRegle('');
    setNote('');
    setClientId(null);
    setMoyen('especes');
  }

  /**
   * Crée la fiche cliente sans quitter la caisse et la sélectionne aussitôt.
   *
   * C'est le cas courant de la vente à crédit : la cliente est devant le
   * comptoir, elle n'a pas encore de fiche, et l'ardoise exige un titulaire.
   */
  async function creerClient(e: React.FormEvent) {
    e.preventDefault();
    const nom = nouveauClient.name.trim();
    if (nom.length < 2) return;

    setBusyClient(true);
    setErreur(null);

    const { data, error } = await db
      .from('customers')
      .insert({
        name: nom,
        phone: nouveauClient.phone.trim() || null,
        credit_limit_xof: Number(nouveauClient.credit_limit_xof.replace(/\D/g, '')) || 0,
        kind: 'particulier',
      })
      .select('*')
      .single();

    setBusyClient(false);
    if (error || !data) {
      setErreur(error?.message ?? 'Création impossible.');
      return;
    }

    const cree = data as Customer;
    setClients((cur) => [...cur, cree].sort((a, b) => a.name.localeCompare(b.name, 'fr')));
    setClientId(cree.id);
    setNouveauClient({ name: '', phone: '', credit_limit_xof: '' });
    setCreationClient(false);
    setOuvreClients(false);
    setChercheClient('');
  }

  // Quantité demandée par produit, toutes lignes confondues : deux lignes du
  // même article (au sac et à la palette) puisent dans le même stock.
  const demandeParProduit = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of panier) {
      m.set(l.product_id, (m.get(l.product_id) ?? 0) + l.qty * l.unit_factor);
    }
    return m;
  }, [panier]);

  const alertesStock = panier.filter(
    (l) => (demandeParProduit.get(l.product_id) ?? 0) > l.stock_qty,
  );

  const creditSansClient = reste > 0 && !clientId;
  const peutEncaisser =
    panier.length > 0 && !creditSansClient && !encaissement;

  async function encaisser() {
    if (!peutEncaisser) return;
    setEncaissement(true);
    setErreur(null);

    const { data, error } = await db.rpc('create_sale', {
      p: {
        customer_id: clientId,
        discount_xof: remise,
        paid_xof: regleNum,
        payment_method: moyen,
        channel: 'comptoir',
        note: note.trim() || null,
        items: panier.map((l) => ({
          product_id: l.product_id,
          unit_label: l.unit_label,
          unit_factor: l.unit_factor,
          qty: l.qty,
          unit_price_xof: l.unit_price_xof,
        })),
      },
    });

    if (error) {
      setErreur(error.message);
      setEncaissement(false);
      return;
    }

    const vente = data as { number: string; total_xof: number; paid_xof: number };
    setTicket({
      number: vente.number,
      sold_at: new Date().toISOString(),
      customer_name: client?.name ?? null,
      customer_phone: client?.phone ?? null,
      lines: panier.map((l) => ({
        product_name: l.product_name,
        unit_label: l.unit_label,
        qty: l.qty,
        unit_price_xof: l.unit_price_xof,
        line_total_xof: l.qty * l.unit_price_xof,
      })),
      subtotal_xof: sousTotal,
      discount_xof: remise,
      total_xof: vente.total_xof,
      paid_xof: vente.paid_xof,
      payment_method: moyen,
      seller: me.name,
    });

    vider();
    charger(); // le stock a bougé
    setEncaissement(false);
  }

  return (
    <>
      <PageHeader
        title="Caisse"
        subtitle={`${catalogue.length} articles au catalogue`}
        actions={
          <button onClick={charger} className="btn-outline" disabled={chargement}>
            <RefreshCw
              className={`h-4 w-4 ${chargement ? 'animate-spin' : ''}`}
              strokeWidth={1.75}
            />
            Actualiser
          </button>
        }
      />

      {erreur && (
        <div
          className="mb-4 border p-3 text-sm"
          style={{
            borderColor: 'rgb(var(--danger) / 0.4)',
            background: 'rgb(var(--danger) / 0.06)',
            color: 'rgb(var(--danger))',
          }}
        >
          {erreur}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        {/* ---------- Recherche + catalogue ---------- */}
        <section>
          <div className="relative mb-3">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2"
              strokeWidth={1.75}
              style={{ color: 'rgb(var(--muted))' }}
            />
            <input
              ref={champRecherche}
              className="input input-lg pl-11"
              placeholder="Chercher un article ou une référence…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              autoFocus
            />
          </div>

          {chargement ? (
            <p className="p-8 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
              Chargement du catalogue…
            </p>
          ) : resultats.length === 0 ? (
            <p className="p-8 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
              Aucun article ne correspond à « {recherche} ».
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {resultats.map((p) => (
                <CarteProduit key={p.id} produit={p} onAjouter={ajouter} />
              ))}
            </div>
          )}
        </section>

        {/* ---------- Panier ---------- */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="surface">
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">Panier · {panier.length}</span>
              {panier.length > 0 && (
                <button onClick={vider} className="btn-ghost text-[12px]">
                  Vider
                </button>
              )}
            </div>

            {panier.length === 0 ? (
              <p
                className="px-4 py-10 text-center text-sm"
                style={{ color: 'rgb(var(--muted))' }}
              >
                Ajoute un article pour démarrer la vente.
              </p>
            ) : (
              <ul>
                {panier.map((l) => {
                  const trop = (demandeParProduit.get(l.product_id) ?? 0) > l.stock_qty;
                  return (
                    <li
                      key={l.key}
                      className="border-b px-4 py-3"
                      style={{ borderColor: 'rgb(var(--line))' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium">
                            {l.product_name}
                          </div>
                          <div
                            className="text-[12px]"
                            style={{ color: 'rgb(var(--muted))' }}
                          >
                            {l.unit_label} · {xof(l.unit_price_xof)}
                          </div>
                        </div>
                        <button
                          onClick={() => retirer(l.key)}
                          className="btn-ghost shrink-0"
                          aria-label="Retirer"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            className="btn-outline px-2 py-1"
                            onClick={() =>
                              majLigne(l.key, { qty: Math.max(l.qty - 1, 1) })
                            }
                            aria-label="Moins"
                          >
                            <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <input
                            className="input w-20 px-2 py-1 text-center"
                            value={l.qty}
                            inputMode="decimal"
                            onChange={(e) => {
                              const v = Number(e.target.value.replace(',', '.'));
                              majLigne(l.key, {
                                qty: Number.isFinite(v) && v > 0 ? v : l.qty,
                              });
                            }}
                          />
                          <button
                            className="btn-outline px-2 py-1"
                            onClick={() => majLigne(l.key, { qty: l.qty + 1 })}
                            aria-label="Plus"
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                        <span className="tnum font-semibold">
                          {xof(l.qty * l.unit_price_xof)}
                        </span>
                      </div>

                      {trop && (
                        <div
                          className="mt-2 flex items-center gap-1.5 text-[12px]"
                          style={{ color: 'rgb(var(--warn))' }}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
                          Stock : {fmtQty(l.stock_qty)} {l.base_unit} seulement
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* ---------- Encaissement ---------- */}
            <div className="space-y-3 p-4">
              <div>
                <label className="label">Client</label>
                {client ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium">
                        {client.name}
                      </div>
                      {client.phone && (
                        <div
                          className="text-[12px]"
                          style={{ color: 'rgb(var(--muted))' }}
                        >
                          {client.phone}
                        </div>
                      )}
                    </div>
                    <button onClick={() => setClientId(null)} className="btn-ghost">
                      <X className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setOuvreClients(true)}
                    className="btn-outline w-full justify-start"
                  >
                    <UserPlus className="h-4 w-4" strokeWidth={1.75} />
                    Client de passage
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Remise</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={remise || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const v = Number(e.target.value.replace(/\D/g, ''));
                      setRemise(Number.isFinite(v) ? Math.min(v, sousTotal) : 0);
                    }}
                  />
                </div>
                <div>
                  <label className="label">Réglé</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={regle}
                    placeholder={String(total)}
                    onChange={(e) => setRegle(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>

              <div>
                <label className="label">Moyen de paiement</label>
                <select
                  className="select"
                  value={moyen}
                  onChange={(e) => {
                    const m = e.target.value as PaymentMethod;
                    setMoyen(m);
                    // « Crédit » = rien n'entre en caisse maintenant.
                    if (m === 'credit') setRegle('0');
                  }}
                >
                  {MOYENS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div
                className="space-y-1 border-t pt-3 text-[14px]"
                style={{ borderColor: 'rgb(var(--line-strong))' }}
              >
                <div className="flex justify-between">
                  <span style={{ color: 'rgb(var(--muted))' }}>Sous-total</span>
                  <span className="tnum">{xof(sousTotal)}</span>
                </div>
                {remise > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'rgb(var(--muted))' }}>Remise</span>
                    <span className="tnum">− {xof(remise)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xl font-bold">
                  <span>Total</span>
                  <span className="tnum">{xof(total)}</span>
                </div>
                {reste > 0 && (
                  <div
                    className="flex justify-between font-semibold"
                    style={{ color: 'rgb(var(--danger))' }}
                  >
                    <span>Reste dû</span>
                    <span className="tnum">{xof(reste)}</span>
                  </div>
                )}
                {regleNum > total && (
                  <div className="flex justify-between" style={{ color: 'rgb(var(--muted))' }}>
                    <span>À rendre</span>
                    <span className="tnum">{xof(regleNum - total)}</span>
                  </div>
                )}
              </div>

              {creditSansClient && (
                <p className="text-[13px]" style={{ color: 'rgb(var(--danger))' }}>
                  Une ardoise doit être rattachée à un client — sinon elle est
                  irrécouvrable.
                </p>
              )}
              {alertesStock.length > 0 && (
                <p className="text-[13px]" style={{ color: 'rgb(var(--warn))' }}>
                  Stock insuffisant sur {alertesStock.length} ligne
                  {alertesStock.length > 1 ? 's' : ''} — la vente sera refusée si
                  le stock négatif n’est pas autorisé dans les réglages.
                </p>
              )}

              <button
                onClick={encaisser}
                className="btn-primary w-full text-base"
                disabled={!peutEncaisser}
              >
                {encaissement ? 'Encaissement…' : `Encaisser ${xof(total)}`}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ---------- Sélecteur de client ---------- */}
      {ouvreClients && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4"
          onClick={() => setOuvreClients(false)}
        >
          <div
            className="surface mt-10 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">{creationClient ? 'Nouveau client' : 'Choisir un client'}</span>
              <button
                onClick={() => {
                  setOuvreClients(false);
                  setCreationClient(false);
                }}
                className="btn-ghost"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            {creationClient ? (
              <form onSubmit={creerClient} className="space-y-3 p-4">
                <div>
                  <label className="label">Nom</label>
                  <input
                    className="input"
                    value={nouveauClient.name}
                    onChange={(e) =>
                      setNouveauClient((c) => ({ ...c, name: e.target.value }))
                    }
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">Téléphone</label>
                  <input
                    className="input"
                    value={nouveauClient.phone}
                    onChange={(e) =>
                      setNouveauClient((c) => ({ ...c, phone: e.target.value }))
                    }
                    placeholder="+225 …"
                  />
                </div>
                <div>
                  <label className="label">Plafond de crédit (F)</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={nouveauClient.credit_limit_xof}
                    onChange={(e) =>
                      setNouveauClient((c) => ({
                        ...c,
                        credit_limit_xof: e.target.value.replace(/\D/g, ''),
                      }))
                    }
                    placeholder="0 = pas d’ardoise"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setCreationClient(false)}
                  >
                    Retour
                  </button>
                  <button type="submit" className="btn-primary" disabled={busyClient}>
                    {busyClient ? 'Création…' : 'Créer et sélectionner'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="p-4">
                  <input
                    className="input"
                    placeholder="Nom ou téléphone…"
                    value={chercheClient}
                    onChange={(e) => setChercheClient(e.target.value)}
                    autoFocus
                  />
                </div>
                <ul className="max-h-72 overflow-y-auto">
                  {clientsFiltres.map((c) => (
                    <li key={c.id}>
                      <button
                        className="flex w-full items-center justify-between border-b px-4 py-3 text-left hover:bg-[rgb(var(--surface-2))]"
                        style={{ borderColor: 'rgb(var(--line))' }}
                        onClick={() => {
                          setClientId(c.id);
                          setOuvreClients(false);
                          setChercheClient('');
                        }}
                      >
                        <span>
                          <span className="block text-[14px] font-medium">{c.name}</span>
                          <span
                            className="block text-[12px]"
                            style={{ color: 'rgb(var(--muted))' }}
                          >
                            {c.phone ?? '—'}
                          </span>
                        </span>
                        {c.credit_limit_xof > 0 && (
                          <span className="badge badge-accent">
                            crédit {xof(c.credit_limit_xof)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                  {clientsFiltres.length === 0 && (
                    <li
                      className="px-4 py-6 text-center text-sm"
                      style={{ color: 'rgb(var(--muted))' }}
                    >
                      Aucun client ne correspond.
                    </li>
                  )}
                </ul>

                <div
                  className="border-t p-3"
                  style={{ borderColor: 'rgb(var(--line))' }}
                >
                  <button
                    className="btn-primary w-full"
                    onClick={() => {
                      // Ce qui a été tapé sert d'amorce : des chiffres, c'est
                      // un numéro ; sinon, c'est un nom.
                      const saisi = chercheClient.trim();
                      const estNumero = /^[\d+\s]+$/.test(saisi) && saisi.length > 0;
                      setNouveauClient({
                        name: estNumero ? '' : saisi,
                        phone: estNumero ? saisi : '',
                        credit_limit_xof: '',
                      });
                      setCreationClient(true);
                    }}
                  >
                    <UserPlus className="h-4 w-4" strokeWidth={2} />
                    Nouveau client
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {ticket && (
        <Ticket data={ticket} shop={shop} onClose={() => setTicket(null)} />
      )}
    </>
  );
}

/** Carte article : une pastille par unité de vente, prix affiché sur chacune. */
function CarteProduit({
  produit,
  onAjouter,
}: {
  produit: CatalogItem;
  onAjouter: (p: CatalogItem, u: ProductUnit) => void;
}) {
  const unites = [...(produit.product_units ?? [])].sort(
    (a, b) =>
      Number(b.is_default) - Number(a.is_default) ||
      a.position - b.position ||
      Number(a.factor) - Number(b.factor),
  );
  const rupture = produit.stock_qty <= 0;

  return (
    <div className="surface p-3">
      <div className="flex items-start justify-between gap-2">
        {/* Vignette volontairement petite : au comptoir on cherche par nom,
            l'image ne sert qu'à lever un doute sur un article de décoration. */}
        {produit.image_url && (
          <div
            className="relative h-10 w-10 shrink-0 overflow-hidden border"
            style={{ borderColor: 'rgb(var(--line))' }}
          >
            <Image
              src={produit.image_url}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{produit.name}</div>
          <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
            {produit.sku && <span className="font-mono">{produit.sku} · </span>}
            {fmtQty(produit.stock_qty)} {produit.base_unit}
          </div>
        </div>
        {rupture && <span className="badge badge-danger shrink-0">Rupture</span>}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {unites.length === 0 ? (
          <span className="text-[12px]" style={{ color: 'rgb(var(--warn))' }}>
            Aucun prix défini
          </span>
        ) : (
          unites.map((u) => (
            <button
              key={u.id}
              onClick={() => onAjouter(produit, u)}
              className="btn-outline px-2.5 py-1.5 text-[12px]"
            >
              <span className="font-semibold">{u.label}</span>
              <span style={{ color: 'rgb(var(--muted))' }}>{xof(u.price_xof)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
