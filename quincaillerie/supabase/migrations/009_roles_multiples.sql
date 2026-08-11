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
