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
