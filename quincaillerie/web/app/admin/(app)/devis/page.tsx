'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, X, Trash2, Search, FileText, ArrowRightLeft, Printer } from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { useCanWrite, useMember } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { FiltrePeriode } from '@/components/admin/FiltrePeriode';
import { useFiltres } from '@/lib/filtres';
import { filtrerInstants, libellePeriode, type Periode } from '@/lib/periode';

const RACCOURCIS: Periode[] = ['jour', 'semaine', 'mois', 'tout'];
import { FeuilleA4, type LigneDoc } from '@/components/admin/FeuilleA4';
import { dateShort, qty as fmtQty, xof } from '@/lib/format';
import {
  PAYMENT_LABELS,
  QUOTE_STATUS_LABELS,
  type Customer,
  type DocItem,
  type PaymentMethod,
  type ProductUnit,
  type Quote,
  type QuoteStatus,
  type ShopSettings,
} from '@/lib/types';

type CatalogItem = {
  id: string;
  name: string;
  sku: string | null;
  base_unit: string;
  product_units: ProductUnit[];
};

type Ligne = {
  key: string;
  product_id: string;
  product_name: string;
  unit_label: string;
  unit_factor: number;
  unit_price_xof: number;
  qty: number;
};

const CLASSE: Record<QuoteStatus, string> = {
  brouillon: 'badge',
  envoye: 'badge badge-accent',
  accepte: 'badge badge-ok',
  refuse: 'badge badge-danger',
  converti: 'badge badge-ok',
  expire: 'badge badge-warn',
};

const MOYENS: PaymentMethod[] = ['especes', 'mobile_money', 'virement', 'cheque', 'credit'];

export default function DevisPage() {
  const me = useMember();
  const peutEcrire = useCanWrite('devis');

  const [devis, setDevis] = useState<Quote[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogItem[]>([]);
  const [clients, setClients] = useState<Customer[]>([]);
  const [shop, setShop] = useState<Partial<ShopSettings>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // Création
  const [ouvert, setOuvert] = useState(false);
  const [clientId, setClientId] = useState('');
  const [nomLibre, setNomLibre] = useState('');
  const [telLibre, setTelLibre] = useState('');
  const [validite, setValidite] = useState('');
  const [note, setNote] = useState('');
  const [remise, setRemise] = useState(0);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [recherche, setRecherche] = useState('');
  const [busy, setBusy] = useState(false);

  // Impression / conversion
  const [feuille, setFeuille] = useState<{
    devis: Quote;
    lignes: LigneDoc[];
  } | null>(null);
  const [conversion, setConversion] = useState<Quote | null>(null);
  const [regle, setRegle] = useState('');
  const [moyen, setMoyen] = useState<PaymentMethod>('especes');

  const [filtres, setFiltre, filtresPrets] = useFiltres('devis', {
    periode: 'tout',
    debut: '',
    fin: '',
  });
  const periode = filtres.periode as Periode;
  const { debut, fin } = filtres;

  const load = useCallback(async () => {
    // Les bornes s'appliquent à la requête, pas à l'affichage : filtrer après
    // coup ne trierait que ce que la limite a déjà laissé passer.
    const [d, p, c, s] = await Promise.all([
      filtrerInstants(
        db
          .from('quotes')
          .select(
            'id, number, customer_id, customer_name, customer_phone, subtotal_xof, discount_xof, total_xof, status, valid_until, note, converted_sale_id, created_at, customers(name, phone)',
          )
          .order('created_at', { ascending: false })
          .limit(200),
        'created_at',
        periode,
        debut,
        fin,
      ),
      db
        .from('products')
        .select(
          'id, name, sku, base_unit, product_units(id, product_id, label, factor, price_xof, is_default, position)',
        )
        .eq('active', true)
        .order('name'),
      db.from('customers').select('*').order('name'),
      db.from('shop_settings').select('*').eq('id', 1).maybeSingle(),
    ]);

    setErreur(d.error?.message ?? null);
    setDevis((d.data ?? []) as Quote[]);
    setCatalogue((p.data ?? []) as CatalogItem[]);
    setClients((c.data ?? []) as Customer[]);
    if (s.data) setShop(s.data as ShopSettings);
    setChargement(false);
  }, []);

  useEffect(() => {
    if (!filtresPrets) return;
    load();
    const ch = db
      .channel(uniqueChannel('devis'))
      .on('postgres_changes', { table: 'quotes' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load, filtresPrets]);

  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return [];
    return catalogue
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [catalogue, recherche]);

  const sousTotal = lignes.reduce((s, l) => s + l.qty * l.unit_price_xof, 0);
  const total = Math.max(sousTotal - remise, 0);

  function ajouter(p: CatalogItem, u: ProductUnit) {
    const key = `${p.id}:${u.label}`;
    setLignes((cur) => {
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
          unit_label: u.label,
          unit_factor: Number(u.factor),
          unit_price_xof: Number(u.price_xof),
          qty: 1,
        },
      ];
    });
    setRecherche('');
  }

  function ouvrirNouveau() {
    setClientId('');
    setNomLibre('');
    setTelLibre('');
    setNote('');
    setRemise(0);
    setLignes([]);
    setRecherche('');
    // Un devis de chantier tient rarement plus d'un mois : les prix des
    // matériaux bougent trop.
    const dans30 = new Date(Date.now() + 30 * 86_400_000);
    setValidite(dans30.toISOString().slice(0, 10));
    setOuvert(true);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!peutEcrire || lignes.length === 0) return;
    if (!clientId && !nomLibre.trim()) {
      setErreur('Indique un client, même juste son nom.');
      return;
    }

    setBusy(true);
    setErreur(null);

    const { data, error } = await db
      .from('quotes')
      .insert({
        customer_id: clientId || null,
        customer_name: clientId ? null : nomLibre.trim(),
        customer_phone: clientId ? null : telLibre.trim() || null,
        subtotal_xof: sousTotal,
        discount_xof: remise,
        total_xof: total,
        status: 'brouillon',
        valid_until: validite || null,
        note: note.trim() || null,
      })
      .select('id')
      .single();

    if (error || !data) {
      setErreur(error?.message ?? 'Création impossible.');
      setBusy(false);
      return;
    }

    const quoteId = (data as { id: string }).id;
    const { error: itemsErr } = await db.from('quote_items').insert(
      lignes.map((l) => ({
        quote_id: quoteId,
        product_id: l.product_id,
        product_name: l.product_name,
        unit_label: l.unit_label,
        unit_factor: l.unit_factor,
        qty: l.qty,
        unit_price_xof: l.unit_price_xof,
        line_total_xof: Math.round(l.qty * l.unit_price_xof),
      })),
    );

    if (itemsErr) {
      await db.from('quotes').delete().eq('id', quoteId);
      setErreur(itemsErr.message);
      setBusy(false);
      return;
    }

    setBusy(false);
    setOuvert(false);
    load();
  }

  async function changerStatut(q: Quote, statut: QuoteStatus) {
    const { error } = await db.from('quotes').update({ status: statut }).eq('id', q.id);
    if (error) setErreur(error.message);
    else load();
  }

  async function imprimer(q: Quote) {
    const { data, error } = await db
      .from('quote_items')
      .select('product_name, unit_label, qty, unit_price_xof, line_total_xof')
      .eq('quote_id', q.id);
    if (error) {
      setErreur(error.message);
      return;
    }
    setFeuille({ devis: q, lignes: (data ?? []) as DocItem[] });
  }

  function ouvrirConversion(q: Quote) {
    setConversion(q);
    setRegle(String(q.total_xof));
    setMoyen('especes');
  }

  /** Le devis accepté devient une vente : stock sorti, aucune ressaisie. */
  async function convertir(e: React.FormEvent) {
    e.preventDefault();
    if (!conversion) return;
    setBusy(true);
    setErreur(null);

    const { error } = await db.rpc('convert_quote_to_sale', {
      p_quote_id: conversion.id,
      p_paid_xof: Number(regle.replace(/\D/g, '')) || 0,
      p_method: moyen,
    });

    setBusy(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setConversion(null);
    load();
  }

  const nomDe = (q: Quote) => q.customers?.name ?? q.customer_name ?? 'Client';

  return (
    <>
      <PageHeader
        title="Devis"
        subtitle={`${devis.length} devis · ${libellePeriode(periode, debut, fin)}`}
        actions={
          <>
            <FiltrePeriode
              options={RACCOURCIS}
              periode={periode}
              debut={debut}
              fin={fin}
              onPeriode={(p) => setFiltre('periode', p)}
              onDebut={(v) => setFiltre('debut', v)}
              onFin={(v) => setFiltre('fin', v)}
            />
            {peutEcrire && (
              <button onClick={ouvrirNouveau} className="btn-primary">
                <Plus className="h-4 w-4" strokeWidth={2} />
                Nouveau devis
              </button>
            )}
          </>
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

      <div className="surface tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>N°</th>
              <th>Client</th>
              <th>Statut</th>
              <th>Validité</th>
              <th className="num">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr>
                <td colSpan={6} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  Chargement…
                </td>
              </tr>
            ) : devis.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  <FileText className="mx-auto mb-2 h-6 w-6" strokeWidth={1.5} />
                  Aucun devis. C’est l’outil du chiffrage de chantier.
                </td>
              </tr>
            ) : (
              devis.map((q) => {
                const expire =
                  q.valid_until &&
                  q.status !== 'converti' &&
                  new Date(q.valid_until) < new Date();
                return (
                  <tr key={q.id}>
                    <td className="font-mono text-[13px] font-medium">{q.number}</td>
                    <td>
                      <div className="font-medium">{nomDe(q)}</div>
                      <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                        {q.customers?.phone ?? q.customer_phone ?? '—'}
                      </div>
                    </td>
                    <td>
                      <span className={CLASSE[q.status]}>
                        {QUOTE_STATUS_LABELS[q.status]}
                      </span>
                    </td>
                    <td style={{ color: expire ? 'rgb(var(--danger))' : 'rgb(var(--muted))' }}>
                      {q.valid_until ? dateShort(q.valid_until) : '—'}
                      {expire && ' (expiré)'}
                    </td>
                    <td className="num font-semibold">{xof(q.total_xof)}</td>
                    <td className="num">
                      <button onClick={() => imprimer(q)} className="btn-ghost">
                        <Printer className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                      {peutEcrire && q.status === 'brouillon' && (
                        <button
                          onClick={() => changerStatut(q, 'envoye')}
                          className="btn-ghost"
                        >
                          Envoyé
                        </button>
                      )}
                      {peutEcrire && q.status === 'envoye' && (
                        <button
                          onClick={() => changerStatut(q, 'accepte')}
                          className="btn-ghost"
                        >
                          Accepté
                        </button>
                      )}
                      {peutEcrire && q.status === 'accepte' && (
                        <button onClick={() => ouvrirConversion(q)} className="btn-primary">
                          <ArrowRightLeft className="h-4 w-4" strokeWidth={1.75} />
                          En vente
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- Création ---------- */}
      {ouvert && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <form onSubmit={enregistrer} className="surface mx-auto my-6 w-full max-w-2xl">
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">Nouveau devis</span>
              <button type="button" onClick={() => setOuvert(false)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Client existant</label>
                  <select
                    className="select"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  >
                    <option value="">— client de passage —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Valable jusqu’au</label>
                  <input
                    type="date"
                    className="input"
                    value={validite}
                    onChange={(e) => setValidite(e.target.value)}
                  />
                </div>

                {!clientId && (
                  <>
                    <div>
                      <label className="label">Nom du client</label>
                      <input
                        className="input"
                        value={nomLibre}
                        onChange={(e) => setNomLibre(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Téléphone</label>
                      <input
                        className="input"
                        value={telLibre}
                        onChange={(e) => setTelLibre(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Recherche d'article */}
              <div>
                <label className="label">Ajouter une ligne</label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    strokeWidth={1.75}
                    style={{ color: 'rgb(var(--muted))' }}
                  />
                  <input
                    className="input pl-10"
                    placeholder="Article, prestation, référence…"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                  />
                </div>
                {resultats.length > 0 && (
                  <div
                    className="mt-1 max-h-56 overflow-y-auto border"
                    style={{ borderColor: 'rgb(var(--line))' }}
                  >
                    {resultats.map((p) => (
                      <div
                        key={p.id}
                        className="border-b px-3 py-2"
                        style={{ borderColor: 'rgb(var(--line))' }}
                      >
                        <div className="text-[13px] font-medium">{p.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {[...(p.product_units ?? [])]
                            .sort((a, b) => Number(b.is_default) - Number(a.is_default))
                            .map((u) => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => ajouter(p, u)}
                                className="btn-outline px-2 py-1 text-[12px]"
                              >
                                {u.label} · {xof(u.price_xof)}
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Lignes */}
              {lignes.length > 0 && (
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Désignation</th>
                        <th className="num">Qté</th>
                        <th className="num">P.U.</th>
                        <th className="num">Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((l, i) => (
                        <tr key={l.key}>
                          <td>
                            <div className="text-[13px] font-medium">{l.product_name}</div>
                            <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                              {l.unit_label}
                            </div>
                          </td>
                          <td className="num">
                            <input
                              className="input w-20 px-2 py-1 text-right"
                              inputMode="decimal"
                              value={l.qty}
                              onChange={(e) => {
                                const v = Number(e.target.value.replace(',', '.'));
                                setLignes((cur) =>
                                  cur.map((x, j) =>
                                    j === i && Number.isFinite(v) && v > 0
                                      ? { ...x, qty: v }
                                      : x,
                                  ),
                                );
                              }}
                            />
                          </td>
                          <td className="num">
                            <input
                              className="input w-24 px-2 py-1 text-right"
                              inputMode="numeric"
                              value={l.unit_price_xof}
                              onChange={(e) => {
                                const v = Number(e.target.value.replace(/\D/g, ''));
                                setLignes((cur) =>
                                  cur.map((x, j) =>
                                    j === i ? { ...x, unit_price_xof: v || 0 } : x,
                                  ),
                                );
                              }}
                            />
                          </td>
                          <td className="num font-medium">
                            {xof(l.qty * l.unit_price_xof)}
                          </td>
                          <td className="num">
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() =>
                                setLignes((cur) => cur.filter((_, j) => j !== i))
                              }
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Remise (F)</label>
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
                  <label className="label">Note</label>
                  <input
                    className="input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Délai d’exécution, conditions…"
                  />
                </div>
              </div>

              <div className="flex justify-between text-xl font-bold">
                <span>Total du devis</span>
                <span className="tnum">{xof(total)}</span>
              </div>
            </div>

            <div
              className="flex justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <button type="button" onClick={() => setOuvert(false)} className="btn-outline">
                Annuler
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={busy || lignes.length === 0}
              >
                {busy ? 'Enregistrement…' : 'Créer le devis'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------- Conversion ---------- */}
      {conversion && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4">
          <form onSubmit={convertir} className="surface mt-16 w-full max-w-sm">
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">Convertir {conversion.number}</span>
              <button type="button" onClick={() => setConversion(null)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <p className="text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
                Une vente est créée avec les lignes du devis et la marchandise
                sort du stock. Le devis passe en « converti ».
              </p>

              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="tnum">{xof(conversion.total_xof)}</span>
              </div>

              <div>
                <label className="label">Montant réglé (F)</label>
                <input
                  className="input input-lg"
                  inputMode="numeric"
                  value={regle}
                  onChange={(e) => setRegle(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Moyen de paiement</label>
                <select
                  className="select"
                  value={moyen}
                  onChange={(e) => {
                    const m = e.target.value as PaymentMethod;
                    setMoyen(m);
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

              {!conversion.customer_id && (
                <p className="text-[13px]" style={{ color: 'rgb(var(--warn))' }}>
                  Ce devis n’est pas rattaché à une fiche client : un règlement
                  partiel sera refusé, car l’ardoise n’aurait aucun titulaire.
                </p>
              )}
            </div>

            <div
              className="flex justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <button type="button" onClick={() => setConversion(null)} className="btn-outline">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Conversion…' : 'Convertir en vente'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------- Feuille imprimable ---------- */}
      {feuille && (
        <FeuilleA4
          type="Devis"
          numero={feuille.devis.number}
          date={feuille.devis.created_at}
          validite={feuille.devis.valid_until}
          client={{
            nom: nomDe(feuille.devis),
            telephone:
              feuille.devis.customers?.phone ?? feuille.devis.customer_phone ?? null,
          }}
          lignes={feuille.lignes}
          sousTotal={feuille.devis.subtotal_xof}
          remise={feuille.devis.discount_xof}
          total={feuille.devis.total_xof}
          note={feuille.devis.note}
          shop={shop}
          onClose={() => setFeuille(null)}
        />
      )}

      <p className="mt-3 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
        Devis établis par {me.name}.
      </p>
    </>
  );
}
