'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Receipt as ReceiptIcon, X } from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/supabase';
import { PageHeader } from '@/components/admin/PageHeader';
import type {
  Sale,
  SaleItem,
  Service,
  Product,
  Client,
  Staff,
} from '@/lib/types';

type CartLine = {
  key: string;
  kind: 'service' | 'product' | 'free';
  ref_id?: string;
  name: string;
  unit_price_xof: number;
  quantity: number;
};

type PaymentMethod = Sale['payment_method'];

const PAYMENTS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Espèces' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'card', label: 'Carte' },
  { value: 'other', label: 'Autre' },
];

function fmt(xof: number) {
  return new Intl.NumberFormat('fr-FR').format(xof);
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function VentesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);

  const [showPos, setShowPos] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [staffId, setStaffId] = useState<string>('');
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const [
      { data: s },
      { data: it },
      { data: srv },
      { data: pr },
      { data: cl },
      { data: st },
    ] = await Promise.all([
      supabase
        .from('sales')
        .select('*')
        .order('paid_at', { ascending: false })
        .limit(60),
      supabase.from('sale_items').select('*'),
      supabase
        .from('services')
        .select('*')
        .eq('active', true)
        .order('display_order'),
      supabase.from('products').select('*').eq('active', true).order('name'),
      supabase.from('clients').select('*').order('name'),
      supabase.from('staff').select('*').eq('active', true).order('display_order'),
    ]);
    setSales((s as Sale[]) || []);
    setItems((it as SaleItem[]) || []);
    setServices((srv as Service[]) || []);
    setProducts((pr as Product[]) || []);
    setClients((cl as Client[]) || []);
    setStaff((st as Staff[]) || []);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(uniqueChannel('sales-admin'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const itemsBySale = useMemo(() => {
    const map = new Map<string, SaleItem[]>();
    items.forEach((i) => {
      const arr = map.get(i.sale_id) ?? [];
      arr.push(i);
      map.set(i.sale_id, arr);
    });
    return map;
  }, [items]);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const todayTotal = sales
      .filter((s) => new Date(s.paid_at) >= today)
      .reduce((sum, s) => sum + s.total_xof, 0);
    const monthTotal = sales
      .filter((s) => new Date(s.paid_at) >= monthStart)
      .reduce((sum, s) => sum + s.total_xof, 0);
    return {
      todayTotal,
      monthTotal,
      count: sales.length,
      avg:
        sales.length > 0
          ? Math.round(sales.reduce((s, x) => s + x.total_xof, 0) / sales.length)
          : 0,
    };
  }, [sales]);

  const cartTotal = useMemo(
    () => cart.reduce((s, l) => s + l.unit_price_xof * l.quantity, 0),
    [cart],
  );

  function addService(s: Service) {
    setCart((c) => [
      ...c,
      {
        key: uid(),
        kind: 'service',
        ref_id: s.id,
        name: s.name,
        unit_price_xof: s.price_xof,
        quantity: 1,
      },
    ]);
  }
  function addProduct(p: Product) {
    setCart((c) => [
      ...c,
      {
        key: uid(),
        kind: 'product',
        ref_id: p.id,
        name: p.name,
        unit_price_xof: p.price_xof,
        quantity: 1,
      },
    ]);
  }
  function addFree() {
    setCart((c) => [
      ...c,
      {
        key: uid(),
        kind: 'free',
        name: '',
        unit_price_xof: 0,
        quantity: 1,
      },
    ]);
  }
  function patchLine(key: string, patch: Partial<CartLine>) {
    setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    setCart((c) => c.filter((l) => l.key !== key));
  }
  function resetPos() {
    setCart([]);
    setClientId('');
    setStaffId('');
    setPayment('cash');
    setShowPos(false);
  }

  async function submitSale() {
    if (cart.length === 0) return;
    setSubmitting(true);

    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .insert({
        client_id: clientId || null,
        staff_id: staffId || null,
        total_xof: cartTotal,
        payment_method: payment,
      })
      .select()
      .single();

    if (saleErr || !sale) {
      alert('Erreur création vente : ' + (saleErr?.message ?? 'inconnue'));
      setSubmitting(false);
      return;
    }

    const itemsPayload = cart.map((l) => ({
      sale_id: sale.id,
      product_id: l.kind === 'product' ? l.ref_id ?? null : null,
      service_id: l.kind === 'service' ? l.ref_id ?? null : null,
      name: l.name.trim() || 'Article',
      quantity: l.quantity,
      unit_price_xof: l.unit_price_xof,
      subtotal_xof: l.unit_price_xof * l.quantity,
    }));

    const { error: itemsErr } = await supabase.from('sale_items').insert(itemsPayload);
    setSubmitting(false);
    if (itemsErr) {
      alert('Vente créée mais erreur sur les lignes : ' + itemsErr.message);
      return;
    }
    resetPos();
  }

  return (
    <div className="space-y-10 stagger">
      <PageHeader
        eyebrow="Activité"
        title="Ventes"
        italic="& caisse"
        description="Encaisse une vente, suis ton chiffre du jour, garde l'historique."
        right={
          <button onClick={() => setShowPos(true)} className="btn-primary">
            <Plus className="h-3.5 w-3.5" />
            Nouvelle vente
          </button>
        }
      />

      <div className="grid gap-px bg-[rgb(var(--line))] sm:grid-cols-4">
        <Stat label="Aujourd'hui" value={`${fmt(stats.todayTotal)} FCFA`} />
        <Stat label="Ce mois-ci" value={`${fmt(stats.monthTotal)} FCFA`} />
        <Stat label="Tickets enregistrés" value={String(stats.count)} />
        <Stat label="Panier moyen" value={`${fmt(stats.avg)} FCFA`} />
      </div>

      {/* POS modal */}
      {showPos && (
        <div className="surface space-y-6 p-6">
          <div className="flex items-baseline justify-between">
            <div className="eyebrow">Encaissement</div>
            <button
              onClick={resetPos}
              aria-label="Fermer"
              className="text-[11px] uppercase tracking-[0.24em] underline-anim"
            >
              Fermer
            </button>
          </div>

          {/* Catalogue rapide */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div
                className="mb-2 text-[10px] uppercase tracking-[0.24em]"
                style={{ color: 'rgb(var(--muted))' }}
              >
                Services
              </div>
              <div className="grid gap-px bg-[rgb(var(--line))] grid-cols-1 sm:grid-cols-2">
                {services.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => addService(s)}
                    className="bg-[rgb(var(--bg))] px-3 py-2.5 text-left hover:bg-[rgb(var(--surface-2))]"
                  >
                    <div className="text-[13px] font-medium truncate">{s.name}</div>
                    <div
                      className="text-[11px] uppercase tracking-[0.18em] tabular-nums"
                      style={{ color: 'rgb(var(--muted))' }}
                    >
                      {fmt(s.price_xof)} FCFA
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div
                className="mb-2 text-[10px] uppercase tracking-[0.24em]"
                style={{ color: 'rgb(var(--muted))' }}
              >
                Produits
              </div>
              <div className="grid gap-px bg-[rgb(var(--line))] grid-cols-1 sm:grid-cols-2">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    disabled={p.stock <= 0}
                    className="bg-[rgb(var(--bg))] px-3 py-2.5 text-left hover:bg-[rgb(var(--surface-2))] disabled:opacity-40"
                  >
                    <div className="text-[13px] font-medium truncate">
                      {p.name}
                    </div>
                    <div
                      className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em]"
                      style={{ color: 'rgb(var(--muted))' }}
                    >
                      <span className="tabular-nums">{fmt(p.price_xof)} FCFA</span>
                      <span>stock {p.stock}</span>
                    </div>
                  </button>
                ))}
                {products.length === 0 && (
                  <div
                    className="bg-[rgb(var(--bg))] py-4 text-center text-[12px]"
                    style={{ color: 'rgb(var(--muted))' }}
                  >
                    Aucun produit
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={addFree}
            className="text-[11px] uppercase tracking-[0.24em] underline-anim"
          >
            + Ligne libre
          </button>

          {/* Cart */}
          {cart.length > 0 && (
            <div className="grid gap-px bg-[rgb(var(--line))]">
              <div
                className="bg-[rgb(var(--bg))] grid items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.24em]"
                style={{
                  gridTemplateColumns: '1fr 5rem 6rem 6rem 2rem',
                  color: 'rgb(var(--muted))',
                }}
              >
                <span>Article</span>
                <span className="text-right">Qté</span>
                <span className="text-right">PU (FCFA)</span>
                <span className="text-right">Sous-total</span>
                <span></span>
              </div>
              {cart.map((l) => (
                <div
                  key={l.key}
                  className="bg-[rgb(var(--bg))] grid items-center gap-2 px-4 py-2.5"
                  style={{ gridTemplateColumns: '1fr 5rem 6rem 6rem 2rem' }}
                >
                  <input
                    className="input"
                    value={l.name}
                    onChange={(e) => patchLine(l.key, { name: e.target.value })}
                    placeholder="Nom"
                  />
                  <input
                    type="number"
                    min={1}
                    className="input text-right tabular-nums"
                    value={l.quantity}
                    onChange={(e) =>
                      patchLine(l.key, {
                        quantity: Math.max(1, parseInt(e.target.value || '1', 10)),
                      })
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    className="input text-right tabular-nums"
                    value={l.unit_price_xof}
                    onChange={(e) =>
                      patchLine(l.key, {
                        unit_price_xof: parseInt(e.target.value || '0', 10),
                      })
                    }
                  />
                  <span className="text-right tabular-nums text-[13px]">
                    {fmt(l.unit_price_xof * l.quantity)}
                  </span>
                  <button
                    onClick={() => removeLine(l.key)}
                    aria-label="Supprimer"
                    className="opacity-50 hover:opacity-100 justify-self-end"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Total + meta */}
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Cliente">
              <select
                className="input"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">— Anonyme</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Staff">
              <select
                className="input"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
              >
                <option value="">—</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Paiement">
              <select
                className="input"
                value={payment}
                onChange={(e) => setPayment(e.target.value as PaymentMethod)}
              >
                {PAYMENTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5"
            style={{ borderColor: 'rgb(var(--line))' }}
          >
            <div className="font-display text-3xl font-medium tabular-nums">
              {fmt(cartTotal)}
              <span
                className="ml-1 text-[12px] uppercase tracking-[0.18em]"
                style={{ color: 'rgb(var(--muted))' }}
              >
                FCFA
              </span>
            </div>
            <button
              onClick={submitSale}
              disabled={cart.length === 0 || submitting}
              className="btn-primary"
            >
              {submitting ? 'Enregistrement…' : 'Encaisser'}
            </button>
          </div>
        </div>
      )}

      {/* Historique */}
      <section>
        <div className="eyebrow mb-4">Tickets récents</div>
        {sales.length === 0 ? (
          <div
            className="border border-dashed py-16 text-center text-[13px]"
            style={{
              borderColor: 'rgb(var(--line))',
              color: 'rgb(var(--muted))',
            }}
          >
            <ReceiptIcon className="mx-auto mb-3 h-5 w-5" strokeWidth={1.5} />
            Aucune vente enregistrée pour le moment.
          </div>
        ) : (
          <div className="grid gap-px bg-[rgb(var(--line))]">
            {sales.map((sale) => {
              const lines = itemsBySale.get(sale.id) ?? [];
              const c = sale.client_id ? clientById.get(sale.client_id) : null;
              const st = sale.staff_id ? staffById.get(sale.staff_id) : null;
              const date = new Date(sale.paid_at);
              return (
                <div key={sale.id} className="bg-[rgb(var(--bg))] px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-3">
                      <span
                        className="text-[10px] uppercase tracking-[0.24em] tabular-nums"
                        style={{ color: 'rgb(var(--muted))' }}
                      >
                        {date.toLocaleDateString('fr-FR')} ·{' '}
                        {date.toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="text-[13px]">
                        {c?.name ?? 'Anonyme'}
                        {st && (
                          <span style={{ color: 'rgb(var(--muted))' }}> · {st.name}</span>
                        )}
                      </span>
                    </div>
                    <span className="font-display text-[18px] font-medium tabular-nums">
                      {fmt(sale.total_xof)}
                      <span
                        className="ml-1 text-[10px] uppercase tracking-[0.18em]"
                        style={{ color: 'rgb(var(--muted))' }}
                      >
                        FCFA
                      </span>
                    </span>
                  </div>
                  {lines.length > 0 && (
                    <div
                      className="mt-2 text-[12px]"
                      style={{ color: 'rgb(var(--ink-soft))' }}
                    >
                      {lines
                        .map(
                          (l) =>
                            `${l.name}${l.quantity > 1 ? ` ×${l.quantity}` : ''}`,
                        )
                        .join(' · ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[rgb(var(--bg))] p-6">
      <div className="font-display text-3xl font-medium tracking-tight tabular-nums">
        {value}
      </div>
      <div
        className="mt-1 text-[11px] uppercase tracking-[0.2em]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {label}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="block mb-2 text-[10px] uppercase tracking-[0.24em]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
