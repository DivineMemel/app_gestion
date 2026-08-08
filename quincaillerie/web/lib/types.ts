import type { Role } from '@/lib/permissions';

// Types métier. Les montants sont des entiers en francs CFA, les quantités des
// nombres (on vend du sable au m³ comme des vis à l'unité).

export type Member = { id: string; name: string; role: Role };

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  position: number;
  active: boolean;
};

export type ProductUnit = {
  id: string;
  product_id: string;
  label: string;
  factor: number;
  price_xof: number;
  is_default: boolean;
  position: number;
};

export type Product = {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  category_id: string | null;
  image_url: string | null;
  base_unit: string;
  stock_qty: number;
  min_stock: number | null;
  /** Absent des réponses pour les rôles vendeur/magasinier. */
  cost_price_xof?: number;
  /** Prestation : pas de stock, pas de mouvement, hors inventaire. */
  is_service: boolean;
  active: boolean;
  published: boolean;
  low_stock_alerted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductWithUnits = Product & {
  product_units: ProductUnit[];
  categories?: { name: string } | null;
};

export type CustomerKind = 'particulier' | 'professionnel' | 'chantier';

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  kind: CustomerKind;
  credit_limit_xof: number;
  notes: string | null;
  created_at: string;
};

export type CustomerBalance = {
  id: string;
  name: string;
  phone: string | null;
  kind: CustomerKind;
  credit_limit_xof: number;
  total_achete_xof: number;
  total_regle_xof: number;
  solde_xof: number;
  derniere_vente: string | null;
};

export type PaymentMethod =
  | 'especes'
  | 'mobile_money'
  | 'virement'
  | 'cheque'
  | 'credit';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  especes: 'Espèces',
  mobile_money: 'Mobile money',
  virement: 'Virement',
  cheque: 'Chèque',
  credit: 'Crédit (ardoise)',
};

export type SaleStatus = 'payee' | 'partielle' | 'credit' | 'annulee';

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  payee: 'Payée',
  partielle: 'Partielle',
  credit: 'Ardoise',
  annulee: 'Annulée',
};

export type Sale = {
  id: string;
  number: string;
  customer_id: string | null;
  subtotal_xof: number;
  discount_xof: number;
  total_xof: number;
  paid_xof: number;
  payment_method: PaymentMethod;
  status: SaleStatus;
  channel: 'comptoir' | 'en_ligne';
  note: string | null;
  sold_by: string | null;
  sold_at: string;
  customers?: { name: string; phone: string | null } | null;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  unit_label: string;
  unit_factor: number;
  qty: number;
  unit_price_xof: number;
  line_total_xof: number;
  cost_price_xof?: number;
};

export type Payment = {
  id: string;
  customer_id: string | null;
  sale_id: string | null;
  amount_xof: number;
  method: Exclude<PaymentMethod, 'credit'>;
  note: string | null;
  paid_at: string;
};

export type QuoteStatus =
  | 'brouillon'
  | 'envoye'
  | 'accepte'
  | 'refuse'
  | 'converti'
  | 'expire';

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  accepte: 'Accepté',
  refuse: 'Refusé',
  converti: 'Converti',
  expire: 'Expiré',
};

export type Quote = {
  id: string;
  number: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal_xof: number;
  discount_xof: number;
  total_xof: number;
  status: QuoteStatus;
  valid_until: string | null;
  note: string | null;
  converted_sale_id: string | null;
  created_at: string;
  customers?: { name: string; phone: string | null } | null;
};

export type DocItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  unit_label: string;
  unit_factor: number;
  qty: number;
  unit_price_xof: number;
  line_total_xof: number;
};

export type OrderStatus = 'nouvelle' | 'confirmee' | 'prete' | 'retiree' | 'annulee';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  nouvelle: 'Nouvelle',
  confirmee: 'Confirmée',
  prete: 'Prête au retrait',
  retiree: 'Retirée',
  annulee: 'Annulée',
};

export type Order = {
  id: string;
  number: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  total_xof: number;
  status: OrderStatus;
  note: string | null;
  converted_sale_id: string | null;
  created_at: string;
};

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
};

export type PurchaseStatus =
  | 'brouillon'
  | 'commande'
  | 'recu_partiel'
  | 'recu'
  | 'annule';

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  brouillon: 'Brouillon',
  commande: 'Commandé',
  recu_partiel: 'Reçu partiel',
  recu: 'Reçu',
  annule: 'Annulé',
};

export type PurchaseOrder = {
  id: string;
  number: string;
  supplier_id: string | null;
  status: PurchaseStatus;
  total_xof: number;
  note: string | null;
  ordered_at: string | null;
  received_at: string | null;
  created_at: string;
  suppliers?: { name: string } | null;
};

export type StockMovementKind =
  | 'vente'
  | 'reception'
  | 'ajustement'
  | 'retour'
  | 'casse'
  | 'inventaire';

export const MOVEMENT_LABELS: Record<StockMovementKind, string> = {
  vente: 'Vente',
  reception: 'Réception',
  ajustement: 'Ajustement',
  retour: 'Retour',
  casse: 'Casse',
  inventaire: 'Inventaire',
};

export type StockMovement = {
  id: string;
  product_id: string;
  qty_base: number;
  kind: StockMovementKind;
  ref_table: string | null;
  ref_id: string | null;
  note: string | null;
  created_at: string;
  products?: { name: string; base_unit: string } | null;
};

export type LowStockRow = {
  id: string;
  sku: string | null;
  name: string;
  base_unit: string;
  stock_qty: number;
  min_stock: number;
  category_name: string | null;
};

export type Expense = {
  id: string;
  category_id: string | null;
  label: string;
  amount_xof: number;
  method: Exclude<PaymentMethod, 'credit'>;
  spent_on: string;
  note: string | null;
  expense_categories?: { name: string } | null;
};

export type MonthlyPnl = {
  mois: string;
  chiffre_xof: number;
  cout_marchandises_xof: number;
  marge_brute_xof: number;
  depenses_xof: number;
  resultat_xof: number;
};

export type ShopSettings = {
  id: number;
  name: string;
  tagline: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
  invoice_footer: string | null;
  allow_negative_stock: boolean;
  default_min_stock: number;
  online_orders_open: boolean;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'pending' | 'active' | 'disabled';
  phone: string | null;
  created_at: string;
};

/** Ligne du panier de caisse, avant encaissement. */
export type CartLine = {
  key: string;
  product_id: string;
  product_name: string;
  base_unit: string;
  stock_qty: number;
  unit_label: string;
  unit_factor: number;
  unit_price_xof: number;
  qty: number;
};
