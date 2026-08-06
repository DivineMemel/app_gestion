'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Play, Search, CheckCircle2, X } from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { useCanWrite } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { dateTime, qty as fmtQty } from '@/lib/format';
import type { Category } from '@/lib/types';

type Campagne = {
  id: string;
  number: string;
  status: 'en_cours' | 'valide' | 'annule';
  category_id: string | null;
  note: string | null;
  validated_at: string | null;
  created_at: string;
  categories?: { name: string } | null;
};

type LigneComptage = {
  id: string;
  stock_count_id: string;
  product_id: string;
  qty_theorique: number;
  qty_comptee: number | null;
  note: string | null;
  products?: { name: string; base_unit: string } | null;
};

export default function InventairePage() {
  const peutEcrire = useCanWrite('inventaire');

  const [campagnes, setCampagnes] = useState<Campagne[]>([]);
  const [rayons, setRayons] = useState<Category[]>([]);
  const [lignes, setLignes] = useState<LigneComptage[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [recherche, setRecherche] = useState('');
  const [ecartsSeuls, setEcartsSeuls] = useState(false);
  const [ouvrir, setOuvrir] = useState(false);
  const [rayonChoisi, setRayonChoisi] = useState('');
  const [noteCampagne, setNoteCampagne] = useState('');

  const enCours = campagnes.find((c) => c.status === 'en_cours') ?? null;

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      db
        .from('stock_counts')
        .select('id, number, status, category_id, note, validated_at, created_at, categories(name)')
        .order('created_at', { ascending: false })
        .limit(30),
      db.from('categories').select('*').eq('active', true).order('position'),
    ]);
    setErreur(c.error?.message ?? null);
    const liste = (c.data ?? []) as Campagne[];
    setCampagnes(liste);
    setRayons((r.data ?? []) as Category[]);

    const active = liste.find((x) => x.status === 'en_cours');
    if (active) {
      const { data } = await db
        .from('stock_count_items')
        .select('id, stock_count_id, product_id, qty_theorique, qty_comptee, note, products(name, base_unit)')
        .eq('stock_count_id', active.id);
      setLignes(((data ?? []) as LigneComptage[]).sort((a, b) =>
        (a.products?.name ?? '').localeCompare(b.products?.name ?? '', 'fr'),
      ));
    } else {
      setLignes([]);
    }
    setChargement(false);
  }, []);

  useEffect(() => {
    load();
    const ch = db
      .channel(uniqueChannel('inventaire'))
      .on('postgres_changes', { table: 'stock_counts' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return lignes.filter((l) => {
      if (ecartsSeuls) {
        if (l.qty_comptee == null) return false;
        if (Number(l.qty_comptee) === Number(l.qty_theorique)) return false;
      }
      if (!q) return true;
      return (l.products?.name ?? '').toLowerCase().includes(q);
    });
  }, [lignes, recherche, ecartsSeuls]);

  const comptees = lignes.filter((l) => l.qty_comptee != null);
  const ecarts = comptees.filter(
    (l) => Number(l.qty_comptee) !== Number(l.qty_theorique),
  );

  async function demarrer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErreur(null);
    const { error } = await db.rpc('open_stock_count', {
      p_category_id: rayonChoisi || null,
      p_note: noteCampagne.trim() || null,
    });
    setBusy(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setOuvrir(false);
    setRayonChoisi('');
    setNoteCampagne('');
    load();
  }

  /** Enregistre le comptage d'une ligne. Vider le champ remet à « non compté ». */
  async function compter(l: LigneComptage, valeur: string) {
    const brut = valeur.trim().replace(',', '.');
    const n = brut === '' ? null : Number(brut);
    if (brut !== '' && !Number.isFinite(n)) return;

    setLignes((cur) =>
      cur.map((x) => (x.id === l.id ? { ...x, qty_comptee: n } : x)),
    );
    const { error } = await db
      .from('stock_count_items')
      .update({ qty_comptee: n })
      .eq('id', l.id);
    if (error) setErreur(error.message);
  }

  async function valider() {
    if (!enCours) return;
    if (comptees.length === 0) {
      setErreur('Aucun article compté : rien à valider.');
      return;
    }
    const nonComptes = lignes.length - comptees.length;
    const ok = window.confirm(
      `Valider ${enCours.number} ?\n\n` +
        `${comptees.length} article(s) compté(s), dont ${ecarts.length} avec un écart.\n` +
        (nonComptes > 0
          ? `${nonComptes} article(s) non compté(s) : ils ne seront PAS touchés.\n\n`
          : '\n') +
        `Après validation, le stock de chaque article compté vaudra exactement la quantité saisie.`,
    );
    if (!ok) return;

    setBusy(true);
    const { data, error } = await db.rpc('validate_stock_count', {
      p_count_id: enCours.id,
    });
    setBusy(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    const res = data as { ajustements?: number } | null;
    window.alert(
      `Inventaire validé. ${res?.ajustements ?? 0} mouvement(s) d’ajustement écrit(s) dans le grand livre.`,
    );
    load();
  }

  return (
    <>
      <PageHeader
        title="Inventaire"
        subtitle={
          enCours
            ? `${enCours.number} en cours · ${comptees.length}/${lignes.length} comptés`
            : 'Campagnes de comptage'
        }
        actions={
          peutEcrire && !enCours ? (
            <button onClick={() => setOuvrir(true)} className="btn-primary">
              <Play className="h-4 w-4" strokeWidth={2} />
              Démarrer une campagne
            </button>
          ) : peutEcrire && enCours ? (
            <>
              <button
                onClick={() => setEcartsSeuls((v) => !v)}
                className={ecartsSeuls ? 'btn-primary' : 'btn-outline'}
              >
                Écarts ({ecarts.length})
              </button>
              <button onClick={valider} className="btn-primary" disabled={busy}>
                <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
                Valider l’inventaire
              </button>
            </>
          ) : null
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

      {chargement ? (
        <p className="surface p-10 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Chargement…
        </p>
      ) : enCours ? (
        <>
          <div
            className="mb-4 border p-4 text-[13px]"
            style={{ borderColor: 'rgb(var(--line))', background: 'rgb(var(--surface-2))' }}
          >
            <strong>Compte, puis valide.</strong> Laisse vide ce que tu n’as pas
            compté — un article non compté n’est pas un article à zéro, il ne sera
            pas touché. À la validation, chaque article compté prend exactement la
            quantité saisie, et l’écart part dans le grand livre.
            {enCours.categories?.name && (
              <> Campagne limitée au rayon <strong>{enCours.categories.name}</strong>.</>
            )}
          </div>

          <div className="mb-4 relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              strokeWidth={1.75}
              style={{ color: 'rgb(var(--muted))' }}
            />
            <input
              className="input pl-10"
              placeholder="Chercher un article dans la campagne…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>

          <div className="surface tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Article</th>
                  <th className="num">Théorique</th>
                  <th className="num">Compté</th>
                  <th className="num">Écart</th>
                </tr>
              </thead>
              <tbody>
                {filtrees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                      {ecartsSeuls ? 'Aucun écart pour l’instant.' : 'Aucun article.'}
                    </td>
                  </tr>
                ) : (
                  filtrees.map((l) => {
                    const compte = l.qty_comptee != null;
                    const ecart = compte
                      ? Number(l.qty_comptee) - Number(l.qty_theorique)
                      : 0;
                    return (
                      <tr key={l.id}>
                        <td className="font-medium">{l.products?.name ?? '—'}</td>
                        <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                          {fmtQty(l.qty_theorique)} {l.products?.base_unit}
                        </td>
                        <td className="num">
                          <input
                            className="input w-28 px-2 py-1 text-right"
                            inputMode="decimal"
                            value={l.qty_comptee ?? ''}
                            placeholder="—"
                            disabled={!peutEcrire}
                            onChange={(e) =>
                              setLignes((cur) =>
                                cur.map((x) =>
                                  x.id === l.id
                                    ? {
                                        ...x,
                                        qty_comptee:
                                          e.target.value === ''
                                            ? null
                                            : (Number(e.target.value.replace(',', '.')) as number),
                                      }
                                    : x,
                                ),
                              )
                            }
                            onBlur={(e) => compter(l, e.target.value)}
                          />
                        </td>
                        <td className="num">
                          {!compte ? (
                            <span style={{ color: 'rgb(var(--muted))' }}>—</span>
                          ) : ecart === 0 ? (
                            <span className="badge badge-ok">juste</span>
                          ) : (
                            <span
                              className={ecart > 0 ? 'badge badge-warn' : 'badge badge-danger'}
                            >
                              {ecart > 0 ? '+' : ''}
                              {fmtQty(ecart)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="surface p-10 text-center">
          <ClipboardCheck
            className="mx-auto mb-3 h-8 w-8"
            strokeWidth={1.25}
            style={{ color: 'rgb(var(--muted))' }}
          />
          <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
            Aucune campagne en cours. Démarre-en une pour compter un rayon.
          </p>
        </div>
      )}

      {/* ---------- Historique ---------- */}
      {campagnes.filter((c) => c.status !== 'en_cours').length > 0 && (
        <section className="mt-8">
          <h2 className="eyebrow mb-2">Campagnes closes</h2>
          <div className="surface tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Périmètre</th>
                  <th>Validée le</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {campagnes
                  .filter((c) => c.status !== 'en_cours')
                  .map((c) => (
                    <tr key={c.id}>
                      <td className="font-mono text-[13px]">{c.number}</td>
                      <td>{c.categories?.name ?? 'Toute la boutique'}</td>
                      <td style={{ color: 'rgb(var(--muted))' }}>
                        {dateTime(c.validated_at)}
                      </td>
                      <td style={{ color: 'rgb(var(--muted))' }}>{c.note ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------- Démarrer ---------- */}
      {ouvrir && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4">
          <form onSubmit={demarrer} className="surface mt-16 w-full max-w-sm">
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">Démarrer une campagne</span>
              <button type="button" onClick={() => setOuvrir(false)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="label">Périmètre</label>
                <select
                  className="select"
                  value={rayonChoisi}
                  onChange={(e) => setRayonChoisi(e.target.value)}
                >
                  <option value="">Toute la boutique</option>
                  {rayons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  Compter toute la boutique d’un coup est rarement réaliste — on
                  tourne rayon par rayon.
                </p>
              </div>

              <div>
                <label className="label">Note</label>
                <input
                  className="input"
                  value={noteCampagne}
                  onChange={(e) => setNoteCampagne(e.target.value)}
                  placeholder="Inventaire de fin de mois…"
                />
              </div>

              <p className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                Le stock théorique est figé à l’ouverture. Fais le comptage
                boutique fermée : une vente saisie pendant la campagne serait
                absorbée par l’écart.
              </p>
            </div>

            <div
              className="flex justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <button type="button" onClick={() => setOuvrir(false)} className="btn-outline">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Ouverture…' : 'Démarrer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
