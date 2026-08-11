'use client';
import { Printer, X } from 'lucide-react';
import { dateShort, qty as fmtQty, xof } from '@/lib/format';
import type { ShopSettings } from '@/lib/types';

export type LigneDoc = {
  product_name: string;
  unit_label: string;
  qty: number;
  unit_price_xof: number;
  line_total_xof: number;
};

/**
 * Document A4 imprimable — devis, facture, bon de livraison.
 *
 * Même feuille pour les trois : seuls le titre, la mention légale et les
 * totaux changent. Les styles `@media print` de globals.css retirent la
 * surcouche et laissent la page nue.
 */
export function FeuilleA4({
  type,
  numero,
  date,
  validite,
  client,
  lignes,
  sousTotal,
  remise,
  total,
  note,
  shop,
  onClose,
}: {
  type: 'Devis' | 'Facture' | 'Bon de livraison';
  numero: string;
  date: string;
  validite?: string | null;
  client: { nom: string; telephone?: string | null; adresse?: string | null };
  lignes: LigneDoc[];
  sousTotal: number;
  remise: number;
  total: number;
  note?: string | null;
  shop: Partial<ShopSettings>;
  onClose: () => void;
}) {
  const montantsMasques = type === 'Bon de livraison';

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 p-4 print:static print:bg-transparent print:p-0">
      <div className="mx-auto w-full max-w-3xl">
        <div className="no-print mb-3 flex items-center justify-between">
          <span className="eyebrow" style={{ color: 'white' }}>
            {type} {numero}
          </span>
          <div className="flex gap-1">
            <button onClick={() => window.print()} className="btn-primary">
              <Printer className="h-4 w-4" strokeWidth={1.75} />
              Imprimer
            </button>
            <button onClick={onClose} className="btn-solid" aria-label="Fermer">
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="print-sheet surface p-8 print:p-0">
          {/* ---- En-tête ---- */}
          <header className="flex flex-wrap items-start justify-between gap-4 pb-5">
            <div>
              <div className="font-display text-2xl font-bold uppercase tracking-industrial">
                <span style={{ color: 'rgb(var(--accent))' }}>
                  {shop.name ?? 'NADAL MULTISERVICES'}
                </span>
              </div>
              {shop.tagline && (
                <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  {shop.tagline}
                </div>
              )}
              <div className="mt-2 text-[12px]">
                {shop.address}
                {shop.phone && <div>Tél. {shop.phone}</div>}
                {shop.email && <div>{shop.email}</div>}
              </div>
            </div>

            <div className="text-right">
              <div className="font-display text-3xl font-bold uppercase tracking-industrial">
                {type}
              </div>
              <div className="mt-1 font-mono text-[13px] font-semibold">{numero}</div>
              <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                Établi le {dateShort(date)}
              </div>
              {validite && (
                <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  Valable jusqu’au {dateShort(validite)}
                </div>
              )}
            </div>
          </header>

          <div className="hazard h-1" aria-hidden />

          {/* ---- Client ---- */}
          <section className="py-5">
            <div
              className="text-[10px] font-bold uppercase tracking-wide2"
              style={{ color: 'rgb(var(--muted))' }}
            >
              Client
            </div>
            <div className="mt-1 text-[15px] font-semibold">{client.nom}</div>
            {client.telephone && <div className="text-[13px]">{client.telephone}</div>}
            {client.adresse && (
              <div className="text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
                {client.adresse}
              </div>
            )}
          </section>

          {/* ---- Lignes ---- */}
          <table className="tbl">
            <thead>
              <tr>
                <th>Désignation</th>
                <th className="num">Qté</th>
                {!montantsMasques && <th className="num">P.U.</th>}
                {!montantsMasques && <th className="num">Montant</th>}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={i}>
                  <td>
                    <div className="text-[13px] font-medium">{l.product_name}</div>
                    <div className="text-[11px]" style={{ color: 'rgb(var(--muted))' }}>
                      {l.unit_label}
                    </div>
                  </td>
                  <td className="num">{fmtQty(l.qty)}</td>
                  {!montantsMasques && <td className="num">{xof(l.unit_price_xof)}</td>}
                  {!montantsMasques && (
                    <td className="num font-medium">{xof(l.line_total_xof)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* ---- Totaux ---- */}
          {!montantsMasques && (
            <div className="mt-5 flex justify-end">
              <div className="w-full max-w-xs space-y-1 text-[14px]">
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
                <div
                  className="flex justify-between border-t pt-2 text-xl font-bold"
                  style={{ borderColor: 'rgb(var(--ink))' }}
                >
                  <span>TOTAL</span>
                  <span className="tnum">{xof(total)}</span>
                </div>
              </div>
            </div>
          )}

          {note && (
            <p className="mt-5 text-[13px]" style={{ color: 'rgb(var(--ink-soft))' }}>
              {note}
            </p>
          )}

          {/* ---- Pied ---- */}
          <footer
            className="mt-8 border-t pt-4 text-[11px]"
            style={{ borderColor: 'rgb(var(--line))', color: 'rgb(var(--muted))' }}
          >
            {type === 'Devis' && (
              <p className="mb-2">
                Devis gratuit et sans engagement. Les prix s’entendent en francs
                CFA et restent valables jusqu’à la date indiquée, sous réserve de
                disponibilité des matériaux.
              </p>
            )}
            {shop.invoice_footer && <p>{shop.invoice_footer}</p>}
          </footer>
        </div>
      </div>
    </div>
  );
}
