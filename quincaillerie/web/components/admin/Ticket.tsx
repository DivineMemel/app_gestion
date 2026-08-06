'use client';
import { Printer, X } from 'lucide-react';
import { dateTime, qty as fmtQty, xof } from '@/lib/format';
import { PAYMENT_LABELS, type PaymentMethod } from '@/lib/types';

export type TicketLine = {
  product_name: string;
  unit_label: string;
  qty: number;
  unit_price_xof: number;
  line_total_xof: number;
};

export type TicketData = {
  number: string;
  sold_at: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  lines: TicketLine[];
  subtotal_xof: number;
  discount_xof: number;
  total_xof: number;
  paid_xof: number;
  payment_method: PaymentMethod;
  seller?: string | null;
};

export type ShopHeader = {
  name: string;
  address?: string | null;
  phone?: string | null;
  invoice_footer?: string | null;
};

/**
 * Ticket de caisse imprimable.
 *
 * Le même composant sert de reçu à l'écran et de sortie papier : les styles
 * d'impression (globals.css) masquent la surcouche et laissent la feuille.
 */
export function Ticket({
  data,
  shop,
  onClose,
  title = 'Reçu',
}: {
  data: TicketData;
  shop: ShopHeader;
  onClose?: () => void;
  title?: string;
}) {
  const reste = Math.max(data.total_xof - data.paid_xof, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 print:static print:bg-transparent print:p-0">
      <div className="print-sheet surface my-4 w-full max-w-md p-6 print:my-0 print:max-w-none">
        <div className="no-print mb-4 flex items-center justify-between">
          <span className="eyebrow">{title}</span>
          <div className="flex gap-1">
            <button onClick={() => window.print()} className="btn-outline">
              <Printer className="h-4 w-4" strokeWidth={1.75} />
              Imprimer
            </button>
            {onClose && (
              <button onClick={onClose} className="btn-ghost" aria-label="Fermer">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>

        <header className="mb-4 text-center">
          <div className="font-display text-2xl font-bold uppercase tracking-industrial">
            {shop.name}
          </div>
          {shop.address && <div className="text-[12px]">{shop.address}</div>}
          {shop.phone && <div className="text-[12px]">Tél. {shop.phone}</div>}
        </header>

        <div
          className="mb-3 border-y py-2 text-[12px]"
          style={{ borderColor: 'rgb(var(--line-strong))' }}
        >
          <div className="flex justify-between">
            <span>Ticket</span>
            <span className="font-mono font-semibold">{data.number}</span>
          </div>
          <div className="flex justify-between">
            <span>Date</span>
            <span>{dateTime(data.sold_at)}</span>
          </div>
          {data.customer_name && (
            <div className="flex justify-between">
              <span>Client</span>
              <span className="font-medium">{data.customer_name}</span>
            </div>
          )}
          {data.seller && (
            <div className="flex justify-between">
              <span>Vendeur</span>
              <span>{data.seller}</span>
            </div>
          )}
        </div>

        <table className="tbl mb-3">
          <thead>
            <tr>
              <th>Article</th>
              <th className="num">Qté</th>
              <th className="num">P.U.</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <div className="text-[13px] font-medium">{l.product_name}</div>
                  <div className="text-[11px]" style={{ color: 'rgb(var(--muted))' }}>
                    {l.unit_label}
                  </div>
                </td>
                <td className="num">{fmtQty(l.qty)}</td>
                <td className="num">{xof(l.unit_price_xof)}</td>
                <td className="num font-medium">{xof(l.line_total_xof)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-1 text-[13px]">
          <Ligne label="Sous-total" value={xof(data.subtotal_xof)} />
          {data.discount_xof > 0 && (
            <Ligne label="Remise" value={`− ${xof(data.discount_xof)}`} />
          )}
          <div
            className="flex justify-between border-t pt-2 text-lg font-bold"
            style={{ borderColor: 'rgb(var(--line-strong))' }}
          >
            <span>À PAYER</span>
            <span className="tnum">{xof(data.total_xof)}</span>
          </div>
          <Ligne
            label={`Réglé (${PAYMENT_LABELS[data.payment_method]})`}
            value={xof(data.paid_xof)}
          />
          {reste > 0 && (
            <div
              className="flex justify-between font-semibold"
              style={{ color: 'rgb(var(--danger))' }}
            >
              <span>Reste dû (ardoise)</span>
              <span className="tnum">{xof(reste)}</span>
            </div>
          )}
        </div>

        {shop.invoice_footer && (
          <p
            className="mt-5 text-center text-[12px]"
            style={{ color: 'rgb(var(--muted))' }}
          >
            {shop.invoice_footer}
          </p>
        )}
      </div>
    </div>
  );
}

function Ligne({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: 'rgb(var(--muted))' }}>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
