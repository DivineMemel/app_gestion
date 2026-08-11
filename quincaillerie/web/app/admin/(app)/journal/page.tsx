'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react';
import { db, MODE_DEMO } from '@/lib/admin-db';
import { PageHeader } from '@/components/admin/PageHeader';
import { dateTime } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/permissions';
import type { AuditEntry } from '@/lib/types';

/**
 * Journal d'audit — « qui a fait ça, et quand ».
 *
 * `stock_movements` raconte l'histoire de la marchandise. Cette page raconte
 * celle des décisions : un prix modifié, un plafond d'ardoise relevé, un
 * mouvement de stock supprimé. C'est ce qu'on cherche le jour d'un litige, et
 * c'est ce qu'aucune table ne conservait.
 */

type Action = AuditEntry['action'];

const ACTION_LABELS: Record<Action, string> = {
  insert: 'Création',
  update: 'Modification',
  upsert: 'Enregistrement',
  delete: 'Suppression',
};

const ACTION_CLASSE: Record<Action, string> = {
  insert: 'badge badge-ok',
  update: 'badge badge-warn',
  upsert: 'badge badge-warn',
  delete: 'badge badge-danger',
};

// Noms de tables → ce que ça veut dire au comptoir. Une page d'audit qui
// affiche « supply_entry_items » ne sert qu'à ceux qui ont écrit le schéma.
const TABLE_LABELS: Record<string, string> = {
  categories: 'Rayons',
  products: 'Produits',
  product_units: 'Unités de vente',
  customers: 'Clients',
  suppliers: 'Fournisseurs',
  purchase_orders: 'Commandes fournisseur',
  purchase_order_items: 'Lignes de commande fournisseur',
  sales: 'Ventes',
  sale_items: 'Lignes de vente',
  payments: 'Règlements',
  quotes: 'Devis',
  quote_items: 'Lignes de devis',
  orders: 'Commandes en ligne',
  order_items: 'Lignes de commande',
  stock_movements: 'Mouvements de stock',
  supply_entries: 'Arrivages',
  supply_entry_items: "Lignes d'arrivage",
  stock_counts: 'Inventaires',
  stock_count_items: "Lignes d'inventaire",
  expenses: 'Dépenses',
  expense_categories: 'Postes de dépense',
  shop_settings: 'Réglages',
  team_members: 'Comptes',
};

const LIMITE = 300;

export default function JournalPage() {
  const [lignes, setLignes] = useState<AuditEntry[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [action, setAction] = useState<Action | 'toutes'>('toutes');
  const [seulementEchecs, setSeulementEchecs] = useState(false);
  const [ouvert, setOuvert] = useState<number | null>(null);

  const load = useCallback(async () => {
    setChargement(true);
    let q = db
      .from('audit_log')
      .select(
        'id, member_id, member_name, member_role, action, table_name, filters, changes, row_ids, ok, error, at',
      )
      .order('at', { ascending: false })
      .limit(LIMITE);

    if (action !== 'toutes') q = q.eq('action', action);
    if (seulementEchecs) q = q.is('ok', false);

    const { data, error } = await q;
    setErreur(error?.message ?? null);
    setLignes((data ?? []) as AuditEntry[]);
    setChargement(false);
  }, [action, seulementEchecs]);

  useEffect(() => {
    load();
  }, [load]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return lignes;
    return lignes.filter(
      (l) =>
        (l.member_name ?? '').toLowerCase().includes(q) ||
        l.table_name.toLowerCase().includes(q) ||
        (TABLE_LABELS[l.table_name] ?? '').toLowerCase().includes(q) ||
        (l.row_ids ?? []).some((id) => id.toLowerCase().includes(q)),
    );
  }, [lignes, recherche]);

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle={`Les ${LIMITE} dernières écritures passées par l’administration.`}
      />

      {MODE_DEMO && (
        <div className="surface mb-5 p-4 text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Le journal est tenu par le serveur. En mode démonstration, les données
          vivent dans ce navigateur : il n’y a donc rien à journaliser, et cette
          page reste vide tant que Supabase n’est pas branché.
        </div>
      )}

      <div className="surface mb-5 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'rgb(var(--muted))' }}
          />
          <input
            className="input pl-9"
            placeholder="Employé, rubrique, identifiant…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>

        <select
          className="input w-auto"
          value={action}
          onChange={(e) => setAction(e.target.value as Action | 'toutes')}
        >
          <option value="toutes">Toutes les actions</option>
          <option value="insert">Créations</option>
          <option value="update">Modifications</option>
          <option value="upsert">Enregistrements</option>
          <option value="delete">Suppressions</option>
        </select>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={seulementEchecs}
            onChange={(e) => setSeulementEchecs(e.target.checked)}
          />
          Refus et erreurs seulement
        </label>
      </div>

      {erreur && (
        <div className="surface mb-5 flex items-start gap-3 p-4">
          <ShieldAlert size={18} style={{ color: 'rgb(var(--danger))' }} />
          <span className="text-sm">{erreur}</span>
        </div>
      )}

      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: 'rgb(var(--muted))' }}>
                <th className="px-4 py-3 font-medium">Quand</th>
                <th className="px-4 py-3 font-medium">Qui</th>
                <th className="px-4 py-3 font-medium">Quoi</th>
                <th className="px-4 py-3 font-medium">Sur</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {chargement && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'rgb(var(--muted))' }}>
                    Chargement…
                  </td>
                </tr>
              )}

              {!chargement && filtrees.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'rgb(var(--muted))' }}>
                    Rien à afficher.
                  </td>
                </tr>
              )}

              {filtrees.map((l) => {
                const estOuvert = ouvert === l.id;
                return (
                  <tr key={l.id} className="border-t align-top" style={{ borderColor: 'rgb(var(--line))' }}>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{dateTime(l.at)}</td>
                    <td className="px-4 py-3">
                      <span className="block">{l.member_name ?? '—'}</span>
                      {l.member_role && (
                        <span className="block text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                          {ROLE_LABELS[l.member_role]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={ACTION_CLASSE[l.action]}>{ACTION_LABELS[l.action]}</span>
                      {!l.ok && (
                        <span className="badge badge-danger ml-2" title={l.error ?? undefined}>
                          refusé
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block">{TABLE_LABELS[l.table_name] ?? l.table_name}</span>
                      {l.row_ids && l.row_ids.length > 0 && (
                        <span
                          className="block font-mono text-[11px]"
                          style={{ color: 'rgb(var(--muted))' }}
                        >
                          {l.row_ids.slice(0, 2).join(', ')}
                          {l.row_ids.length > 2 && ` +${l.row_ids.length - 2}`}
                        </span>
                      )}
                      {estOuvert && <Details entree={l} />}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setOuvert(estOuvert ? null : l.id)}
                        aria-label={estOuvert ? 'Replier' : 'Détail'}
                      >
                        {estOuvert ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Details({ entree }: { entree: AuditEntry }) {
  const bloc = (titre: string, valeur: unknown) => {
    if (valeur == null) return null;
    return (
      <div className="mt-2">
        <span className="block text-[11px] uppercase tracking-wide" style={{ color: 'rgb(var(--muted))' }}>
          {titre}
        </span>
        <pre className="mt-1 overflow-x-auto rounded p-2 font-mono text-[11px]"
             style={{ background: 'rgb(var(--line) / 0.35)' }}>
          {JSON.stringify(valeur, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div className="mt-3 max-w-2xl">
      {bloc('Sur quelles lignes', entree.filters)}
      {bloc('Ce qui a été écrit', entree.changes)}
      {entree.error && bloc('Erreur', entree.error)}
    </div>
  );
}
