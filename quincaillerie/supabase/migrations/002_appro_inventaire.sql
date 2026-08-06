-- ============================================================
-- NADAL SERVICES — Approvisionnement & inventaire
-- À lancer APRÈS 001_init.sql, dans le SQL Editor Supabase.
--
-- Deux manques comblés :
--
--  1. ARRIVAGE. Le bon de commande (001) part de la commande et finit à la
--     réception. Mais de la marchandise arrive aussi sans commande préalable —
--     un achat au marché, un dépannage chez un confrère, un retour de chantier.
--     L'arrivage permet de faire entrer du stock sans rien avoir commandé.
--
--  2. SAISIE ≠ VALORISATION. Celui qui réceptionne compte des sacs ; il ne
--     connaît pas toujours le prix payé. Celui qui connaît le prix n'est pas au
--     dépôt. On sépare donc les deux gestes, sans les rendre obligatoirement
--     successifs : la même personne peut enchaîner les deux.
--
--     Le stock entre dès la SAISIE — la marchandise est physiquement là, la
--     nier jusqu'à ce qu'on connaisse son prix rendrait le stock faux. Le coût,
--     lui, n'est mis à jour qu'à la VALORISATION.
--
--  3. INVENTAIRE. 001 ne permettait qu'une correction article par article. Ici
--     c'est une campagne : on fige la liste, on compte, on regarde les écarts,
--     on valide — et chaque écart devient un mouvement dans le grand livre.
-- ============================================================

-- ============================================================
-- ARRIVAGES
-- ============================================================

create sequence if not exists seq_supply_number;

create table if not exists supply_entries (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null
              default 'AR-' || to_char(now(), 'YYYY') || '-'
                      || lpad(nextval('seq_supply_number')::text, 4, '0'),
  supplier_id uuid references suppliers(id) on delete set null,
  -- Un arrivage peut solder un bon de commande, ou n'en avoir aucun.
  purchase_order_id uuid references purchase_orders(id) on delete set null,

  --   brouillon → lignes en cours de saisie, rien n'est entré en stock
  --   saisi     → quantités validées, STOCK ENTRÉ, coûts encore inconnus
  --   valorise  → coûts renseignés, prix d'achat de référence mis à jour
  --   annule    → arrivage annulé (contre-passé s'il était déjà saisi)
  status      text not null default 'brouillon'
              check (status in ('brouillon', 'saisi', 'valorise', 'annule')),

  note        text,
  received_at timestamptz,
  valued_at   timestamptz,
  created_by  uuid references team_members(id) on delete set null,
  valued_by   uuid references team_members(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists supply_entries_status_idx on supply_entries(status);
create index if not exists supply_entries_created_idx on supply_entries(created_at desc);

create table if not exists supply_entry_items (
  id              uuid primary key default gen_random_uuid(),
  supply_entry_id uuid not null references supply_entries(id) on delete cascade,
  product_id      uuid not null references products(id) on delete restrict,
  -- Quantité en unité de base du produit.
  qty_base        numeric not null check (qty_base > 0),
  -- Null tant que l'arrivage n'est pas valorisé : c'est justement l'information
  -- que le magasinier n'a pas.
  unit_cost_xof   bigint check (unit_cost_xof is null or unit_cost_xof >= 0),
  note            text
);
create index if not exists supply_items_entry_idx on supply_entry_items(supply_entry_id);

-- ============================================================
-- INVENTAIRE
-- ============================================================

create sequence if not exists seq_count_number;

create table if not exists stock_counts (
  id           uuid primary key default gen_random_uuid(),
  number       text unique not null
               default 'INV-' || to_char(now(), 'YYYY') || '-'
                       || lpad(nextval('seq_count_number')::text, 3, '0'),
  status       text not null default 'en_cours'
               check (status in ('en_cours', 'valide', 'annule')),
  -- Restreindre la campagne à un rayon : compter toute la boutique d'un coup
  -- n'est pas réaliste, on tourne rayon par rayon.
  category_id  uuid references categories(id) on delete set null,
  note         text,
  started_by   uuid references team_members(id) on delete set null,
  validated_by uuid references team_members(id) on delete set null,
  validated_at timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists stock_count_items (
  id             uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references stock_counts(id) on delete cascade,
  product_id     uuid not null references products(id) on delete cascade,
  -- Stock théorique figé à l'ouverture de la campagne : sert à mesurer l'écart
  -- constaté, indépendamment des ventes passées depuis.
  qty_theorique  numeric not null default 0,
  -- Null tant que l'article n'a pas été compté — un article non compté n'est
  -- PAS un article à zéro, et ne doit générer aucun mouvement.
  qty_comptee    numeric,
  note           text,
  unique (stock_count_id, product_id)
);
create index if not exists count_items_count_idx on stock_count_items(stock_count_id);

-- ============================================================
-- RPC
-- ============================================================

-- Valider la saisie : la marchandise entre en stock. Les coûts restent
-- inconnus, la valorisation viendra après (ou jamais, si personne ne l'a).
create or replace function post_supply_entry(p_entry_id uuid, p_by uuid default null)
returns void
language plpgsql
as $$
declare
  v_e supply_entries%rowtype;
  v_it record;
begin
  select * into v_e from supply_entries where id = p_entry_id;
  if not found then
    raise exception 'Arrivage introuvable.';
  end if;
  if v_e.status <> 'brouillon' then
    raise exception 'L''arrivage % est déjà saisi.', v_e.number;
  end if;
  if not exists (select 1 from supply_entry_items where supply_entry_id = p_entry_id) then
    raise exception 'Arrivage vide : aucune ligne à faire entrer.';
  end if;

  for v_it in select * from supply_entry_items where supply_entry_id = p_entry_id
  loop
    insert into stock_movements (product_id, qty_base, kind, ref_table, ref_id, created_by, note)
    values (v_it.product_id, v_it.qty_base, 'reception', 'supply_entries', p_entry_id,
            p_by, 'Arrivage ' || v_e.number);
  end loop;

  update supply_entries
     set status = 'saisi', received_at = now(), created_by = coalesce(created_by, p_by)
   where id = p_entry_id;
end $$;

-- Valoriser : renseigner ce que la marchandise a coûté.
--
-- Le prix d'achat de référence du produit est mis à jour pour la SUITE. Les
-- ventes déjà passées gardent le coût qu'elles ont figé — réécrire l'historique
-- fausserait les marges des mois clos.
create or replace function value_supply_entry(p_entry_id uuid, p_by uuid default null)
returns void
language plpgsql
as $$
declare
  v_e supply_entries%rowtype;
  v_it record;
begin
  select * into v_e from supply_entries where id = p_entry_id;
  if not found then
    raise exception 'Arrivage introuvable.';
  end if;
  if v_e.status = 'brouillon' then
    raise exception 'Valide d''abord la saisie de l''arrivage %.', v_e.number;
  end if;
  if v_e.status = 'annule' then
    raise exception 'L''arrivage % est annulé.', v_e.number;
  end if;
  if exists (
    select 1 from supply_entry_items
    where supply_entry_id = p_entry_id and unit_cost_xof is null
  ) then
    raise exception 'Toutes les lignes doivent avoir un prix d''achat.';
  end if;

  for v_it in select * from supply_entry_items where supply_entry_id = p_entry_id
  loop
    if v_it.unit_cost_xof > 0 then
      update products set cost_price_xof = v_it.unit_cost_xof where id = v_it.product_id;
    end if;
  end loop;

  update supply_entries
     set status = 'valorise', valued_at = now(), valued_by = p_by
   where id = p_entry_id;
end $$;

-- Annuler un arrivage déjà saisi : contre-passe la marchandise entrée.
create or replace function cancel_supply_entry(p_entry_id uuid, p_by uuid default null)
returns void
language plpgsql
as $$
declare
  v_e supply_entries%rowtype;
  v_it record;
begin
  select * into v_e from supply_entries where id = p_entry_id;
  if not found then
    raise exception 'Arrivage introuvable.';
  end if;
  if v_e.status = 'annule' then
    return;
  end if;

  if v_e.status in ('saisi', 'valorise') then
    for v_it in select * from supply_entry_items where supply_entry_id = p_entry_id
    loop
      insert into stock_movements (product_id, qty_base, kind, ref_table, ref_id, created_by, note)
      values (v_it.product_id, -v_it.qty_base, 'ajustement', 'supply_entries', p_entry_id,
              p_by, 'Annulation arrivage ' || v_e.number);
    end loop;
  end if;

  update supply_entries set status = 'annule' where id = p_entry_id;
end $$;

-- Ouvrir une campagne d'inventaire : fige la liste des articles à compter.
create or replace function open_stock_count(
  p_category_id uuid default null,
  p_by          uuid default null,
  p_note        text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_id  uuid;
  v_num text;
begin
  if exists (select 1 from stock_counts where status = 'en_cours') then
    raise exception 'Une campagne d''inventaire est déjà en cours.';
  end if;

  insert into stock_counts (category_id, started_by, note)
  values (p_category_id, p_by, p_note)
  returning id, number into v_id, v_num;

  insert into stock_count_items (stock_count_id, product_id, qty_theorique)
  select v_id, p.id, p.stock_qty
  from products p
  where p.active
    and (p_category_id is null or p.category_id = p_category_id);

  return jsonb_build_object('id', v_id, 'number', v_num);
end $$;

-- Valider la campagne : chaque écart devient un mouvement.
--
-- L'ajustement est calculé sur le stock AU MOMENT DE LA VALIDATION, pas sur le
-- théorique figé à l'ouverture : après validation, le stock vaut donc
-- exactement ce qui a été compté. C'est ce qu'attend quiconque vient de
-- compter ses sacs — au prix près qu'une vente saisie pendant le comptage sera
-- absorbée par l'écart. On inventorie boutique fermée.
create or replace function validate_stock_count(p_count_id uuid, p_by uuid default null)
returns jsonb
language plpgsql
as $$
declare
  v_c      stock_counts%rowtype;
  v_it     record;
  v_ecart  numeric;
  v_nb     int := 0;
begin
  select * into v_c from stock_counts where id = p_count_id;
  if not found then
    raise exception 'Campagne introuvable.';
  end if;
  if v_c.status <> 'en_cours' then
    raise exception 'La campagne % est déjà close.', v_c.number;
  end if;

  for v_it in
    select ci.*, p.stock_qty as stock_actuel
    from stock_count_items ci
    join products p on p.id = ci.product_id
    where ci.stock_count_id = p_count_id
      and ci.qty_comptee is not null
  loop
    v_ecart := v_it.qty_comptee - v_it.stock_actuel;
    if v_ecart <> 0 then
      insert into stock_movements (product_id, qty_base, kind, ref_table, ref_id, created_by, note)
      values (v_it.product_id, v_ecart, 'inventaire', 'stock_counts', p_count_id,
              p_by, 'Inventaire ' || v_c.number);
      v_nb := v_nb + 1;
    end if;
  end loop;

  update stock_counts
     set status = 'valide', validated_at = now(), validated_by = p_by
   where id = p_count_id;

  return jsonb_build_object('number', v_c.number, 'ajustements', v_nb);
end $$;

-- ============================================================
-- VUES
-- ============================================================

-- Ce qui est entré en stock sans qu'on sache encore ce qu'il a coûté.
-- C'est la file d'attente de celui qui valorise.
create or replace view v_appro_a_valoriser as
select
  e.id,
  e.number,
  e.received_at,
  s.name as supplier_name,
  count(i.id)      as nb_lignes,
  sum(i.qty_base)  as qty_totale
from supply_entries e
left join suppliers s on s.id = e.supplier_id
join supply_entry_items i on i.supply_entry_id = e.id
where e.status = 'saisi'
group by e.id, e.number, e.received_at, s.name
order by e.received_at asc;

-- ============================================================
-- RLS — mêmes règles que le reste : tout fermé pour anon.
-- ============================================================

alter table supply_entries     enable row level security;
alter table supply_entry_items enable row level security;
alter table stock_counts       enable row level security;
alter table stock_count_items  enable row level security;
