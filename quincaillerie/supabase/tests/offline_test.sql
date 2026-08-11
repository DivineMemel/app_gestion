-- ============================================================
-- NADAL MULTISERVICES — Tests de la caisse hors ligne
--
--   psql "$DATABASE_URL" -f supabase/tests/offline_test.sql
--
-- Transaction terminée par ROLLBACK, comme rpc_test.sql : rien ne subsiste.
--
-- CE QUI EST COUVERT
--   · rejouer deux fois la même vente n'encaisse qu'une fois ;
--   · un rejeu renvoie la vente d'origine, pas une erreur ;
--   · l'heure du comptoir est conservée, pas celle de la synchronisation ;
--   · une horloge déréglée ne peut pas dater une vente n'importe quand ;
--   · hors ligne, le stock peut passer en négatif — et c'est visible ;
--   · hors ligne, le crédit est refusé.
-- ============================================================

begin;

create or replace function pg_temp.verifie(condition boolean, libelle text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'ÉCHEC — %', libelle;
  end if;
  raise notice 'ok — %', libelle;
end $$;

insert into categories (id, name, slug)
values ('11111111-1111-1111-1111-111111111111', 'Test', 'test-hl');

insert into products (id, name, category_id, base_unit, stock_qty, cost_price_xof)
values ('22222222-2222-2222-2222-222222222222', 'Ciment test',
        '11111111-1111-1111-1111-111111111111', 'sac', 5, 4000);

insert into customers (id, name, phone, credit_limit_xof)
values ('44444444-4444-4444-4444-444444444444', 'Client test', '0700000000', 500000);

-- Fabrique une charge utile de vente, pour ne pas la recopier dix fois.
create or replace function pg_temp.vente(
  p_ref uuid, p_qty numeric, p_paid bigint,
  p_offline boolean default true, p_sold_at timestamptz default null,
  p_customer uuid default null
) returns jsonb language sql as $$
  select create_sale(jsonb_build_object(
    'client_ref', p_ref,
    'captured_offline', p_offline,
    'sold_at', p_sold_at,
    'customer_id', p_customer,
    'paid_xof', p_paid,
    'payment_method', case when p_paid = 0 then 'credit' else 'especes' end,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', '22222222-2222-2222-2222-222222222222',
      'unit_label', 'sac', 'unit_factor', 1,
      'qty', p_qty, 'unit_price_xof', 5000))));
$$;

-- ---------- 1. Idempotence -------------------------------------------------

do $$
declare
  v1 jsonb; v2 jsonb;
  v_ref uuid := '99999999-9999-9999-9999-999999999999';
  v_ventes int; v_regles bigint; v_stock numeric;
begin
  v1 := pg_temp.vente(v_ref, 2, 10000);
  -- Le réseau a coupé avant que la caisse reçoive la réponse : elle rejoue.
  v2 := pg_temp.vente(v_ref, 2, 10000);

  perform pg_temp.verifie(v1->>'id' = v2->>'id',
    'rejouer la même référence renvoie la MÊME vente');
  perform pg_temp.verifie((v1->>'deja_enregistree')::boolean = false
                      and (v2->>'deja_enregistree')::boolean = true,
    'le rejeu est signalé comme tel à la caisse');

  select count(*) into v_ventes from sales where client_ref = v_ref;
  perform pg_temp.verifie(v_ventes = 1, 'une seule vente en base après deux envois');

  select coalesce(sum(amount_xof), 0) into v_regles
    from payments where sale_id = (v1->>'id')::uuid;
  perform pg_temp.verifie(v_regles = 10000, 'le client n''est encaissé qu''une fois');

  select stock_qty into v_stock from products
   where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.verifie(v_stock = 3, 'le stock n''est décrémenté qu''une fois (5 → 3)');
end $$;

-- ---------- 2. L'heure du comptoir, pas celle de la synchronisation -------

do $$
declare
  v jsonb;
  v_hier timestamptz := now() - interval '18 hours';
  v_sold timestamptz; v_synced timestamptz; v_paid timestamptz;
begin
  v := pg_temp.vente(gen_random_uuid(), 1, 5000, true, v_hier);

  select sold_at, synced_at into v_sold, v_synced
    from sales where id = (v->>'id')::uuid;

  perform pg_temp.verifie(abs(extract(epoch from (v_sold - v_hier))) < 2,
    'la vente garde l''heure du comptoir');
  perform pg_temp.verifie(v_synced > v_sold,
    'synced_at note le retour du réseau — l''écart mesure la coupure');

  -- Le règlement doit suivre la vente, sinon la recette du jour est fausse
  -- des deux côtés du grand livre.
  select paid_at into v_paid from payments where sale_id = (v->>'id')::uuid;
  perform pg_temp.verifie(abs(extract(epoch from (v_paid - v_hier))) < 2,
    'le règlement est daté de la vente, pas de la synchronisation');
end $$;

-- ---------- 3. Horloge déréglée -------------------------------------------

do $$
declare v jsonb; v_sold timestamptz;
begin
  -- Tablette réglée sur l'an prochain : la vente ne doit pas partir dans le
  -- futur, sinon elle disparaît de toutes les recettes jusqu'à cette date.
  v := pg_temp.vente(gen_random_uuid(), 1, 5000, true, now() + interval '200 days');
  select sold_at into v_sold from sales where id = (v->>'id')::uuid;
  perform pg_temp.verifie(v_sold <= now() + interval '1 minute',
    'une date future est ramenée à maintenant');

  -- Et rétrodatée dans un mois déjà clôturé : idem, on refuse de rouvrir
  -- une comptabilité arrêtée.
  v := pg_temp.vente(gen_random_uuid(), 1, 5000, true, now() - interval '400 days');
  select sold_at into v_sold from sales where id = (v->>'id')::uuid;
  perform pg_temp.verifie(v_sold >= now() - interval '1 minute',
    'une date trop ancienne est ramenée à maintenant');
end $$;

-- ---------- 4. Le stock peut partir en négatif hors ligne -----------------

do $$
declare v jsonb; v_stock numeric; v_vu int;
begin
  select stock_qty into v_stock from products
   where id = '22222222-2222-2222-2222-222222222222';

  -- Deux postes ont vendu le même dernier sac : au retour du réseau, le
  -- second passe quand même. La marchandise est sortie, la nier rendrait le
  -- stock faux dans l'autre sens.
  v := pg_temp.vente(gen_random_uuid(), v_stock + 3, ((v_stock + 3) * 5000)::bigint);
  perform pg_temp.verifie(v->>'status' = 'payee',
    'hors ligne, une vente au-delà du stock est acceptée');

  select stock_qty into v_stock from products
   where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.verifie(v_stock < 0, 'le stock passe en négatif');

  select count(*) into v_vu from v_stock_negatif
   where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.verifie(v_vu = 1,
    'l''article apparaît dans v_stock_negatif — l''écart est visible, pas enfoui');
end $$;

-- ---------- 5. En ligne, le stock reste contrôlé ---------------------------

do $$
declare v_ok boolean := false;
begin
  -- La tolérance est réservée au hors-ligne : elle ne doit pas devenir la
  -- règle générale au passage.
  begin
    perform pg_temp.vente(gen_random_uuid(), 9999, (9999 * 5000)::bigint, false);
  exception when others then
    v_ok := sqlerrm like 'Stock insuffisant%';
  end;
  perform pg_temp.verifie(v_ok, 'en ligne, le contrôle de stock s''applique toujours');
end $$;

-- ---------- 6. Pas de crédit hors ligne -----------------------------------

do $$
declare v_ok boolean := false;
begin
  -- Le client a pourtant 500 000 F de plafond : ce n'est pas le plafond qui
  -- refuse, c'est l'impossibilité de le vérifier.
  begin
    perform pg_temp.vente(gen_random_uuid(), 1, 0, true, null,
                          '44444444-4444-4444-4444-444444444444');
  exception when others then
    v_ok := sqlerrm like '%crédit impossible hors ligne%';
  end;
  perform pg_temp.verifie(v_ok, 'hors ligne, le crédit est refusé');

  -- Partiel aussi : un reste à payer est une ardoise.
  v_ok := false;
  begin
    perform pg_temp.vente(gen_random_uuid(), 2, 3000, true, null,
                          '44444444-4444-4444-4444-444444444444');
  exception when others then
    v_ok := sqlerrm like '%crédit impossible hors ligne%';
  end;
  perform pg_temp.verifie(v_ok, 'hors ligne, un paiement partiel est refusé aussi');
end $$;

-- ---------- 7. En ligne, le crédit reste possible --------------------------

-- Le test 4 a volontairement laissé le stock en négatif. Les ventes en ligne
-- qui suivent contrôlent le stock, elles : on régularise d'abord, exactement
-- comme le ferait le magasinier au retour du réseau.
insert into stock_movements (product_id, qty_base, kind, note)
values ('22222222-2222-2222-2222-222222222222', 50, 'ajustement',
        'Régularisation après coupure');

do $$
declare v jsonb;
begin
  v := pg_temp.vente(gen_random_uuid(), 1, 0, false, null,
                     '44444444-4444-4444-4444-444444444444');
  perform pg_temp.verifie(v->>'status' = 'credit',
    'en ligne, l''ardoise fonctionne toujours');
end $$;

-- ---------- 8. Une vente sans référence reste possible --------------------

do $$
declare v1 jsonb; v2 jsonb;
begin
  -- Rétrocompatibilité : les appels existants ne passent pas de client_ref.
  -- Deux ventes identiques sans référence sont deux ventes distinctes.
  v1 := create_sale(jsonb_build_object(
    'paid_xof', 5000, 'items', jsonb_build_array(jsonb_build_object(
      'product_id', '22222222-2222-2222-2222-222222222222',
      'unit_label', 'sac', 'unit_factor', 1, 'qty', 1, 'unit_price_xof', 5000))));
  v2 := create_sale(jsonb_build_object(
    'paid_xof', 5000, 'items', jsonb_build_array(jsonb_build_object(
      'product_id', '22222222-2222-2222-2222-222222222222',
      'unit_label', 'sac', 'unit_factor', 1, 'qty', 1, 'unit_price_xof', 5000))));

  perform pg_temp.verifie(v1->>'id' <> v2->>'id',
    'sans référence, deux ventes identiques restent deux ventes');
end $$;

rollback;
