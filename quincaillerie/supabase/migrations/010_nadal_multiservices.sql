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
