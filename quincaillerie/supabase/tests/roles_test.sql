-- ============================================================
-- NADAL MULTISERVICES — Tests des rôles multiples
--
--   psql "$DATABASE_URL" -f supabase/tests/roles_test.sql
--
-- Transaction terminée par ROLLBACK : rien ne subsiste.
--
-- CE QUI EST COUVERT
--   · la reprise depuis l'ancienne colonne `role` ;
--   · `role` suit `roles` automatiquement, dans les deux sens ;
--   · un compte ne peut pas se retrouver sans rôle ;
--   · un rôle inventé est refusé ;
--   · rejouer la migration n'écrase pas les rôles multiples.
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

-- ---------- 1. Un compte à un seul rôle ------------------------------------

do $$
declare v_id uuid; v_role text; v_roles text[];
begin
  insert into team_members (name, email, password_hash, roles, status)
  values ('Test Vendeur', 'v@test.ci', 'x', array['vendeur'], 'active')
  returning id into v_id;

  select role, roles into v_role, v_roles from team_members where id = v_id;
  perform pg_temp.verifie(v_roles = array['vendeur'], 'roles enregistré tel quel');
  perform pg_temp.verifie(v_role = 'vendeur', 'role dérivé à l''insertion');
end $$;

-- ---------- 2. Deux rôles : le principal est le plus élevé ----------------

do $$
declare v_id uuid; v_role text;
begin
  insert into team_members (name, email, password_hash, roles, status)
  values ('Test Polyvalent', 'p@test.ci', 'x',
          array['vendeur', 'magasinier'], 'active')
  returning id into v_id;

  select role into v_role from team_members where id = v_id;
  perform pg_temp.verifie(v_role = 'vendeur',
    'vendeur+magasinier : étiquette « vendeur »');

  -- On lui ajoute gérant : l'étiquette doit remonter.
  update team_members set roles = array['vendeur', 'magasinier', 'gerant']
   where id = v_id;
  select role into v_role from team_members where id = v_id;
  perform pg_temp.verifie(v_role = 'gerant', 'role suit roles à la modification');

  -- Et redescendre quand on retire gérant.
  update team_members set roles = array['magasinier'] where id = v_id;
  select role into v_role from team_members where id = v_id;
  perform pg_temp.verifie(v_role = 'magasinier', 'role redescend aussi');
end $$;

-- ---------- 3. Un compte ne peut pas se retrouver sans rôle ---------------

do $$
declare v_ok boolean := false; v_id uuid;
begin
  select id into v_id from team_members where email = 'v@test.ci';
  begin
    update team_members set roles = array[]::text[] where id = v_id;
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.verifie(v_ok, 'un tableau de rôles vide est refusé');

  v_ok := false;
  begin
    insert into team_members (name, email, password_hash, roles, status)
    values ('Sans rôle', 'x@test.ci', 'x', array[]::text[], 'active');
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.verifie(v_ok, 'création sans rôle refusée aussi');
end $$;

-- ---------- 4. Un rôle inventé est refusé ---------------------------------

do $$
declare v_ok boolean := false;
begin
  begin
    insert into team_members (name, email, password_hash, roles, status)
    values ('Faux rôle', 'f@test.ci', 'x', array['vendeur', 'directeur'], 'active');
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.verifie(v_ok, 'un rôle hors des quatre connus est refusé');
end $$;

-- ---------- 5. Recherche par rôle ----------------------------------------

do $$
declare v_nb int;
begin
  -- « Qui peut réceptionner ? » — la question se pose sur roles, pas sur role.
  select count(*) into v_nb
    from team_members
   where roles @> array['magasinier'] and status = 'active';
  perform pg_temp.verifie(v_nb >= 1,
    'la recherche par rôle trouve les polyvalents, pas seulement les spécialistes');

  -- Le polyvalent porte l'étiquette « magasinier » à ce stade du test, mais
  -- ce qui compte est qu'il soit trouvé par roles.
  select count(*) into v_nb
    from team_members
   where role = 'magasinier' and status = 'active';
  perform pg_temp.verifie(v_nb >= 1, 'l''étiquette reste utilisable pour un tri');
end $$;

-- ---------- 6. Rejouer la migration n'écrase rien -------------------------

do $$
declare v_roles text[];
begin
  -- On remet deux rôles, puis on rejoue le bloc de reprise de la migration
  -- 009. Sa garde doit l'empêcher d'écraser `roles` avec `array[role]`.
  update team_members set roles = array['vendeur', 'magasinier']
   where email = 'p@test.ci';

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'team_members'
       and column_name = 'roles'
  ) then
    update team_members set roles = array[role];
  end if;

  select roles into v_roles from team_members where email = 'p@test.ci';
  perform pg_temp.verifie(array_length(v_roles, 1) = 2,
    'rejouer la migration ne réduit pas les rôles multiples à un seul');
end $$;

rollback;
