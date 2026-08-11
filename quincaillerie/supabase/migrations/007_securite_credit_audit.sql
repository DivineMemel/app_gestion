-- ============================================================
-- NADAL SERVICES — Sécurité, plafond d'ardoise, journal d'audit
-- À lancer APRÈS 001 → 006.
--
-- Cette migration corrige quatre choses :
--
--  1. Les VUES appartenaient à `postgres`, qui a l'attribut BYPASSRLS chez
--     Supabase. Une vue est exécutée avec les droits de son propriétaire tant
--     qu'on ne lui pose pas `security_invoker` : le P&L, les ardoises et les
--     marges étaient donc lisibles avec la clé publique, malgré « aucune
--     policy pour anon ». On repasse toutes les vues en security_invoker et on
--     retire les droits d'anon/authenticated sur tout le schéma.
--
--  2. Le PLAFOND D'ARDOISE (`customers.credit_limit_xof`) existait en base et
--     s'affichait à l'écran, mais aucune ligne ne le vérifiait. Il est
--     désormais appliqué dans `create_sale`, donc aussi dans les conversions
--     devis→vente et commande→vente qui délèguent à cette fonction.
--
--  3. Un JOURNAL D'AUDIT : `stock_movements` tracait les mouvements de
--     marchandise, mais rien ne disait qui avait changé un prix, désactivé un
--     article ou modifié une fiche client.
--
--  4. Un COMPTEUR D'ÉCHECS DE CONNEXION, pour que /api/admin/login puisse
--     freiner une attaque par force brute autrement qu'avec un délai fixe.
--
-- Et elle installe `schema_migrations` : jusqu'ici rien ne permettait de
-- savoir ce qui avait réellement été appliqué à une base.
-- ============================================================

-- ============================================================
-- 0. Registre des migrations appliquées
-- ============================================================

create table if not exists schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

-- Les six premières ont été passées à la main avant l'existence de ce
-- registre : on les enregistre rétroactivement pour partir d'une base saine.
insert into schema_migrations (version) values
  ('001_init'),
  ('002_appro_inventaire'),
  ('003_storage'),
  ('004_catalogue_initial'),
  ('005_prestations'),
  ('006_slugs_produits')
on conflict (version) do nothing;

-- ============================================================
-- 1. Vues : security_invoker + retrait des droits publics
-- ============================================================

-- `security_invoker` fait exécuter la vue avec les droits de l'appelant, donc
-- sous RLS. Sans ça, une vue possédée par `postgres` (BYPASSRLS) rend visible
-- ce que la RLS protège juste en dessous.
alter view v_low_stock          set (security_invoker = true);
alter view v_customer_balances  set (security_invoker = true);
alter view v_monthly_pnl        set (security_invoker = true);
alter view v_top_products       set (security_invoker = true);
alter view v_appro_a_valoriser  set (security_invoker = true);

-- Ceinture et bretelles : même sous security_invoker, une vue reste inutile à
-- qui n'a aucun droit dessus. Supabase accorde par défaut aux rôles anon et
-- authenticated les privilèges sur les objets créés dans `public` ; on les
-- retire. Tout passe par `service_role` depuis les routes serveur.
--
-- Le retrait est conditionné à l'existence des rôles : ils sont propres à
-- Supabase, et sans cette garde la migration échoue sur un Postgres nu — donc
-- sur toute base de test locale, là précisément où on veut pouvoir la rejouer.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables    in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);

      -- Et pour les objets créés plus tard (migrations suivantes), sinon le
      -- trou se rouvre tout seul à la prochaine table.
      execute format(
        'alter default privileges in schema public revoke all on tables    from %I', r);
      execute format(
        'alter default privileges in schema public revoke all on sequences from %I', r);
      execute format(
        'alter default privileges in schema public revoke all on functions from %I', r);
    else
      raise notice 'rôle % absent — retrait de privilèges ignoré (base hors Supabase)', r;
    end if;
  end loop;
end $$;

-- ============================================================
-- 2. Plafond d'ardoise
-- ============================================================

-- Le plafond est une règle de gestion, pas une loi physique : un patron doit
-- pouvoir la lever pour un chantier exceptionnel sans qu'on touche au code.
alter table shop_settings
  add column if not exists enforce_credit_limit boolean not null default true;

comment on column shop_settings.enforce_credit_limit is
  'Refuser une vente qui ferait dépasser le plafond d''ardoise du client.';

-- `create_sale` — version 3.
--   v1 (001) : le socle.
--   v2 (005) : les prestations ne contrôlent pas le stock.
--   v3 (007) : le plafond d'ardoise est appliqué.
--
-- Le contrôle a lieu AVANT l'`update sales` final : la ligne de vente existe
-- déjà mais son `total_xof` vaut encore 0, elle ne fausse donc pas le calcul
-- de l'encours, et aucun règlement n'a encore été inséré.
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
begin
  if p->'items' is null or jsonb_array_length(p->'items') = 0 then
    raise exception 'Vente vide : aucune ligne.';
  end if;

  if v_discount < 0 then
    raise exception 'Remise négative impossible.';
  end if;
  if v_paid < 0 then
    raise exception 'Encaissement négatif impossible.';
  end if;

  select allow_negative_stock, enforce_credit_limit
    into v_allow_neg, v_enforce
    from shop_settings where id = 1;

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

  -- Une ardoise sans client identifié serait irrécouvrable.
  if v_status <> 'payee' and v_customer is null then
    raise exception 'Vente à crédit impossible sans client identifié.';
  end if;

  -- Plafond d'ardoise. On raisonne sur l'ENCOURS TOTAL après cette vente, pas
  -- sur le reste à payer de la seule vente en cours : un client peut sinon
  -- multiplier les petites ardoises sous le plafond jusqu'à le faire exploser.
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

-- ============================================================
-- 3. Journal d'audit
-- ============================================================

-- Une écriture par mutation passée par /api/admin/db. On garde l'identité de
-- l'opérateur en TEXTE et non en FK : le patron « maître » du bootstrap n'a
-- pas de ligne dans team_members, et surtout un compte supprimé ne doit pas
-- effacer ce qu'il a fait.
create table if not exists audit_log (
  id          bigserial primary key,
  member_id   text,
  member_name text,
  member_role text,
  action      text not null,          -- insert | update | upsert | delete
  table_name  text not null,
  filters     jsonb,                  -- sur quelles lignes on a agi
  changes     jsonb,                  -- ce qui a été écrit (hors secrets)
  row_ids     text[],                 -- identifiants touchés, si connus
  ok          boolean not null default true,
  error       text,
  at          timestamptz not null default now()
);

create index if not exists audit_log_at_idx    on audit_log (at desc);
create index if not exists audit_log_table_idx on audit_log (table_name, at desc);
create index if not exists audit_log_member_idx on audit_log (member_id, at desc);

alter table audit_log enable row level security;

-- ============================================================
-- 4. Frein sur les tentatives de connexion
-- ============================================================

-- Un simple délai fixe de 500 ms ne freine pas une attaque distribuée : elle
-- lance mille requêtes en parallèle. On compte les échecs par identifiant
-- (e-mail et adresse IP) et on bloque temporairement au-delà d'un seuil.
create table if not exists auth_throttle (
  identifier   text primary key,      -- 'ip:1.2.3.4' ou 'email:x@y.z'
  failures     int not null default 0,
  blocked_until timestamptz,
  last_failure timestamptz not null default now()
);

create index if not exists auth_throttle_blocked_idx
  on auth_throttle (blocked_until) where blocked_until is not null;

alter table auth_throttle enable row level security;

-- Nettoyage : sans purge, la table grossit indéfiniment pour rien.
create or replace function purge_auth_throttle() returns void
language sql as $$
  delete from auth_throttle
   where last_failure < now() - interval '7 days'
     and (blocked_until is null or blocked_until < now());
$$;

-- ============================================================
insert into schema_migrations (version) values ('007_securite_credit_audit')
on conflict (version) do nothing;
