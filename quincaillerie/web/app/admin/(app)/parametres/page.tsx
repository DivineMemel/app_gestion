'use client';
import { useCallback, useEffect, useState } from 'react';
import { Save, Check } from 'lucide-react';
import { db } from '@/lib/admin-db';
import { useCanWrite } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import type { ShopSettings } from '@/lib/types';

export default function ParametresPage() {
  const peutEcrire = useCanWrite('parametres');

  const [form, setForm] = useState<Partial<ShopSettings>>({});
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await db
      .from('shop_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    setErreur(error?.message ?? null);
    if (data) setForm(data as ShopSettings);
    setChargement(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set =
    <K extends keyof ShopSettings>(k: K) =>
    (v: ShopSettings[K]) =>
      setForm((f) => ({ ...f, [k]: v }));

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!peutEcrire) return;
    setBusy(true);
    setErreur(null);
    setEnregistre(false);

    const { error } = await db
      .from('shop_settings')
      .update({
        name: (form.name ?? '').trim() || 'NADAL SERVICES',
        tagline: form.tagline?.trim() || null,
        phone: form.phone?.trim() || null,
        whatsapp: form.whatsapp?.trim() || null,
        email: form.email?.trim() || null,
        address: form.address?.trim() || null,
        logo_url: form.logo_url?.trim() || null,
        invoice_footer: form.invoice_footer?.trim() || null,
        allow_negative_stock: Boolean(form.allow_negative_stock),
        default_min_stock: Number(form.default_min_stock) || 0,
        online_orders_open: Boolean(form.online_orders_open),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    setBusy(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setEnregistre(true);
    setTimeout(() => setEnregistre(false), 2500);
  }

  if (chargement) {
    return (
      <>
        <PageHeader title="Paramètres" />
        <p className="surface p-10 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Chargement…
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Paramètres"
        subtitle="Identité de la boutique et règles de gestion"
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

      <form onSubmit={enregistrer} className="max-w-2xl space-y-6">
        {/* ---------- Identité ---------- */}
        <section className="surface p-5">
          <h2 className="eyebrow mb-4">Identité</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Nom</label>
              <input
                className="input"
                value={form.name ?? ''}
                onChange={(e) => set('name')(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Accroche</label>
              <input
                className="input"
                value={form.tagline ?? ''}
                onChange={(e) => set('tagline')(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Téléphone</label>
              <input
                className="input"
                value={form.phone ?? ''}
                onChange={(e) => set('phone')(e.target.value)}
                placeholder="+225 07 04 74 03 18"
              />
            </div>
            <div>
              <label className="label">WhatsApp</label>
              <input
                className="input"
                value={form.whatsapp ?? ''}
                onChange={(e) => set('whatsapp')(e.target.value)}
              />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input
                type="email"
                className="input"
                value={form.email ?? ''}
                onChange={(e) => set('email')(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Adresse</label>
              <input
                className="input"
                value={form.address ?? ''}
                onChange={(e) => set('address')(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Logo (URL)</label>
              <input
                className="input"
                value={form.logo_url ?? ''}
                onChange={(e) => set('logo_url')(e.target.value)}
                placeholder="https://…/logo.png"
              />
              <p className="mt-1 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                Laisse vide pour garder le sigle dessiné de la charte.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Pied de facture</label>
              <input
                className="input"
                value={form.invoice_footer ?? ''}
                onChange={(e) => set('invoice_footer')(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* ---------- Règles ---------- */}
        <section className="surface p-5">
          <h2 className="eyebrow mb-4">Règles de gestion</h2>
          <div className="space-y-4">
            <div className="max-w-xs">
              <label className="label">Seuil d’alerte par défaut</label>
              <input
                className="input"
                inputMode="decimal"
                value={form.default_min_stock ?? 0}
                onChange={(e) => set('default_min_stock')(Number(e.target.value) || 0)}
              />
              <p className="mt-1 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                Appliqué aux articles qui n’ont pas leur propre seuil.
              </p>
            </div>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(form.allow_negative_stock)}
                onChange={(e) => set('allow_negative_stock')(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium">
                  Autoriser le stock négatif
                </span>
                <span className="block text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  Permet de vendre de la marchandise pas encore réceptionnée. La
                  caisse refuse la vente quand c’est décoché.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(form.online_orders_open)}
                onChange={(e) => set('online_orders_open')(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium">
                  Commandes en ligne ouvertes
                </span>
                <span className="block text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  Décoche pendant les congés : le catalogue reste visible, mais la
                  validation de commande est refusée.
                </span>
              </span>
            </label>
          </div>
        </section>

        {peutEcrire && (
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              {enregistre ? (
                <>
                  <Check className="h-4 w-4" strokeWidth={2} />
                  Enregistré
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" strokeWidth={1.75} />
                  {busy ? 'Enregistrement…' : 'Enregistrer'}
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </>
  );
}
