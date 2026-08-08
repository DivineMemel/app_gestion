-- ============================================================
-- NADAL SERVICES — Prestations (articles sans stock)
-- À lancer APRÈS 001 → 004.
--
-- Le contrôle de stock s'appliquait à TOUT article, sans distinction. Or une
-- pose de faux plafond au m², un forfait d'installation de fosse ou une
-- journée de main-d'œuvre n'ont pas de stock par nature : leur `stock_qty`
-- vaut 0, et la vente était donc refusée avec « Stock insuffisant ».
--
-- Conséquence directe : le devis fosse septique — matériaux + pose — ne
-- pouvait pas être converti en vente, alors que c'est le cœur du métier.
--
-- Une prestation :
--   · ne contrôle pas le stock à la vente ;
--   · ne génère aucun mouvement de stock ;
--   · n'entre ni dans l'inventaire ni dans les alertes de réappro.
-- Elle reste un article normal partout ailleurs : prix, unités de vente,
-- chiffre d'affaires, marge, devis, factures.
-- ============================================================

alter table products
  add column if not exists is_service boolean not null default false;

comment on column products.is_service is
  'Prestation : pas de stock, pas de mouvement, exclue de l''inventaire.';

-- ---------- create_sale : ignorer le stock pour les prestations ----------
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

    -- Une prestation n'a pas de stock : ni contrôle, ni mouvement.
    if not v_prod.is_service then
      if not v_allow_neg and v_prod.stock_qty < v_qty_base then
        raise exception 'Stock insuffisant pour % : % % disponibles, % demandées.',
          v_prod.name, v_prod.stock_qty, v_prod.base_unit, v_qty_base;
      end if;
    end if;

    insert into sale_items (
      sale_id, product_id, product_name, unit_label, unit_factor,
      qty, unit_price_xof, line_total_xof, cost_price_xof
    ) values (
      v_sale_id, v_prod.id, v_prod.name,
      coalesce(nullif(v_item->>'unit_label', ''), v_prod.base_unit), v_factor,
      v_qty, v_price, v_line, v_prod.cost_price_xof
    );

    if not v_prod.is_service then
      insert into stock_movements (product_id, qty_base, kind, ref_table, ref_id, created_by, note)
      values (v_prod.id, -v_qty_base, 'vente', 'sales', v_sale_id, v_by, v_number);
    end if;
  end loop;

  v_total := greatest(v_subtotal - v_discount, 0);
  if v_paid > v_total then
    v_paid := v_total;
  end if;

  if v_paid >= v_total then
    v_status := 'payee';
  elsif v_paid > 0 then
    v_status := 'partielle';
  else
    v_status := 'credit';
  end if;

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

-- ---------- cancel_sale : ne pas contre-passer une prestation ------------
create or replace function cancel_sale(p_sale_id uuid, p_by uuid default null)
returns void
language plpgsql
as $$
declare
  v_it   record;
  v_sale sales%rowtype;
begin
  select * into v_sale from sales where id = p_sale_id;
  if not found then
    raise exception 'Vente introuvable.';
  end if;
  if v_sale.status = 'annulee' then
    return;
  end if;

  -- Jointure sur products : une prestation n'a rien à rendre au stock.
  for v_it in
    select si.*
    from sale_items si
    join products p on p.id = si.product_id
    where si.sale_id = p_sale_id
      and not p.is_service
  loop
    insert into stock_movements (product_id, qty_base, kind, ref_table, ref_id, created_by, note)
    values (v_it.product_id, v_it.qty * v_it.unit_factor, 'retour', 'sales', p_sale_id,
            p_by, 'Annulation ' || v_sale.number);
  end loop;

  delete from payments where sale_id = p_sale_id;
  update sales set status = 'annulee', paid_xof = 0 where id = p_sale_id;
end $$;

-- ---------- inventaire : ne pas compter ce qui n'a pas de stock ---------
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
    and not p.is_service
    and (p_category_id is null or p.category_id = p_category_id);

  return jsonb_build_object('id', v_id, 'number', v_num);
end $$;

-- ---------- alertes de réappro : idem ------------------------------------
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
  and not p.is_service
  and p.stock_qty <= coalesce(p.min_stock, s.default_min_stock)
order by (p.stock_qty - coalesce(p.min_stock, s.default_min_stock)) asc;

-- ---------- Les articles du rayon Prestations en sont ------------------
update products
   set is_service = true
 where category_id = (select id from categories where slug = 'prestations');
