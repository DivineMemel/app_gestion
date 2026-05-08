-- ============================================================
-- MIGRATION 002 — Multi-secteurs, catégories, comptabilité, journey CRM
-- À lancer APRÈS 001_init.sql
-- ============================================================

-- ============================================================
-- SECTEURS — verticales métier (coiffure, onglerie, soins, etc.)
-- L'utilisatrice peut en ajouter au fil de l'eau depuis l'admin.
-- ============================================================
create table if not exists sectors (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  icon text,                          -- nom d'icône Lucide (ex: 'scissors', 'sparkles')
  cover_image_url text,
  active boolean default true,
  display_order int default 0,
  created_at timestamptz default now()
);

create index if not exists sectors_active_order_idx
  on sectors(active, display_order);

-- Secteurs initiaux (peuvent être édités/désactivés)
insert into sectors (slug, name, description, icon, display_order) values
  ('coiffure', 'Coiffure', 'Coupes, couleurs, soins capillaires', 'scissors', 1),
  ('onglerie', 'Onglerie', 'Manucure, pédicure, pose et entretien', 'sparkles', 2)
on conflict (slug) do nothing;

-- ============================================================
-- CATÉGORIES — sous-divisions à l'intérieur d'un secteur
-- (ex: "Articles", "Entretiens", "Mèches", "Soins" pour Coiffure)
-- Le `kind` permet de séparer services et produits dans une même nomenclature.
-- ============================================================
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references sectors(id) on delete cascade,
  slug text not null,
  name text not null,
  kind text not null check (kind in ('service', 'product')),
  description text,
  display_order int default 0,
  active boolean default true,
  created_at timestamptz default now(),
  unique(sector_id, slug)
);

create index if not exists categories_sector_kind_idx
  on categories(sector_id, kind, display_order);

-- Catégories initiales pour Coiffure & Onglerie
do $$
declare
  v_coiffure uuid;
  v_onglerie uuid;
begin
  select id into v_coiffure from sectors where slug = 'coiffure';
  select id into v_onglerie from sectors where slug = 'onglerie';

  if v_coiffure is not null then
    insert into categories (sector_id, slug, name, kind, display_order) values
      (v_coiffure, 'entretiens', 'Entretiens', 'service', 1),
      (v_coiffure, 'couleur', 'Couleur', 'service', 2),
      (v_coiffure, 'tresses', 'Tresses & Braids', 'service', 3),
      (v_coiffure, 'soins', 'Soins', 'service', 4),
      (v_coiffure, 'evenements', 'Événements', 'service', 5),
      (v_coiffure, 'meches', 'Mèches & extensions', 'product', 10),
      (v_coiffure, 'articles', 'Articles capillaires', 'product', 11)
    on conflict (sector_id, slug) do nothing;
  end if;

  if v_onglerie is not null then
    insert into categories (sector_id, slug, name, kind, display_order) values
      (v_onglerie, 'manucure', 'Manucure', 'service', 1),
      (v_onglerie, 'pedicure', 'Pédicure', 'service', 2),
      (v_onglerie, 'pose', 'Pose ongles', 'service', 3),
      (v_onglerie, 'remplissage', 'Remplissage', 'service', 4),
      (v_onglerie, 'vernis', 'Vernis & accessoires', 'product', 10)
    on conflict (sector_id, slug) do nothing;
  end if;
end $$;

-- ============================================================
-- Lier services et products à un secteur + catégorie
-- ============================================================
alter table services
  add column if not exists sector_id uuid references sectors(id) on delete set null,
  add column if not exists category_id uuid references categories(id) on delete set null;

alter table products
  add column if not exists sector_id uuid references sectors(id) on delete set null,
  add column if not exists category_id uuid references categories(id) on delete set null;

-- Migrer les services existants vers le secteur "coiffure" par défaut
update services
  set sector_id = (select id from sectors where slug = 'coiffure')
  where sector_id is null;

create index if not exists services_sector_idx on services(sector_id, display_order);
create index if not exists products_sector_idx on products(sector_id, active);

-- ============================================================
-- COMPTABILITÉ — dépenses (les ventes existent déjà via `sales`)
-- ============================================================
create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  display_order int default 0,
  created_at timestamptz default now()
);

insert into expense_categories (slug, name, display_order) values
  ('loyer', 'Loyer & charges', 1),
  ('fournitures', 'Fournitures & matériel', 2),
  ('produits', 'Produits & stock', 3),
  ('salaires', 'Salaires & primes', 4),
  ('marketing', 'Marketing & publicité', 5),
  ('utilities', 'Eau, électricité, internet', 6),
  ('transport', 'Transport & déplacements', 7),
  ('autres', 'Autres dépenses', 99)
on conflict (slug) do nothing;

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references expense_categories(id) on delete set null,
  sector_id uuid references sectors(id) on delete set null, -- optionnel : imputer à un secteur
  amount_xof int not null,
  description text not null,
  payment_method text default 'cash'
    check (payment_method in ('cash', 'mobile_money', 'card', 'transfer', 'other')),
  receipt_url text,
  paid_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists expenses_paid_at_idx on expenses(paid_at desc);
create index if not exists expenses_category_idx on expenses(category_id);

-- Vue P&L mensuel (revenus - dépenses, par mois)
create or replace view monthly_pnl as
with revenue as (
  select
    date_trunc('month', paid_at) as month,
    sum(total_xof)::int as revenue_xof
  from sales
  group by 1
),
costs as (
  select
    date_trunc('month', paid_at) as month,
    sum(amount_xof)::int as expenses_xof
  from expenses
  group by 1
)
select
  coalesce(r.month, c.month) as month,
  coalesce(r.revenue_xof, 0) as revenue_xof,
  coalesce(c.expenses_xof, 0) as expenses_xof,
  coalesce(r.revenue_xof, 0) - coalesce(c.expenses_xof, 0) as profit_xof
from revenue r
full outer join costs c on r.month = c.month
order by 1 desc;

-- ============================================================
-- JOURNEY CRM — first mile / last mile
-- Track la source d'acquisition + chaque étape du parcours client
-- ============================================================
alter table clients
  add column if not exists acquisition_source text
    check (acquisition_source in (
      'instagram', 'facebook', 'tiktok', 'google',
      'walk_in', 'referral', 'whatsapp', 'site_web', 'autre'
    )),
  add column if not exists referrer_client_id uuid references clients(id) on delete set null,
  add column if not exists first_visit_at timestamptz,
  add column if not exists tags text[];

-- Trigger : initialiser first_visit_at lors de la 1re vente du client
create or replace function set_first_visit_on_sale()
returns trigger as $$
begin
  if new.client_id is not null then
    update clients
    set first_visit_at = coalesce(first_visit_at, new.paid_at)
    where id = new.client_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trig_set_first_visit on sales;
create trigger trig_set_first_visit
  after insert on sales
  for each row execute function set_first_visit_on_sale();

-- Table évènements de parcours (timeline visible côté admin)
create table if not exists client_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  type text not null
    check (type in (
      'created',          -- inscription du client
      'first_visit',      -- 1re visite
      'visit',            -- visite régulière
      'review',           -- avis laissé
      'follow_up',        -- relance manuelle
      'birthday_wish',    -- message d'anniversaire envoyé
      'lost'              -- considéré comme perdu (>6 mois sans visite)
    )),
  source text,             -- canal éventuel (whatsapp, sms, ...)
  notes text,
  created_at timestamptz default now()
);

create index if not exists client_events_client_idx on client_events(client_id, created_at desc);

-- ============================================================
-- Vue clients à risque (pas vues depuis 90+ jours mais pas "lost")
-- ============================================================
create or replace view clients_at_risk as
select
  c.id, c.name, c.phone, c.last_visit_at,
  extract(day from (now() - c.last_visit_at))::int as days_since_last_visit,
  c.total_spent_xof, c.visits_count
from clients c
where c.last_visit_at is not null
  and c.last_visit_at < now() - interval '90 days'
  and c.last_visit_at > now() - interval '180 days'
order by c.last_visit_at asc;

-- ============================================================
-- Realtime sur les nouvelles tables utiles côté admin
-- ============================================================
alter publication supabase_realtime add table sectors;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table client_events;

-- RLS désactivée (single-tenant, admin protégée par auth Supabase plus tard)
alter table sectors disable row level security;
alter table categories disable row level security;
alter table expense_categories disable row level security;
alter table expenses disable row level security;
alter table client_events disable row level security;
