-- ============================================================
-- NADAL SERVICES — Caisse hors ligne
-- À lancer APRÈS 001 → 007.
--
-- La caisse encaissait en ligne uniquement : réseau coupé, boutique bloquée.
-- Elle peut désormais vendre hors ligne et rejouer ses ventes au retour du
-- réseau. Trois choses doivent changer en base pour que ce soit sûr.
--
--  1. IDEMPOTENCE. Une requête partie sans réponse claire doit pouvoir être
--     rejouée sans encaisser deux fois. La caisse génère donc une référence
--     unique AVANT d'envoyer ; `create_sale` renvoie la vente existante si
--     elle la reconnaît, au lieu d'en créer une seconde.
--
--  2. HORODATAGE RÉEL. `sold_at` valait `now()`, c'est-à-dire l'instant de
--     l'ÉCRITURE. Une vente faite mardi 16 h et synchronisée mercredi matin
--     serait tombée dans la recette de mercredi. La caisse transmet donc
--     l'heure du comptoir.
--
--  3. VENTE HORS LIGNE ASSUMÉE. Hors ligne, la caisse ne connaît pas le stock
--     réel : deux postes peuvent vendre le dernier sac. On accepte — la
--     marchandise est physiquement sortie, la nier rendrait le stock faux —
--     et le stock passe en négatif, ce qui est précisément le signal. En
--     revanche le CRÉDIT est refusé hors ligne : le plafond d'ardoise ne peut
--     pas être vérifié, et une ardoise refusée à la synchronisation arriverait
--     trop tard, la marchandise étant déjà partie.
--
-- Ce qui ne change PAS : la numérotation. `V-2026-00042` reste attribué par la
-- séquence Postgres au moment de l'écriture. `client_ref` est une clé
-- technique, invisible du client, qui ne remplace aucun numéro existant.
-- ============================================================

-- ---------- 1. Référence d'idempotence -----------------------------------

alter table sales
  add column if not exists client_ref uuid;

-- Deux ventes ne peuvent pas partager la même référence : c'est la contrainte
-- d'unicité qui fait le travail, pas la bonne volonté du client.
create unique index if not exists sales_client_ref_idx
  on sales (client_ref) where client_ref is not null;

comment on column sales.client_ref is
  'Référence générée par le poste de caisse. Rend create_sale idempotente : rejouer la même vente ne l''encaisse pas deux fois.';

-- ---------- 2. Traçabilité de la saisie hors ligne ------------------------

alter table sales
  add column if not exists captured_offline boolean not null default false;

alter table sales
  add column if not exists synced_at timestamptz;

comment on column sales.captured_offline is
  'Vente saisie sans réseau puis rejouée. Son stock n''a pas pu être contrôlé au moment de la vente.';
comment on column sales.synced_at is
  'Instant où la vente hors ligne a été reçue par le serveur. L''écart avec sold_at mesure la durée de la coupure.';

create index if not exists sales_offline_idx
  on sales (captured_offline, sold_at desc) where captured_offline;

-- ---------- 3. create_sale — version 4 ------------------------------------
--   v1 (001) : le socle.
--   v2 (005) : les prestations ne contrôlent pas le stock.
--   v3 (007) : le plafond d'ardoise est appliqué.
--   v4 (008) : idempotence, horodatage transmis, saisie hors ligne.
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
  v_ref         uuid   := nullif(p->>'client_ref', '')::uuid;
  v_offline     boolean := coalesce((p->>'captured_offline')::boolean, false);
  v_sold_at     timestamptz;
  v_status      text;
  v_allow_neg   boolean;
  v_enforce     boolean;
  v_prod        products%rowtype;
  v_qty         numeric;
  v_factor      numeric;
  v_price       bigint;
  v_line        bigint;
  v_qty_base    numeric;
  v_limite      bigint;
  v_nom_client  text;
  v_encours     bigint;
  v_deja        sales%rowtype;
begin
  if p->'items' is null or jsonb_array_length(p->'items') = 0 then
    raise exception 'Vente vide : aucune ligne.';
  end if;

  -- Idempotence : si cette référence est déjà encaissée, on renvoie la vente
  -- telle quelle. C'est ce qui rend un rejeu inoffensif — et un rejeu se
  -- produira, c'est le principe même d'une file d'attente hors ligne.
  if v_ref is not null then
    select * into v_deja from sales where client_ref = v_ref;
    if found then
      return jsonb_build_object(
        'id', v_deja.id,
        'number', v_deja.number,
        'subtotal_xof', v_deja.subtotal_xof,
        'total_xof', v_deja.total_xof,
        'paid_xof', v_deja.paid_xof,
        'status', v_deja.status,
        'deja_enregistree', true
      );
    end if;
  end if;

  -- L'heure du comptoir, pas celle de l'écriture. Bornée : une horloge de
  -- tablette déréglée ne doit pas pouvoir dater une vente de l'an prochain ni
  -- la rétrodater dans un mois déjà clôturé.
  v_sold_at := coalesce((p->>'sold_at')::timestamptz, now());
  if v_sold_at > now() + interval '1 hour' then v_sold_at := now(); end if;
  if v_sold_at < now() - interval '30 days' then v_sold_at := now(); end if;

  if v_discount < 0 then
    raise exception 'Remise négative impossible.';
  end if;
  if v_paid < 0 then
    raise exception 'Encaissement négatif impossible.';
  end if;

  select allow_negative_stock, enforce_credit_limit
    into v_allow_neg, v_enforce
    from shop_settings where id = 1;

  -- Hors ligne, le stock affiché au comptoir datait de la dernière
  -- synchronisation : le contrôler à la réception reviendrait à refuser une
  -- vente déjà faite, marchandise sortie. On laisse passer, le stock devient
  -- négatif, et c'est cet écart qui alerte.
  if v_offline then v_allow_neg := true; end if;

  insert into sales (customer_id, payment_method, channel, sold_by, note, paid_xof,
                     client_ref, captured_offline, sold_at,
                     synced_at)
  values (v_customer, v_method, v_channel, v_by, nullif(p->>'note', ''), 0,
          v_ref, v_offline, v_sold_at,
          case when v_offline then now() else null end)
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
    if v_factor <= 0 then
      raise exception 'Conditionnement invalide pour %', v_prod.name;
    end if;
    if v_price < 0 then
      raise exception 'Prix négatif pour %', v_prod.name;
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
    v_paid := v_total;   -- le rendu de monnaie n'est pas un encaissement
  end if;

  if v_paid >= v_total then
    v_status := 'payee';
  elsif v_paid > 0 then
    v_status := 'partielle';
  else
    v_status := 'credit';
  end if;

  -- Pas de crédit hors ligne. Le plafond d'ardoise se calcule sur l'encours
  -- réel du client, que la caisse déconnectée ne connaît pas ; refuser à la
  -- synchronisation arriverait après le départ de la marchandise. La caisse
  -- interdit donc déjà le crédit hors ligne côté écran — cette barrière est là
  -- pour le cas où une file d'attente trafiquée dirait le contraire.
  if v_offline and v_status <> 'payee' then
    raise exception 'Vente à crédit impossible hors ligne : le plafond d''ardoise ne peut pas être vérifié.';
  end if;

  -- Une ardoise sans client identifié serait irrécouvrable.
  if v_status <> 'payee' and v_customer is null then
    raise exception 'Vente à crédit impossible sans client identifié.';
  end if;

  -- Plafond d'ardoise, sur l'ENCOURS TOTAL après cette vente.
  if v_status <> 'payee' and v_enforce then
    select credit_limit_xof, name into v_limite, v_nom_client
      from customers where id = v_customer;
    if not found then
      raise exception 'Client introuvable.';
    end if;

    select coalesce((select sum(total_xof) from sales
                      where customer_id = v_customer and status <> 'annulee'), 0)
         - coalesce((select sum(amount_xof) from payments
                      where customer_id = v_customer), 0)
      into v_encours;
    v_encours := v_encours + (v_total - v_paid);

    if v_encours > v_limite then
      raise exception
        'Plafond d''ardoise dépassé pour % : encours % F pour un plafond de % F. Encaisse davantage ou relève le plafond.',
        v_nom_client, v_encours, v_limite;
    end if;
  end if;

  update sales
     set subtotal_xof = v_subtotal,
         discount_xof = v_discount,
         total_xof    = v_total,
         paid_xof     = v_paid,
         status       = v_status
   where id = v_sale_id;

  if v_paid > 0 then
    insert into payments (customer_id, sale_id, amount_xof, method, received_by, note, paid_at)
    values (
      v_customer, v_sale_id, v_paid,
      case when v_method = 'credit' then 'especes' else v_method end,
      v_by, 'Encaissement ' || v_number, v_sold_at
    );
  end if;

  return jsonb_build_object(
    'id', v_sale_id,
    'number', v_number,
    'subtotal_xof', v_subtotal,
    'total_xof', v_total,
    'paid_xof', v_paid,
    'status', v_status,
    'deja_enregistree', false
  );
end $$;

-- ---------- 4. Ce qui est parti en négatif --------------------------------

-- Ce que la coupure a coûté en exactitude : les articles dont le stock est
-- passé sous zéro. C'est la file d'attente de celui qui régularise après une
-- panne de réseau.
create or replace view v_stock_negatif as
select
  p.id,
  p.sku,
  p.name,
  p.base_unit,
  p.stock_qty,
  c.name as category_name,
  (select max(s.sold_at)
     from sale_items si
     join sales s on s.id = si.sale_id
    where si.product_id = p.id and s.captured_offline) as derniere_vente_hors_ligne
from products p
left join categories c on c.id = p.category_id
where p.active
  and not p.is_service
  and p.stock_qty < 0
order by p.stock_qty asc;

alter view v_stock_negatif set (security_invoker = true);

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on v_stock_negatif from %I', r);
    end if;
  end loop;
end $$;

-- ============================================================
insert into schema_migrations (version) values ('008_caisse_hors_ligne')
on conflict (version) do nothing;
