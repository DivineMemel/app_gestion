-- ============================================================
-- Schema initial — Salon SaaS (single-tenant)
-- Tous les prix sont en FCFA (entier).
-- ============================================================

-- Activer les extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- Settings (singleton)
-- ============================================================
create table if not exists salon_settings (
  id int primary key default 1,
  name text not null default 'Salon',
  tagline text,
  logo_url text,
  primary_color text default '#c8932a',
  address text,
  phone text,
  email text,
  instagram text,
  facebook text,
  tiktok text,
  whatsapp text,
  -- ex: { "lundi": { "open": "09:00", "close": "19:00" }, "dimanche": null }
  opening_hours jsonb default '{}'::jsonb,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

insert into salon_settings (id) values (1) on conflict do nothing;

-- ============================================================
-- Services proposés
-- ============================================================
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  price_xof int not null default 0,
  duration_min int not null default 60,
  image_url text,
  category text,                    -- 'coiffure' | 'couleur' | 'tresses' | 'soins'…
  active boolean default true,
  display_order int default 0,
  created_at timestamptz default now()
);

create index if not exists services_active_order_idx
  on services(active, display_order);

-- Quelques services par défaut
insert into services (slug, name, description, price_xof, duration_min, category, display_order) values
  ('coupe', 'Coupe & Coiffure', 'Coupe sur mesure adaptée à la morphologie', 8000, 60, 'coiffure', 1),
  ('couleur', 'Couleur & Mèches', 'Coloration permanente, balayage, ombré', 25000, 120, 'couleur', 2),
  ('tresses', 'Tresses & Braids', 'Tresses africaines, box braids, twists', 18000, 180, 'tresses', 3),
  ('soin', 'Soins capillaires', 'Masques, kératine, soins profonds', 12000, 60, 'soins', 4),
  ('lissage', 'Lissage & Permanente', 'Lissage brésilien, permanente', 35000, 150, 'coiffure', 5),
  ('evenement', 'Forfait événement', 'Coiffure mariage, soirée, cérémonie', 45000, 120, 'evenement', 6)
on conflict (slug) do nothing;

-- ============================================================
-- Équipe (stylistes)
-- ============================================================
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,                        -- 'Coloriste senior', 'Tresseuse experte'…
  bio text,
  photo_url text,
  color text default '#c8932a',
  active boolean default true,
  display_order int default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- Clients
-- ============================================================
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,              -- format E.164 : '+225XXXXXXXX'
  email text,
  notes text,
  birthday date,
  total_spent_xof int default 0,
  visits_count int default 0,
  last_visit_at timestamptz,
  created_at timestamptz default now()
);

create unique index if not exists clients_phone_uniq on clients(phone);
create index if not exists clients_last_visit_idx on clients(last_visit_at desc);

-- ============================================================
-- Rendez-vous
-- ============================================================
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  service_id uuid references services(id) on delete restrict,
  staff_id uuid references staff(id) on delete set null,
  scheduled_at timestamptz not null,
  duration_min int not null default 60,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  source text not null default 'admin'
    check (source in ('public', 'admin')),
  notes text,
  price_xof int default 0,          -- snapshot du prix au moment du booking
  reminded_30min boolean default false,
  created_at timestamptz default now()
);

create index if not exists appointments_scheduled_idx
  on appointments(scheduled_at);
create index if not exists appointments_status_idx
  on appointments(status);
create index if not exists appointments_client_idx
  on appointments(client_id);

-- ============================================================
-- Stock — produits (capillaires + revente)
-- ============================================================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  brand text,
  category text,                    -- 'shampoing', 'coloration', 'styling'…
  price_xof int not null default 0, -- prix de vente
  cost_xof int default 0,           -- prix d'achat
  stock int not null default 0,
  low_stock_threshold int default 5,
  image_url text,
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists products_low_stock_idx
  on products(stock) where stock <= low_stock_threshold and active = true;

-- ============================================================
-- Ventes (POS)
-- ============================================================
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  staff_id uuid references staff(id) on delete set null,
  total_xof int not null,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'mobile_money', 'card', 'other')),
  paid_at timestamptz default now(),
  notes text
);

create index if not exists sales_paid_at_idx on sales(paid_at desc);

-- Ligne de vente : peut référencer un produit OU un service (ou rien = libre)
create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  name text not null,               -- snapshot du nom
  quantity int not null default 1,
  unit_price_xof int not null,
  subtotal_xof int not null,
  check ((product_id is null) or (service_id is null))
);

create index if not exists sale_items_sale_idx on sale_items(sale_id);

-- ============================================================
-- Trigger : mise à jour auto du stock quand on ajoute un produit dans une vente
-- ============================================================
create or replace function decrement_stock_on_sale()
returns trigger as $$
begin
  if new.product_id is not null then
    update products
    set stock = stock - new.quantity
    where id = new.product_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trig_decrement_stock on sale_items;
create trigger trig_decrement_stock
  after insert on sale_items
  for each row execute function decrement_stock_on_sale();

-- ============================================================
-- Trigger : mise à jour auto des stats clients quand une vente est payée
-- ============================================================
create or replace function update_client_stats_on_sale()
returns trigger as $$
begin
  if new.client_id is not null then
    update clients
    set total_spent_xof = total_spent_xof + new.total_xof,
        visits_count = visits_count + 1,
        last_visit_at = new.paid_at
    where id = new.client_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trig_update_client_stats on sales;
create trigger trig_update_client_stats
  after insert on sales
  for each row execute function update_client_stats_on_sale();

-- ============================================================
-- Realtime
-- ============================================================
alter publication supabase_realtime add table appointments;
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table salon_settings;

-- ============================================================
-- RLS — phase 1 : tout désactivé (single-tenant, pas d'auth public)
-- L'admin utilise auth Supabase + service_role pour le booking public.
-- À durcir quand le site sera public en prod.
-- ============================================================
alter table salon_settings disable row level security;
alter table services disable row level security;
alter table staff disable row level security;
alter table clients disable row level security;
alter table appointments disable row level security;
alter table products disable row level security;
alter table sales disable row level security;
alter table sale_items disable row level security;
