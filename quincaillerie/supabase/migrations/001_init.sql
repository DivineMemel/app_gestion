-- ============================================================
-- NADAL SERVICES — Schéma initial
-- Matériaux, décoration & prestations · Abidjan · XOF · Africa/Abidjan (UTC+0)
--
-- À coller dans le SQL Editor Supabase, d'un bloc.
--
-- Principes du modèle :
--
--  1. Le STOCK est un grand livre. `stock_movements` est la seule écriture
--     autorisée ; `products.stock_qty` en est le solde, maintenu par trigger.
--     Impossible que les deux divergent, et on sait toujours d'où vient
--     chaque unité.
--
--  2. Tout est stocké en UNITÉ DE BASE. Un produit se vend au sac ou à la
--     palette, à la barre ou à la botte : chaque unité de vente porte son
--     facteur de conversion. Le stock, lui, ne connaît qu'une seule unité.
--
--  3. Une VENTE encaissée génère toujours un règlement. Du coup le solde
--     d'une cliente est simplement « total acheté − total réglé », que la
--     vente soit au comptant ou à l'ardoise. Pas de cas particulier.
--
--  4. Les MONTANTS sont des entiers en francs CFA. Le XOF n'a pas de
--     centimes : un float ne ferait qu'introduire des erreurs d'arrondi.
--
--  5. Les QUANTITÉS sont en numeric — on vend du sable au mètre cube et de
--     la peinture au litre, pas seulement des vis à l'unité.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- RÉGLAGES & COMPTES
-- ============================================================

create table if not exists shop_settings (
  id                  int primary key default 1,
  name                text not null default 'NADAL SERVICES',
  tagline             text default 'Staff · Plomberie · Décoration · Fosse septique',
  phone               text,
  whatsapp            text,
  email               text,
  address             text default 'Bingerville, nouvelle gare — Abidjan',
  logo_url            text,
  invoice_footer      text default 'Merci de votre confiance.',
  -- Autoriser une vente qui fait passer le stock sous zéro (marchandise
  -- vendue avant d'être réceptionnée). Désactivé par défaut.
  allow_negative_stock boolean not null default false,
  -- Seuil d'alerte appliqué aux produits qui n'en définissent pas.
  default_min_stock   numeric not null default 5,
  online_orders_open  boolean not null default true,
  updated_at          timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into shop_settings (id) values (1) on conflict do nothing;

-- Rôles :
--   patron      — tout, y compris comptes, réglages, marges et prix d'achat
--   gerant      — tout le quotidien sauf comptes/réglages
--   vendeur     — caisse, clients, devis ; ne voit ni marge ni prix d'achat
--   magasinier  — stock, réceptions fournisseurs ; pas d'accès à la caisse
create table if not exists team_members (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text unique not null,
  password_hash text not null,
  role          text not null default 'vendeur'
                check (role in ('patron', 'gerant', 'vendeur', 'magasinier')),
  status        text not null default 'pending'
                check (status in ('pending', 'active', 'disabled')),
  phone         text,
  created_at    timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text unique not null,
  p256dh     text not null,
  auth       text not null,
  member_id  uuid references team_members(id) on delete cascade,
  label      text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CATALOGUE
-- ============================================================

-- Rayons : Plomberie, Électricité, Ciment & agrégats, Peinture, Outillage…
create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  description text,
  image_url  text,
  position   int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  sku           text unique,
  barcode       text,
  name          text not null,
  description   text,
  category_id   uuid references categories(id) on delete set null,
  image_url     text,

  -- Unité dans laquelle le stock est compté (sac, barre, pièce, kg, m³…).
  base_unit     text not null default 'pièce',
  stock_qty     numeric not null default 0,
  min_stock     numeric,               -- null → default_min_stock des réglages

  -- Dernier prix d'achat connu, mis à jour à chaque réception. Sert au calcul
  -- de marge. Visible des seuls patron/gérant.
  cost_price_xof bigint not null default 0,

  active        boolean not null default true,
  -- Visible sur la vitrine publique (certains articles restent en interne).
  published     boolean not null default true,

  -- Anti-spam des alertes stock : on prévient une fois au passage sous le
  -- seuil, pas à chaque vente suivante. Remis à null dès que le stock repasse
  -- au-dessus, pour que la prochaine descente réalerte.
  low_stock_alerted_at timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists products_category_idx on products(category_id);
create index if not exists products_active_idx on products(active) where active;
-- Recherche au comptoir : par nom ou par référence.
create index if not exists products_name_idx on products (lower(name));
create index if not exists products_sku_idx on products (lower(sku));

-- Unités de vente d'un produit. Il en faut au moins une, de facteur 1.
--   Ciment  : « sac » (×1, 5 000 F) · « palette » (×40, 190 000 F)
--   Vis 6mm : « pièce » (×1, 50 F)  · « boîte de 100 » (×100, 4 000 F)
create table if not exists product_units (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  label       text not null,
  factor      numeric not null default 1 check (factor > 0),
  price_xof   bigint not null default 0 check (price_xof >= 0),
  is_default  boolean not null default false,
  position    int not null default 0,
  unique (product_id, label)
);
create index if not exists product_units_product_idx on product_units(product_id);

-- ============================================================
-- CLIENTS
-- ============================================================

create table if not exists customers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  phone            text,
  email            text,
  address          text,
  kind             text not null default 'particulier'
                   check (kind in ('particulier', 'professionnel', 'chantier')),
  -- Plafond d'ardoise. 0 = pas de crédit autorisé.
  credit_limit_xof bigint not null default 0 check (credit_limit_xof >= 0),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists customers_phone_idx on customers(phone);
create index if not exists customers_name_idx on customers (lower(name));

-- ============================================================
-- FOURNISSEURS & RÉAPPROVISIONNEMENT
-- ============================================================

create table if not exists suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  email      text,
  address    text,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence if not exists seq_purchase_number;

create table if not exists purchase_orders (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null
              default 'BC-' || to_char(now(), 'YYYY') || '-'
                      || lpad(nextval('seq_purchase_number')::text, 4, '0'),
  supplier_id uuid references suppliers(id) on delete set null,
  status      text not null default 'brouillon'
              check (status in ('brouillon', 'commande', 'recu_partiel', 'recu', 'annule')),
  total_xof   bigint not null default 0,
  note        text,
  ordered_at  timestamptz,
  received_at timestamptz,
  created_by  uuid references team_members(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  product_id        uuid not null references products(id) on delete restrict,
  -- Quantités exprimées en unité de base du produit.
  qty_base          numeric not null check (qty_base > 0),
  qty_received_base numeric not null default 0 check (qty_received_base >= 0),
  unit_cost_xof     bigint not null default 0 check (unit_cost_xof >= 0)
);
create index if not exists po_items_order_idx on purchase_order_items(purchase_order_id);

-- ============================================================
-- VENTES
-- ============================================================

create sequence if not exists seq_sale_number;

create table if not exists sales (
  id             uuid primary key default gen_random_uuid(),
  number         text unique not null
                 default 'V-' || to_char(now(), 'YYYY') || '-'
                         || lpad(nextval('seq_sale_number')::text, 5, '0'),
  customer_id    uuid references customers(id) on delete set null,
  subtotal_xof   bigint not null default 0,
  discount_xof   bigint not null default 0 check (discount_xof >= 0),
  total_xof      bigint not null default 0,
  -- Somme réglée au moment de la vente. Les règlements ultérieurs vivent
  -- dans `payments` ; ne pas recalculer le solde à partir de cette colonne.
  paid_xof       bigint not null default 0,
  payment_method text not null default 'especes'
                 check (payment_method in ('especes', 'mobile_money', 'virement', 'cheque', 'credit')),
  status         text not null default 'payee'
                 check (status in ('payee', 'partielle', 'credit', 'annulee')),
  channel        text not null default 'comptoir'
                 check (channel in ('comptoir', 'en_ligne')),
  note           text,
  sold_by        uuid references team_members(id) on delete set null,
  sold_at        timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists sales_sold_at_idx on sales(sold_at desc);
create index if not exists sales_customer_idx on sales(customer_id);
create index if not exists sales_status_idx on sales(status);

create table if not exists sale_items (
  id             uuid primary key default gen_random_uuid(),
  sale_id        uuid not null references sales(id) on delete cascade,
  product_id     uuid references products(id) on delete set null,
  -- Snapshots : un ticket réimprimé dans six mois doit montrer le nom et le
  -- prix pratiqués ce jour-là, pas ceux d'aujourd'hui.
  product_name   text not null,
  unit_label     text not null,
  unit_factor    numeric not null default 1,
  qty            numeric not null check (qty > 0),
  unit_price_xof bigint not null check (unit_price_xof >= 0),
  line_total_xof bigint not null,
  -- Coût unitaire au moment de la vente, pour la marge historique.
  cost_price_xof bigint not null default 0
);
create index if not exists sale_items_sale_idx on sale_items(sale_id);
create index if not exists sale_items_product_idx on sale_items(product_id);

-- Règlements. Une vente comptant en génère un immédiatement ; une ardoise
-- en accumule au fil des passages.
create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  sale_id     uuid references sales(id) on delete set null,
  amount_xof  bigint not null check (amount_xof > 0),
  method      text not null default 'especes'
              check (method in ('especes', 'mobile_money', 'virement', 'cheque')),
  note        text,
  received_by uuid references team_members(id) on delete set null,
  paid_at     timestamptz not null default now()
);
create index if not exists payments_customer_idx on payments(customer_id);
create index if not exists payments_sale_idx on payments(sale_id);

-- ============================================================
-- DEVIS
-- ============================================================

create sequence if not exists seq_quote_number;

create table if not exists quotes (
  id           uuid primary key default gen_random_uuid(),
  number       text unique not null
               default 'D-' || to_char(now(), 'YYYY') || '-'
                       || lpad(nextval('seq_quote_number')::text, 4, '0'),
  customer_id  uuid references customers(id) on delete set null,
  customer_name text,          -- devis pour un passant, sans fiche client
  customer_phone text,
  subtotal_xof bigint not null default 0,
  discount_xof bigint not null default 0,
  total_xof    bigint not null default 0,
  status       text not null default 'brouillon'
               check (status in ('brouillon', 'envoye', 'accepte', 'refuse', 'converti', 'expire')),
  valid_until  date,
  note         text,
  converted_sale_id uuid references sales(id) on delete set null,
  created_by   uuid references team_members(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists quote_items (
  id             uuid primary key default gen_random_uuid(),
  quote_id       uuid not null references quotes(id) on delete cascade,
  product_id     uuid references products(id) on delete set null,
  product_name   text not null,
  unit_label     text not null,
  unit_factor    numeric not null default 1,
  qty            numeric not null check (qty > 0),
  unit_price_xof bigint not null,
  line_total_xof bigint not null
);
create index if not exists quote_items_quote_idx on quote_items(quote_id);

-- ============================================================
-- COMMANDES EN LIGNE (vitrine)
-- ============================================================

create sequence if not exists seq_order_number;

-- Le stock n'est PAS décrémenté à la commande : la marchandise part quand la
-- cliente la retire, et c'est la vente créée à ce moment-là qui bouge le
-- stock. Une commande est une intention, pas une sortie.
create table if not exists orders (
  id             uuid primary key default gen_random_uuid(),
  number         text unique not null
                 default 'C-' || to_char(now(), 'YYYY') || '-'
                         || lpad(nextval('seq_order_number')::text, 4, '0'),
  customer_id    uuid references customers(id) on delete set null,
  customer_name  text not null,
  customer_phone text not null,
  customer_email text,
  total_xof      bigint not null default 0,
  status         text not null default 'nouvelle'
                 check (status in ('nouvelle', 'confirmee', 'prete', 'retiree', 'annulee')),
  note           text,
  converted_sale_id uuid references sales(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_created_idx on orders(created_at desc);

create table if not exists order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  product_id     uuid references products(id) on delete set null,
  product_name   text not null,
  unit_label     text not null,
  unit_factor    numeric not null default 1,
  qty            numeric not null check (qty > 0),
  unit_price_xof bigint not null,
  line_total_xof bigint not null
);
create index if not exists order_items_order_idx on order_items(order_id);

-- ============================================================
-- MOUVEMENTS DE STOCK — le grand livre
-- ============================================================

create table if not exists stock_movements (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  -- Signé, en unité de base : négatif = sortie, positif = entrée.
  qty_base    numeric not null check (qty_base <> 0),
  kind        text not null
              check (kind in ('vente', 'reception', 'ajustement', 'retour', 'casse', 'inventaire')),
  ref_table   text,        -- 'sales' | 'purchase_orders' | null
  ref_id      uuid,
  note        text,
  created_by  uuid references team_members(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists stock_mov_product_idx on stock_movements(product_id, created_at desc);
create index if not exists stock_mov_ref_idx on stock_movements(ref_table, ref_id);

-- ============================================================
-- DÉPENSES
-- ============================================================

create table if not exists expense_categories (
  id     uuid primary key default gen_random_uuid(),
  name   text unique not null,
  active boolean not null default true
);

create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references expense_categories(id) on delete set null,
  label       text not null,
  amount_xof  bigint not null check (amount_xof > 0),
  method      text not null default 'especes'
              check (method in ('especes', 'mobile_money', 'virement', 'cheque')),
  spent_on    date not null default current_date,
  note        text,
  created_by  uuid references team_members(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists expenses_spent_on_idx on expenses(spent_on desc);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- `updated_at` automatique.
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_products on products;
create trigger trg_touch_products before update on products
  for each row execute function touch_updated_at();

drop trigger if exists trg_touch_customers on customers;
create trigger trg_touch_customers before update on customers
  for each row execute function touch_updated_at();

drop trigger if exists trg_touch_orders on orders;
create trigger trg_touch_orders before update on orders
  for each row execute function touch_updated_at();

-- Le solde de stock suit le grand livre, jamais l'inverse.
create or replace function apply_stock_movement() returns trigger
language plpgsql as $$
begin
  update products
     set stock_qty = stock_qty + new.qty_base
   where id = new.product_id;
  return new;
end $$;

drop trigger if exists trg_apply_stock_movement on stock_movements;
create trigger trg_apply_stock_movement after insert on stock_movements
  for each row execute function apply_stock_movement();

-- Un mouvement ne se corrige pas, il se contre-passe : sinon le solde et
-- l'historique divergent silencieusement.
create or replace function guard_stock_movement() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Un mouvement de stock est immuable — saisis un mouvement inverse.';
  end if;
  -- Une suppression reste possible (erreur de saisie du jour) mais rembobine
  -- le solde pour qu'il reste exact.
  update products
     set stock_qty = stock_qty - old.qty_base
   where id = old.product_id;
  return old;
end $$;

drop trigger if exists trg_guard_stock_movement_upd on stock_movements;
create trigger trg_guard_stock_movement_upd before update on stock_movements
  for each row execute function guard_stock_movement();

drop trigger if exists trg_guard_stock_movement_del on stock_movements;
create trigger trg_guard_stock_movement_del before delete on stock_movements
  for each row execute function guard_stock_movement();

-- Chaque produit doit garder exactement une unité par défaut.
create or replace function ensure_single_default_unit() returns trigger
language plpgsql as $$
begin
  if new.is_default then
    update product_units
       set is_default = false
     where product_id = new.product_id
       and id <> new.id
       and is_default;
  end if;
  return new;
end $$;

drop trigger if exists trg_single_default_unit on product_units;
create trigger trg_single_default_unit after insert or update on product_units
  for each row execute function ensure_single_default_unit();

-- ============================================================
-- VUES
-- ============================================================

-- Alerte réappro : ce qu'il faut recommander aujourd'hui.
create or replace view v_low_stock as
select
  p.id,
  p.sku,
  p.name,
  p.base_unit,
  p.stock_qty,
  coalesce(p.min_stock, s.default_min_stock) as min_stock,
  p.low_stock_alerted_at,
  c.name as category_name
from products p
cross join shop_settings s
left join categories c on c.id = p.category_id
where p.active
  and p.stock_qty <= coalesce(p.min_stock, s.default_min_stock)
order by (p.stock_qty - coalesce(p.min_stock, s.default_min_stock)) asc;

-- Ardoises. Une vente comptant crée son règlement, donc la soustraction
-- fonctionne uniformément quel que soit le mode de paiement.
create or replace view v_customer_balances as
select
  c.id,
  c.name,
  c.phone,
  c.kind,
  c.credit_limit_xof,
  coalesce(v.total_achete, 0)  as total_achete_xof,
  coalesce(r.total_regle, 0)   as total_regle_xof,
  coalesce(v.total_achete, 0) - coalesce(r.total_regle, 0) as solde_xof,
  v.derniere_vente
from customers c
left join (
  select customer_id,
         sum(total_xof) as total_achete,
         max(sold_at)   as derniere_vente
  from sales
  where status <> 'annulee' and customer_id is not null
  group by customer_id
) v on v.customer_id = c.id
left join (
  select customer_id, sum(amount_xof) as total_regle
  from payments
  where customer_id is not null
  group by customer_id
) r on r.customer_id = c.id;

-- Compte d'exploitation mensuel : chiffre, coût des marchandises vendues,
-- marge brute, dépenses, résultat.
create or replace view v_monthly_pnl as
with ventes as (
  select date_trunc('month', s.sold_at)::date as mois,
         sum(s.total_xof)                     as chiffre_xof,
         sum(si.qty * si.unit_factor * si.cost_price_xof)::bigint as cout_xof
  from sales s
  join sale_items si on si.sale_id = s.id
  where s.status <> 'annulee'
  group by 1
),
sorties as (
  select date_trunc('month', spent_on)::date as mois,
         sum(amount_xof) as depenses_xof
  from expenses
  group by 1
)
select
  coalesce(v.mois, d.mois)                       as mois,
  coalesce(v.chiffre_xof, 0)                     as chiffre_xof,
  coalesce(v.cout_xof, 0)                        as cout_marchandises_xof,
  coalesce(v.chiffre_xof, 0) - coalesce(v.cout_xof, 0) as marge_brute_xof,
  coalesce(d.depenses_xof, 0)                    as depenses_xof,
  coalesce(v.chiffre_xof, 0) - coalesce(v.cout_xof, 0) - coalesce(d.depenses_xof, 0) as resultat_xof
from ventes v
full outer join sorties d on d.mois = v.mois
order by 1 desc;

-- Meilleures ventes sur 90 jours.
create or replace view v_top_products as
select
  si.product_id,
  si.product_name,
  sum(si.qty * si.unit_factor)          as qty_base_vendue,
  sum(si.line_total_xof)::bigint        as chiffre_xof,
  count(distinct s.id)                  as nb_ventes
from sale_items si
join sales s on s.id = si.sale_id
where s.status <> 'annulee'
  and s.sold_at >= now() - interval '90 days'
group by 1, 2
order by chiffre_xof desc;

-- ============================================================
-- RPC — opérations atomiques
-- ============================================================

-- Encaisser une vente. Écrit la vente, ses lignes, les mouvements de stock et
-- le règlement dans UNE transaction : une coupure réseau au mauvais moment ne
-- peut pas laisser un stock décrémenté sans vente, ou l'inverse.
--
-- Payload attendu :
-- {
--   "customer_id": null | uuid,
--   "discount_xof": 0,
--   "paid_xof": 15000,
--   "payment_method": "especes",
--   "channel": "comptoir",
--   "sold_by": null | uuid,
--   "note": null,
--   "items": [
--     { "product_id": uuid, "unit_label": "sac", "unit_factor": 1,
--       "qty": 3, "unit_price_xof": 5000 }
--   ]
-- }
create or replace function create_sale(p jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_sale_id     uuid;
  v_number      text;
  v_item        jsonb;
  v_subtotal    bigint := 0;
  v_total       bigint;
  v_discount    bigint := coalesce((p->>'discount_xof')::bigint, 0);
  v_paid        bigint := coalesce((p->>'paid_xof')::bigint, 0);
  v_customer    uuid   := nullif(p->>'customer_id', '')::uuid;
  v_method      text   := coalesce(nullif(p->>'payment_method', ''), 'especes');
  v_channel     text   := coalesce(nullif(p->>'channel', ''), 'comptoir');
  v_by          uuid   := nullif(p->>'sold_by', '')::uuid;
  v_status      text;
  v_allow_neg   boolean;
  v_prod        products%rowtype;
  v_qty         numeric;
  v_factor      numeric;
  v_price       bigint;
  v_line        bigint;
  v_qty_base    numeric;
begin
  if p->'items' is null or jsonb_array_length(p->'items') = 0 then
    raise exception 'Vente vide : aucune ligne.';
  end if;

  select allow_negative_stock into v_allow_neg from shop_settings where id = 1;

  insert into sales (customer_id, payment_method, channel, sold_by, note, paid_xof)
  values (v_customer, v_method, v_channel, v_by, nullif(p->>'note', ''), 0)
  returning id, number into v_sale_id, v_number;

  for v_item in select * from jsonb_array_elements(p->'items')
  loop
    select * into v_prod from products where id = (v_item->>'product_id')::uuid;
    if not found then
      raise exception 'Produit introuvable : %', v_item->>'product_id';
    end if;

    v_qty    := (v_item->>'qty')::numeric;
    v_factor := coalesce((v_item->>'unit_factor')::numeric, 1);
    v_price  := (v_item->>'unit_price_xof')::bigint;
    if v_qty <= 0 then
      raise exception 'Quantité invalide pour %', v_prod.name;
    end if;

    v_qty_base := v_qty * v_factor;
    v_line     := round(v_qty * v_price)::bigint;
    v_subtotal := v_subtotal + v_line;

    if not v_allow_neg and v_prod.stock_qty < v_qty_base then
      raise exception 'Stock insuffisant pour % : % % disponibles, % demandées.',
        v_prod.name, v_prod.stock_qty, v_prod.base_unit, v_qty_base;
    end if;

    insert into sale_items (
      sale_id, product_id, product_name, unit_label, unit_factor,
      qty, unit_price_xof, line_total_xof, cost_price_xof
    ) values (
      v_sale_id, v_prod.id, v_prod.name,
      coalesce(nullif(v_item->>'unit_label', ''), v_prod.base_unit), v_factor,
      v_qty, v_price, v_line, v_prod.cost_price_xof
    );

    insert into stock_movements (product_id, qty_base, kind, ref_table, ref_id, created_by, note)
    values (v_prod.id, -v_qty_base, 'vente', 'sales', v_sale_id, v_by, v_number);
  end loop;

  v_total := greatest(v_subtotal - v_discount, 0);
  if v_paid > v_total then
    v_paid := v_total;   -- le rendu de monnaie n'est pas un encaissement
  end if;

  if v_paid >= v_total then
    v_status := 'payee';
  elsif v_paid > 0 then
    v_status := 'partielle';
  else
    v_status := 'credit';
  end if;

  -- Une ardoise sans client identifié serait irrécouvrable.
  if v_status <> 'payee' and v_customer is null then
    raise exception 'Vente à crédit impossible sans client identifié.';
  end if;

  update sales
     set subtotal_xof = v_subtotal,
         discount_xof = v_discount,
         total_xof    = v_total,
         paid_xof     = v_paid,
         status       = v_status
   where id = v_sale_id;

  if v_paid > 0 then
    insert into payments (customer_id, sale_id, amount_xof, method, received_by, note)
    values (
      v_customer, v_sale_id, v_paid,
      case when v_method = 'credit' then 'especes' else v_method end,
      v_by, 'Encaissement ' || v_number
    );
  end if;

  return jsonb_build_object(
    'id', v_sale_id,
    'number', v_number,
    'subtotal_xof', v_subtotal,
    'total_xof', v_total,
    'paid_xof', v_paid,
    'status', v_status
  );
end $$;

-- Annuler une vente : contre-passe le stock et efface les règlements liés.
create or replace function cancel_sale(p_sale_id uuid, p_by uuid default null)
returns void
language plpgsql
as $$
declare
  v_it record;
  v_sale sales%rowtype;
begin
  select * into v_sale from sales where id = p_sale_id;
  if not found then
    raise exception 'Vente introuvable.';
  end if;
  if v_sale.status = 'annulee' then
    return;
  end if;

  for v_it in select * from sale_items where sale_id = p_sale_id and product_id is not null
  loop
    insert into stock_movements (product_id, qty_base, kind, ref_table, ref_id, created_by, note)
    values (v_it.product_id, v_it.qty * v_it.unit_factor, 'retour', 'sales', p_sale_id,
            p_by, 'Annulation ' || v_sale.number);
  end loop;

  delete from payments where sale_id = p_sale_id;
  update sales set status = 'annulee', paid_xof = 0 where id = p_sale_id;
end $$;

-- Convertir une commande en ligne en vente, au moment du retrait.
--
-- C'est ici que la marchandise sort réellement du stock : la commande n'était
-- qu'une intention. La fiche cliente est créée au passage si le numéro est
-- inconnu, pour que l'historique d'achat suive la personne et pas la commande.
create or replace function convert_order_to_sale(
  p_order_id uuid,
  p_paid_xof bigint default 0,
  p_method   text   default 'especes',
  p_by       uuid   default null
)
returns jsonb
language plpgsql
as $$
declare
  v_o        orders%rowtype;
  v_customer uuid;
  v_items    jsonb;
  v_res      jsonb;
begin
  select * into v_o from orders where id = p_order_id;
  if not found then
    raise exception 'Commande introuvable.';
  end if;
  if v_o.converted_sale_id is not null then
    raise exception 'La commande % a déjà été convertie.', v_o.number;
  end if;
  if v_o.status = 'annulee' then
    raise exception 'La commande % est annulée.', v_o.number;
  end if;

  v_customer := v_o.customer_id;
  if v_customer is null then
    select id into v_customer from customers where phone = v_o.customer_phone limit 1;
    if v_customer is null then
      insert into customers (name, phone, email)
      values (v_o.customer_name, v_o.customer_phone, v_o.customer_email)
      returning id into v_customer;
    end if;
  end if;

  select jsonb_agg(jsonb_build_object(
           'product_id',     oi.product_id,
           'unit_label',     oi.unit_label,
           'unit_factor',    oi.unit_factor,
           'qty',            oi.qty,
           'unit_price_xof', oi.unit_price_xof))
    into v_items
  from order_items oi
  where oi.order_id = p_order_id
    and oi.product_id is not null;

  if v_items is null then
    raise exception 'Commande sans ligne exploitable (article supprimé du catalogue).';
  end if;

  v_res := create_sale(jsonb_build_object(
    'customer_id',    v_customer,
    'discount_xof',   0,
    'paid_xof',       coalesce(p_paid_xof, 0),
    'payment_method', coalesce(p_method, 'especes'),
    'channel',        'en_ligne',
    'sold_by',        p_by,
    'note',           'Retrait commande ' || v_o.number,
    'items',          v_items
  ));

  update orders
     set status            = 'retiree',
         converted_sale_id = (v_res->>'id')::uuid,
         customer_id       = v_customer
   where id = p_order_id;

  return v_res;
end $$;

-- Convertir un devis accepté en vente, sans ressaisie.
create or replace function convert_quote_to_sale(
  p_quote_id uuid,
  p_paid_xof bigint default 0,
  p_method   text   default 'especes',
  p_by       uuid   default null
)
returns jsonb
language plpgsql
as $$
declare
  v_q     quotes%rowtype;
  v_items jsonb;
  v_res   jsonb;
begin
  select * into v_q from quotes where id = p_quote_id;
  if not found then
    raise exception 'Devis introuvable.';
  end if;
  if v_q.converted_sale_id is not null then
    raise exception 'Le devis % a déjà été converti.', v_q.number;
  end if;

  select jsonb_agg(jsonb_build_object(
           'product_id',     qi.product_id,
           'unit_label',     qi.unit_label,
           'unit_factor',    qi.unit_factor,
           'qty',            qi.qty,
           'unit_price_xof', qi.unit_price_xof))
    into v_items
  from quote_items qi
  where qi.quote_id = p_quote_id
    and qi.product_id is not null;

  if v_items is null then
    raise exception 'Devis sans ligne exploitable.';
  end if;

  v_res := create_sale(jsonb_build_object(
    'customer_id',    v_q.customer_id,
    'discount_xof',   v_q.discount_xof,
    'paid_xof',       coalesce(p_paid_xof, 0),
    'payment_method', coalesce(p_method, 'especes'),
    'channel',        'comptoir',
    'sold_by',        p_by,
    'note',           'Devis ' || v_q.number,
    'items',          v_items
  ));

  update quotes
     set status            = 'converti',
         converted_sale_id = (v_res->>'id')::uuid
   where id = p_quote_id;

  return v_res;
end $$;

-- Réceptionner un bon de commande : entrée en stock + mise à jour du prix
-- d'achat de référence.
create or replace function receive_purchase_order(p_po_id uuid, p_by uuid default null)
returns void
language plpgsql
as $$
declare
  v_it record;
  v_po purchase_orders%rowtype;
  v_reste numeric;
begin
  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'Bon de commande introuvable.';
  end if;
  if v_po.status = 'recu' then
    return;
  end if;

  for v_it in select * from purchase_order_items where purchase_order_id = p_po_id
  loop
    v_reste := v_it.qty_base - v_it.qty_received_base;
    if v_reste > 0 then
      insert into stock_movements (product_id, qty_base, kind, ref_table, ref_id, created_by, note)
      values (v_it.product_id, v_reste, 'reception', 'purchase_orders', p_po_id,
              p_by, 'Réception ' || v_po.number);

      update purchase_order_items
         set qty_received_base = qty_base
       where id = v_it.id;

      if v_it.unit_cost_xof > 0 then
        update products set cost_price_xof = v_it.unit_cost_xof where id = v_it.product_id;
      end if;
    end if;
  end loop;

  update purchase_orders
     set status = 'recu', received_at = now()
   where id = p_po_id;
end $$;

-- ============================================================
-- RLS — tout est fermé
--
-- Aucune policy pour `anon` : la clé publique exposée au navigateur n'a aucun
-- accès. Toutes les lectures/écritures passent par des routes serveur en
-- service_role (/api/admin/db pour l'admin, /api/catalog et /api/orders pour
-- la vitrine publique).
-- ============================================================

alter table shop_settings        enable row level security;
alter table team_members         enable row level security;
alter table push_subscriptions   enable row level security;
alter table categories           enable row level security;
alter table products             enable row level security;
alter table product_units        enable row level security;
alter table customers            enable row level security;
alter table suppliers            enable row level security;
alter table purchase_orders      enable row level security;
alter table purchase_order_items enable row level security;
alter table sales                enable row level security;
alter table sale_items           enable row level security;
alter table payments             enable row level security;
alter table quotes               enable row level security;
alter table quote_items          enable row level security;
alter table orders               enable row level security;
alter table order_items          enable row level security;
alter table stock_movements      enable row level security;
alter table expense_categories   enable row level security;
alter table expenses             enable row level security;

-- ============================================================
-- AMORCE — rayons et postes de dépense d'une quincaillerie type
-- ============================================================

-- Rayons calqués sur les quatre métiers de la charte : staff-plomberie,
-- décoration intérieure, fosse septique biodigesteur, matériaux décoratifs.
insert into categories (name, slug, position) values
  ('Staff & faux plafond',        'staff-faux-plafond', 1),
  ('Décoration intérieure',       'decoration',         2),
  ('Matériaux décoratifs',        'materiaux-decoratifs', 3),
  ('Plomberie',                   'plomberie',          4),
  ('Sanitaire',                   'sanitaire',          5),
  ('Fosse septique & biodigesteur','fosse-septique',    6),
  ('Électricité & luminaires',    'electricite',        7),
  ('Peinture & finition',         'peinture',           8),
  ('Ciment & agrégats',           'ciment-agregats',    9),
  ('Outillage & consommables',    'outillage',         10),
  -- Les prestations (pose, terrassement, main-d'œuvre) se vendent comme des
  -- articles à l'unité « prestation » : elles entrent alors dans les devis et
  -- le chiffre d'affaires sans traitement particulier.
  ('Prestations & main-d''œuvre', 'prestations',       11),
  ('Divers',                      'divers',            99)
on conflict (slug) do nothing;

insert into expense_categories (name) values
  ('Loyer'), ('Électricité & eau'), ('Transport & livraison'),
  ('Salaires'), ('Carburant'), ('Entretien & réparation'),
  ('Taxes & patente'), ('Fournitures bureau'), ('Divers')
on conflict (name) do nothing;
