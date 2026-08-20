-- ============================================================
-- NADAL MULTISERVICES — Mise à jour à coller dans le SQL Editor
--
-- Regroupe les migrations 007 à 011, dans l'ordre. À passer EN UNE FOIS.
-- Chacune est idempotente : la rejouer ne casse rien.
--
--   007 · sécurité (vues, plafond d'ardoise, audit, anti-force brute)
--   008 · caisse hors ligne (idempotence, horodatage, stock négatif)
--   009 · rôles multiples
--   010 · NADAL SERVICES → NADAL MULTISERVICES
--   011 · ventes et marges par produit
--
-- Vérifier après coup :
--   select version, applied_at from schema_migrations order by version;
-- ============================================================


-- ============================================================
-- ▼ 007_securite_credit_audit.sql
-- ============================================================

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

-- ============================================================
-- ▼ 008_caisse_hors_ligne.sql
-- ============================================================

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

-- ============================================================
-- ▼ 009_roles_multiples.sql
-- ============================================================

-- ============================================================
-- NADAL SERVICES — Plusieurs rôles par personne
-- À lancer APRÈS 001 → 008.
--
-- Un compte ne portait qu'un seul rôle. Dans une quincaillerie de quartier,
-- c'est faux la moitié du temps : celui qui tient la caisse le matin
-- réceptionne les camions l'après-midi, et le gérant vend au comptoir quand il
-- y a du monde. Il fallait choisir entre le priver d'un écran dont il a besoin
-- ou lui donner « gérant » et donc les marges — deux mauvaises réponses.
--
-- Désormais `team_members.roles` est un TABLEAU, et les droits sont l'UNION de
-- ceux des rôles portés. Un vendeur+magasinier tient la caisse ET reçoit les
-- livraisons ; il ne voit toujours pas les prix d'achat, puisque aucun de ses
-- deux rôles ne le permet.
--
-- `role` (au singulier) ne disparaît pas : il devient une colonne DÉRIVÉE,
-- maintenue par déclencheur, qui porte le rôle le plus élevé. Elle sert
-- d'étiquette d'affichage et garde compatibles les requêtes existantes. La
-- source de vérité, c'est `roles` — jamais l'inverse.
-- ============================================================

-- ---------- 1. La colonne, et la reprise de l'existant --------------------

-- La reprise est conditionnée à la création de la colonne. Sans cette garde,
-- rejouer la migration écraserait `roles` avec `array[role]` — c'est-à-dire
-- écraserait les rôles multiples avec le rôle dérivé qu'ils ont produit. On
-- perdrait exactement ce que cette migration ajoute.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'team_members'
       and column_name = 'roles'
  ) then
    alter table team_members
      add column roles text[] not null default array['vendeur']::text[];

    update team_members set roles = array[role];

    raise notice 'roles créée et reprise depuis role pour % compte(s)',
      (select count(*) from team_members);
  else
    raise notice 'roles existe déjà — reprise ignorée';
  end if;
end $$;

comment on column team_members.roles is
  'Rôles portés par la personne. Les droits sont l''union de ceux de chaque rôle. Source de vérité.';
comment on column team_members.role is
  'DÉRIVÉE de roles par déclencheur : le rôle le plus élevé. Étiquette d''affichage, ne jamais écrire directement.';

-- ---------- 2. Ce qu'un tableau de rôles a le droit de contenir -----------

alter table team_members drop constraint if exists team_members_roles_valides;
alter table team_members
  add constraint team_members_roles_valides check (
    -- Au moins un rôle : un compte sans rôle serait actif mais ne pourrait
    -- rien ouvrir — un fantôme que personne ne saurait diagnostiquer.
    --
    -- `cardinality` et non `array_length` : sur un tableau vide, array_length
    -- renvoie NULL, et une contrainte CHECK ne rejette que ce qui vaut FALSE.
    -- Le garde-fou aurait donc laissé passer exactement le cas qu'il vise.
    cardinality(roles) >= 1
    -- Et rien qui ne soit un rôle connu.
    and roles <@ array['patron', 'gerant', 'vendeur', 'magasinier']::text[]
  );

-- ---------- 3. `role` suit `roles`, jamais le contraire -------------------

-- L'ordre n'est hiérarchique que pour les deux premiers : patron et gérant se
-- distinguent par les droits. Vendeur et magasinier, eux, sont deux métiers
-- côte à côte — l'ordre entre eux ne sert qu'à choisir une étiquette quand
-- quelqu'un porte les deux.
create or replace function sync_member_role() returns trigger
language plpgsql as $$
begin
  new.role := case
    when 'patron'  = any(new.roles) then 'patron'
    when 'gerant'  = any(new.roles) then 'gerant'
    when 'vendeur' = any(new.roles) then 'vendeur'
    else 'magasinier'
  end;
  return new;
end $$;

drop trigger if exists trg_sync_member_role on team_members;
create trigger trg_sync_member_role
  before insert or update of roles on team_members
  for each row execute function sync_member_role();

-- Alignement des lignes existantes : le déclencheur ne se déclenche pas
-- rétroactivement.
update team_members
   set roles = roles
 where role is distinct from (
   case
     when 'patron'  = any(roles) then 'patron'
     when 'gerant'  = any(roles) then 'gerant'
     when 'vendeur' = any(roles) then 'vendeur'
     else 'magasinier'
   end
 );

-- ---------- 4. Recherche par rôle ----------------------------------------

-- « Qui est magasinier ? » se demande maintenant avec `roles @> array['magasinier']`,
-- ce qu'un index GIN sait résoudre.
create index if not exists team_members_roles_idx on team_members using gin (roles);

-- ============================================================
insert into schema_migrations (version) values ('009_roles_multiples')
on conflict (version) do nothing;

-- ============================================================
-- ▼ 010_nadal_multiservices.sql
-- ============================================================

-- ============================================================
-- NADAL MULTISERVICES — Changement de raison sociale
-- À lancer APRÈS 001 → 009.
--
-- « NADAL SERVICES » devient « NADAL MULTISERVICES ».
--
-- Renommer dans le code ne suffit pas : le nom affiché sur la vitrine, sur les
-- tickets de caisse et sur les devis vient de `shop_settings.name`, en base.
-- Les valeurs par défaut du schéma ne concernent que les nouvelles
-- installations — une boutique déjà en service garderait l'ancien nom
-- indéfiniment.
--
-- Le remplacement est CONDITIONNÉ à l'ancienne valeur exacte. Si quelqu'un a
-- déjà personnalisé le nom ou le pied de facture depuis l'écran Paramètres,
-- cette migration n'y touche pas : on ne défait pas un réglage volontaire.
-- ============================================================

update shop_settings
   set name = 'NADAL MULTISERVICES',
       updated_at = now()
 where id = 1
   and name = 'NADAL SERVICES';

update shop_settings
   set invoice_footer = replace(invoice_footer, 'NADAL SERVICES', 'NADAL MULTISERVICES'),
       updated_at = now()
 where id = 1
   and invoice_footer like '%NADAL SERVICES%';

-- La valeur par défaut, pour les installations futures.
alter table shop_settings
  alter column name set default 'NADAL MULTISERVICES';

do $$
declare v_nom text;
begin
  select name into v_nom from shop_settings where id = 1;
  raise notice 'Nom de la boutique : %', v_nom;
  if v_nom <> 'NADAL MULTISERVICES' then
    raise notice 'Nom personnalisé conservé — à changer depuis Paramètres si besoin.';
  end if;
end $$;

-- ============================================================
insert into schema_migrations (version) values ('010_nadal_multiservices')
on conflict (version) do nothing;


-- ============================================================
-- ▼ 011_ventes_par_produit.sql
-- ============================================================

-- ============================================================
-- NADAL MULTISERVICES — Ventes et marges PAR PRODUIT
-- À lancer APRÈS 001 → 010.
--
-- L'écran Ventes ne savait répondre qu'à « combien a-t-on encaissé
-- aujourd'hui ? ». Il manquait l'autre question, celle qu'on se pose devant le
-- rayon : « qu'est-ce qui part, et qu'est-ce que ça rapporte ? ».
--
-- `v_top_products` y répondait déjà, mais sur 90 jours glissants, sans coût et
-- sans marge : impossible de la brancher sur le sélecteur jour / mois / tout de
-- l'écran Ventes.
--
-- D'où cette vue au grain JOUR × PRODUIT :
--   · assez fine pour couvrir « aujourd'hui » ;
--   · assez compacte pour que le mois entier tienne en une requête, l'écran
--     ré-agrégeant par produit ;
--   · elle porte le coût et la marge, retirés de la réponse par la passerelle
--     pour les rôles qui n'y ont pas droit (voir lib/db-schema.ts).
--
-- Le chiffre est la somme des LIGNES, donc AVANT la remise de pied de ticket
-- (`sales.discount_xof`), qui n'appartient à aucun produit en particulier.
-- Même convention que `v_top_products`. Le total « par produit » peut donc
-- dépasser le total « par ticket » du même jour : c'est attendu, et l'écran le
-- dit.
-- ============================================================

create or replace view v_ventes_produits as
select
  -- Abidjan est à UTC+0 toute l'année, mais on nomme le fuseau plutôt que de
  -- s'appuyer sur celui du serveur : une base restaurée ailleurs découperait
  -- sinon les journées au mauvais endroit.
  ((s.sold_at at time zone 'Africa/Abidjan')::date)              as jour,
  si.product_id,
  si.product_name,
  p.base_unit,
  sum(si.qty * si.unit_factor)                                   as qty_base,
  sum(si.line_total_xof)::bigint                                 as chiffre_xof,
  -- `cost_price_xof` est figé à la vente et exprimé par unité de STOCK : il se
  -- multiplie par la quantité ramenée en base, pas par la quantité vendue.
  sum(si.qty * si.unit_factor * si.cost_price_xof)::bigint       as cout_xof,
  (sum(si.line_total_xof)
     - sum(si.qty * si.unit_factor * si.cost_price_xof))::bigint as marge_xof,
  count(distinct s.id)                                           as nb_ventes
from sale_items si
join sales s on s.id = si.sale_id
-- `left join` : un produit supprimé du catalogue garde ses ventes passées,
-- avec le nom figé sur la ligne. Une jointure stricte les effacerait de
-- l'historique.
left join products p on p.id = si.product_id
where s.status <> 'annulee'
group by 1, 2, 3, 4;

comment on view v_ventes_produits is
  'Ventes agrégées par jour et par produit, avec coût et marge. Le chiffre est '
  'la somme des lignes, hors remise de pied de ticket.';

-- Une vue est exécutée avec les droits de son propriétaire tant qu'on ne lui
-- pose pas `security_invoker` — et `postgres` a BYPASSRLS chez Supabase. Sans
-- cette ligne, les marges seraient lisibles avec la clé publique.
alter view v_ventes_produits set (security_invoker = true);

-- Ceinture et bretelles : les rôles publics n'ont rien à faire ici. Tout passe
-- par `service_role` depuis /api/admin/db. Le test d'existence garde la
-- migration rejouable sur un Postgres nu (base de test locale).
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on v_ventes_produits from %I', r);
    else
      raise notice 'rôle % absent — retrait de privilèges ignoré (base hors Supabase)', r;
    end if;
  end loop;
end $$;

-- L'agrégat balaie `sale_items` puis remonte à `sales` pour la date et le
-- statut. Sans cet index, chaque ouverture de l'onglet « Par produit » relit
-- toute la table des ventes.
create index if not exists sales_status_sold_at_idx
  on sales(status, sold_at desc);

-- ============================================================
insert into schema_migrations (version) values ('011_ventes_par_produit')
on conflict (version) do nothing;
