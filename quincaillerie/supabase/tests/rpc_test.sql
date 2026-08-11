-- ============================================================
-- NADAL MULTISERVICES — Tests des opérations atomiques
--
-- COMMENT LANCER
--   Coller ce fichier entier dans le SQL Editor Supabase, ou :
--     psql "$DATABASE_URL" -f supabase/tests/rpc_test.sql
--
--   Tout se déroule dans une transaction terminée par ROLLBACK : la base
--   ressort telle qu'elle est entrée. Un test qui échoue interrompt le script
--   avec le message correspondant — donc « aucune erreur » signifie « tout
--   passe ».
--
--   Seule exception au rollback : les séquences de numérotation (V-2026-…,
--   BC-2026-…) ne sont pas transactionnelles et auront avancé de quelques
--   crans. Sans conséquence, les numéros n'ont pas à être contigus.
--
-- CE QUI EST COUVERT
--   · une vente décrémente le stock du bon nombre d'unités de BASE ;
--   · une vente encaissée génère toujours son règlement ;
--   · le stock insuffisant refuse la vente, sauf réglage contraire ;
--   · une prestation se vend sans stock et sans mouvement ;
--   · le plafond d'ardoise est appliqué sur l'ENCOURS, pas sur la vente seule ;
--   · une annulation contre-passe exactement ce que la vente avait fait ;
--   · un mouvement de stock est immuable.
-- ============================================================

begin;

-- Un helper d'assertion : plus lisible que dix blocs `if not … raise`.
create or replace function pg_temp.verifie(condition boolean, libelle text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'ÉCHEC — %', libelle;
  end if;
  raise notice 'ok — %', libelle;
end $$;

-- ---------- Jeu d'essai ---------------------------------------------------

update shop_settings
   set allow_negative_stock = false,
       enforce_credit_limit = true
 where id = 1;

insert into categories (id, name, slug)
values ('11111111-1111-1111-1111-111111111111', 'Test', 'test-rpc');

-- Un sac de ciment à 5 000 F, vendu aussi à la palette (×40).
insert into products (id, name, category_id, base_unit, stock_qty, cost_price_xof)
values ('22222222-2222-2222-2222-222222222222', 'Ciment test',
        '11111111-1111-1111-1111-111111111111', 'sac', 100, 4000);

insert into product_units (product_id, label, factor, price_xof, is_default)
values ('22222222-2222-2222-2222-222222222222', 'sac', 1, 5000, true),
       ('22222222-2222-2222-2222-222222222222', 'palette', 40, 190000, false);

-- Une prestation : pas de stock, par nature.
insert into products (id, name, category_id, base_unit, stock_qty, is_service)
values ('33333333-3333-3333-3333-333333333333', 'Pose test',
        '11111111-1111-1111-1111-111111111111', 'm²', 0, true);

-- Un client plafonné à 50 000 F d'ardoise.
insert into customers (id, name, phone, credit_limit_xof)
values ('44444444-4444-4444-4444-444444444444', 'Client test', '0700000000', 50000);

-- Un client sans crédit autorisé (le défaut).
insert into customers (id, name, phone, credit_limit_xof)
values ('55555555-5555-5555-5555-555555555555', 'Client comptant', '0700000001', 0);

-- ---------- 1. Vente au comptant ------------------------------------------

do $$
declare
  v jsonb;
  v_stock numeric;
  v_regle bigint;
begin
  v := create_sale(jsonb_build_object(
    'customer_id', null, 'paid_xof', 15000, 'payment_method', 'especes',
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', '22222222-2222-2222-2222-222222222222',
      'unit_label', 'sac', 'unit_factor', 1, 'qty', 3, 'unit_price_xof', 5000))));

  perform pg_temp.verifie((v->>'total_xof')::bigint = 15000, 'total = 3 × 5 000');
  perform pg_temp.verifie(v->>'status' = 'payee', 'vente soldée');

  select stock_qty into v_stock from products
   where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.verifie(v_stock = 97, 'stock 100 → 97');

  select coalesce(sum(amount_xof), 0) into v_regle from payments
   where sale_id = (v->>'id')::uuid;
  perform pg_temp.verifie(v_regle = 15000, 'une vente encaissée génère son règlement');
end $$;

-- ---------- 2. Les unités de vente se convertissent en unité de base ------

do $$
declare v jsonb; v_stock numeric;
begin
  -- Une palette = 40 sacs. Le stock doit baisser de 40, pas de 1.
  v := create_sale(jsonb_build_object(
    'paid_xof', 190000, 'items', jsonb_build_array(jsonb_build_object(
      'product_id', '22222222-2222-2222-2222-222222222222',
      'unit_label', 'palette', 'unit_factor', 40, 'qty', 1, 'unit_price_xof', 190000))));

  select stock_qty into v_stock from products
   where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.verifie(v_stock = 57, 'une palette retire 40 sacs du stock');
end $$;

-- ---------- 3. Stock insuffisant ------------------------------------------

do $$
declare v_ok boolean := false;
begin
  begin
    perform create_sale(jsonb_build_object(
      'paid_xof', 0, 'customer_id', '44444444-4444-4444-4444-444444444444',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', '22222222-2222-2222-2222-222222222222',
        'unit_label', 'sac', 'unit_factor', 1, 'qty', 9999, 'unit_price_xof', 5000))));
  exception when others then
    v_ok := sqlerrm like 'Stock insuffisant%';
  end;
  perform pg_temp.verifie(v_ok, 'stock insuffisant : la vente est refusée');
end $$;

-- ---------- 4. Une prestation ignore le stock -----------------------------

do $$
declare v jsonb; v_mvts int;
begin
  v := create_sale(jsonb_build_object(
    'paid_xof', 250000, 'items', jsonb_build_array(jsonb_build_object(
      'product_id', '33333333-3333-3333-3333-333333333333',
      'unit_label', 'm²', 'unit_factor', 1, 'qty', 25, 'unit_price_xof', 10000))));

  perform pg_temp.verifie((v->>'total_xof')::bigint = 250000,
    'une prestation se vend malgré un stock à zéro');

  select count(*) into v_mvts from stock_movements
   where product_id = '33333333-3333-3333-3333-333333333333';
  perform pg_temp.verifie(v_mvts = 0, 'une prestation ne crée aucun mouvement de stock');
end $$;

-- ---------- 5. Ardoise sans client ----------------------------------------

do $$
declare v_ok boolean := false;
begin
  begin
    perform create_sale(jsonb_build_object(
      'paid_xof', 0, 'items', jsonb_build_array(jsonb_build_object(
        'product_id', '22222222-2222-2222-2222-222222222222',
        'unit_label', 'sac', 'unit_factor', 1, 'qty', 1, 'unit_price_xof', 5000))));
  exception when others then
    v_ok := sqlerrm like '%sans client identifié%';
  end;
  perform pg_temp.verifie(v_ok, 'une ardoise anonyme est refusée');
end $$;

-- ---------- 6. Plafond d'ardoise ------------------------------------------

do $$
declare v_ok boolean := false; v jsonb;
begin
  -- Sous le plafond (50 000) : accepté.
  v := create_sale(jsonb_build_object(
    'customer_id', '44444444-4444-4444-4444-444444444444', 'paid_xof', 0,
    'payment_method', 'credit',
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', '22222222-2222-2222-2222-222222222222',
      'unit_label', 'sac', 'unit_factor', 1, 'qty', 8, 'unit_price_xof', 5000))));
  perform pg_temp.verifie(v->>'status' = 'credit', '40 000 F d''ardoise sous un plafond de 50 000 : accepté');

  -- Une SECONDE ardoise de 40 000 reste sous le plafond prise isolément, mais
  -- porte l'encours à 80 000. C'est exactement le contournement que le contrôle
  -- doit empêcher : le plafond porte sur l'encours, pas sur la vente.
  begin
    perform create_sale(jsonb_build_object(
      'customer_id', '44444444-4444-4444-4444-444444444444', 'paid_xof', 0,
      'payment_method', 'credit',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', '22222222-2222-2222-2222-222222222222',
        'unit_label', 'sac', 'unit_factor', 1, 'qty', 8, 'unit_price_xof', 5000))));
  exception when others then
    v_ok := sqlerrm like 'Plafond d''ardoise dépassé%';
  end;
  perform pg_temp.verifie(v_ok, 'le plafond porte sur l''encours cumulé, pas sur la vente seule');
end $$;

do $$
declare v_ok boolean := false;
begin
  -- Client à plafond 0 : aucune ardoise possible.
  begin
    perform create_sale(jsonb_build_object(
      'customer_id', '55555555-5555-5555-5555-555555555555', 'paid_xof', 0,
      'payment_method', 'credit',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', '22222222-2222-2222-2222-222222222222',
        'unit_label', 'sac', 'unit_factor', 1, 'qty', 1, 'unit_price_xof', 5000))));
  exception when others then
    v_ok := sqlerrm like 'Plafond d''ardoise dépassé%';
  end;
  perform pg_temp.verifie(v_ok, 'plafond à 0 : aucune ardoise autorisée');
end $$;

do $$
declare v jsonb;
begin
  -- Réglage désactivé : le patron reprend la main.
  update shop_settings set enforce_credit_limit = false where id = 1;
  v := create_sale(jsonb_build_object(
    'customer_id', '55555555-5555-5555-5555-555555555555', 'paid_xof', 0,
    'payment_method', 'credit',
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', '22222222-2222-2222-2222-222222222222',
      'unit_label', 'sac', 'unit_factor', 1, 'qty', 1, 'unit_price_xof', 5000))));
  perform pg_temp.verifie(v->>'status' = 'credit',
    'réglage désactivé : l''ardoise repasse');
  update shop_settings set enforce_credit_limit = true where id = 1;
end $$;

-- ---------- 7. Une vente partielle reste une vente -------------------------

do $$
declare v jsonb; v_solde bigint;
begin
  update customers set credit_limit_xof = 1000000
   where id = '44444444-4444-4444-4444-444444444444';

  v := create_sale(jsonb_build_object(
    'customer_id', '44444444-4444-4444-4444-444444444444', 'paid_xof', 5000,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', '22222222-2222-2222-2222-222222222222',
      'unit_label', 'sac', 'unit_factor', 1, 'qty', 3, 'unit_price_xof', 5000))));

  perform pg_temp.verifie(v->>'status' = 'partielle', 'paiement partiel');

  select solde_xof into v_solde from v_customer_balances
   where id = '44444444-4444-4444-4444-444444444444';
  -- 40 000 (l'ardoise acceptée au test 6) + 15 000 d'achat − 5 000 encaissés.
  -- Les tentatives refusées n'ont rien laissé : une exception plpgsql rembobine
  -- jusqu'au point de sauvegarde implicite du bloc.
  perform pg_temp.verifie(v_solde = 50000, 'le solde client est « acheté − réglé »');
end $$;

-- ---------- 8. Le rendu de monnaie n'est pas un encaissement --------------

do $$
declare v jsonb;
begin
  v := create_sale(jsonb_build_object(
    'paid_xof', 20000,  -- le client donne 20 000 pour 5 000 d'achat
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', '22222222-2222-2222-2222-222222222222',
      'unit_label', 'sac', 'unit_factor', 1, 'qty', 1, 'unit_price_xof', 5000))));
  perform pg_temp.verifie((v->>'paid_xof')::bigint = 5000,
    'l''encaissement est plafonné au total : la monnaie rendue n''est pas une recette');
end $$;

-- ---------- 9. Annulation : contre-passe exacte ---------------------------

do $$
declare
  v jsonb;
  v_avant numeric; v_apres numeric;
  v_regle bigint;
begin
  select stock_qty into v_avant from products
   where id = '22222222-2222-2222-2222-222222222222';

  v := create_sale(jsonb_build_object(
    'paid_xof', 10000, 'items', jsonb_build_array(jsonb_build_object(
      'product_id', '22222222-2222-2222-2222-222222222222',
      'unit_label', 'sac', 'unit_factor', 1, 'qty', 2, 'unit_price_xof', 5000))));

  perform cancel_sale((v->>'id')::uuid, null);

  select stock_qty into v_apres from products
   where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.verifie(v_apres = v_avant, 'annuler restitue exactement le stock sorti');

  select coalesce(sum(amount_xof), 0) into v_regle from payments
   where sale_id = (v->>'id')::uuid;
  perform pg_temp.verifie(v_regle = 0, 'annuler efface les règlements de la vente');

  perform pg_temp.verifie(
    (select status from sales where id = (v->>'id')::uuid) = 'annulee',
    'la vente est marquée annulée, pas supprimée');
end $$;

-- ---------- 10. Le grand livre : modification interdite, suppression rembobinée

do $$
declare
  v_ok boolean := false;
  v_id uuid; v_produit uuid; v_qty numeric;
  v_avant numeric; v_apres numeric;
begin
  select id, product_id, qty_base into v_id, v_produit, v_qty
    from stock_movements order by created_at desc limit 1;

  begin
    update stock_movements set qty_base = 999 where id = v_id;
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.verifie(v_ok, 'un mouvement de stock ne se modifie pas');

  -- La suppression, elle, reste possible (erreur de saisie du jour) et
  -- rembobine le solde : c'est le choix assumé de guard_stock_movement().
  -- Ce qu'il faut vérifier, c'est que le solde reste exact — un mouvement
  -- supprimé sans rembobinage ferait diverger stock_qty du grand livre.
  select stock_qty into v_avant from products where id = v_produit;
  delete from stock_movements where id = v_id;
  select stock_qty into v_apres from products where id = v_produit;

  perform pg_temp.verifie(v_apres = v_avant - v_qty,
    'supprimer un mouvement rembobine le solde du produit');
end $$;

-- ---------- 11. Une vente vide n'est pas une vente ------------------------

do $$
declare v_ok boolean := false;
begin
  begin
    perform create_sale(jsonb_build_object('paid_xof', 0, 'items', jsonb_build_array()));
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.verifie(v_ok, 'une vente sans ligne est refusée');
end $$;

-- ---------- 12. Quantités et prix aberrants -------------------------------

do $$
declare v_ok boolean := false;
begin
  -- Quantité négative.
  begin
    perform create_sale(jsonb_build_object(
      'paid_xof', 0, 'items', jsonb_build_array(jsonb_build_object(
        'product_id', '22222222-2222-2222-2222-222222222222',
        'unit_label', 'sac', 'unit_factor', 1, 'qty', -5, 'unit_price_xof', 5000))));
  exception when others then v_ok := true;
  end;
  perform pg_temp.verifie(v_ok, 'quantité négative refusée');

  -- Prix négatif : sinon on « vend » à perte volontairement pour vider la caisse.
  v_ok := false;
  begin
    perform create_sale(jsonb_build_object(
      'paid_xof', 0, 'items', jsonb_build_array(jsonb_build_object(
        'product_id', '22222222-2222-2222-2222-222222222222',
        'unit_label', 'sac', 'unit_factor', 1, 'qty', 1, 'unit_price_xof', -5000))));
  exception when others then v_ok := true;
  end;
  perform pg_temp.verifie(v_ok, 'prix négatif refusé');

  -- Conditionnement nul : diviserait le stock par zéro dans les conversions.
  v_ok := false;
  begin
    perform create_sale(jsonb_build_object(
      'paid_xof', 0, 'items', jsonb_build_array(jsonb_build_object(
        'product_id', '22222222-2222-2222-2222-222222222222',
        'unit_label', 'sac', 'unit_factor', 0, 'qty', 1, 'unit_price_xof', 5000))));
  exception when others then v_ok := true;
  end;
  perform pg_temp.verifie(v_ok, 'facteur de conversion nul refusé');
end $$;

-- ---------- 13. Devis → vente applique les mêmes règles -------------------

do $$
declare v_quote uuid; v_ok boolean := false;
begin
  insert into quotes (customer_id, customer_name, subtotal_xof, discount_xof, total_xof, status)
  values ('55555555-5555-5555-5555-555555555555', 'Client comptant', 5000, 0, 5000, 'accepte')
  returning id into v_quote;

  insert into quote_items (quote_id, product_id, product_name, unit_label, unit_factor,
                           qty, unit_price_xof, line_total_xof)
  values (v_quote, '22222222-2222-2222-2222-222222222222', 'Ciment test', 'sac', 1,
          1, 5000, 5000);

  -- Converti sans encaisser, sur un client à plafond 0 : doit être refusé, la
  -- conversion déléguant à create_sale.
  begin
    perform convert_quote_to_sale(v_quote, 0, 'credit', null);
  exception when others then
    v_ok := sqlerrm like 'Plafond d''ardoise dépassé%';
  end;
  perform pg_temp.verifie(v_ok, 'devis → vente : le plafond d''ardoise s''applique aussi');
end $$;

rollback;

-- Si vous lisez cette ligne sans avoir vu d'erreur : tout est passé.
