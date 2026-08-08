-- ============================================================
-- MUSE l'atelier — Interdire la double réservation
-- À lancer APRÈS 001 → 005, dans le SQL Editor Supabase.
--
-- Le problème
-- -----------
-- `/api/booking/slots` calcule correctement les créneaux libres. Mais
-- `/api/booking`, la route qui enregistre, ne revérifie PAS que le créneau
-- est encore libre avant d'insérer — et rien en base ne l'en empêchait.
--
-- Deux clientes ouvrent la page samedi matin, voient toutes les deux le
-- créneau de 10 h, valident à trente secondes d'intervalle : les deux sont
-- confirmées. Personne ne s'en aperçoit avant qu'elles ne se présentent
-- ensemble. C'est déjà arrivé le 23 mai 2026.
--
-- C'est un défaut de conception classique : on vérifie, puis on écrit, et il
-- se passe quelque chose entre les deux. Le corriger dans le code applicatif
-- ne ferait que réduire la fenêtre. Seule la base peut la fermer.
--
-- La capacité
-- -----------
-- `/api/booking/slots` bloque TOUT rendez-vous non annulé qui chevauche, sans
-- regarder `staff_id`. Le salon est donc déjà modélisé à capacité 1 : une
-- cliente à la fois. La contrainte reproduit exactement cette règle, pour que
-- la base ne refuse jamais un créneau que l'interface vient de proposer.
--
-- ⚠️ Le jour où MUSE voudra servir deux clientes en parallèle, il faudra
--    changer les DEUX ensemble : le calcul des créneaux ET cette contrainte
--    (en ajoutant `staff_id WITH =`).
-- ============================================================

create extension if not exists btree_gist;

-- ---------- 1. Une plage horaire immuable --------------------------------
--
-- Première version de ce script : `scheduled_at + make_interval(...)` écrit
-- directement dans la contrainte. Postgres l'a refusée — « functions in index
-- expression must be marked IMMUTABLE ». Une contrainte d'exclusion construit
-- un index, et un index n'accepte que des expressions immuables.
--
-- L'opérateur `timestamptz + interval` est déclaré STABLE parce qu'un
-- intervalle PEUT contenir des jours ou des mois, dont l'addition dépend du
-- calendrier et du fuseau de session (changements d'heure). Postgres est
-- conservateur : il ne sait pas, au moment de la déclaration, ce que
-- l'intervalle contiendra.
--
-- Ici il ne contient QUE des minutes. `make_interval(mins => 150)` produit
-- `02:30:00` — une durée absolue, sans composante calendaire. Le résultat est
-- donc parfaitement déterministe, quel que soit le fuseau.
--
-- Encapsuler l'expression dans une fonction déclarée IMMUTABLE n'est donc pas
-- un contournement : c'est déclarer une propriété qui est vraie sur ce
-- domaine d'entrée. Elle cesserait de l'être si on passait un jour un
-- intervalle en jours ou en mois — ne le faites pas.
create or replace function rdv_plage(p_debut timestamptz, p_minutes int)
returns tstzrange
language sql
immutable
parallel safe
as $$
  select tstzrange(
    p_debut,
    p_debut + make_interval(mins => coalesce(p_minutes, 60))
  )
$$;

comment on function rdv_plage(timestamptz, int) is
  'Plage occupée par un rendez-vous. IMMUTABLE : l''intervalle ne contient que des minutes, donc l''addition est absolue. Requise par la contrainte d''exclusion.';

-- ---------- 2. Repérer les chevauchements déjà en base --------------------
-- La contrainte échouerait s'il en existe. On refuse d'avancer et on le dit,
-- plutôt que de laisser Postgres renvoyer un message illisible.
do $$
declare
  v_nb int;
begin
  select count(*) into v_nb
  from appointments a
  join appointments b
    on a.id < b.id
   and a.status <> 'cancelled'
   and b.status <> 'cancelled'
   and rdv_plage(a.scheduled_at, a.duration_min)
    && rdv_plage(b.scheduled_at, b.duration_min);

  if v_nb > 0 then
    raise exception
      'Impossible d''ajouter la contrainte : % paire(s) de rendez-vous se chevauchent déjà. Lance la requête de diagnostic en fin de fichier, corrige-les, puis relance ce script.', v_nb;
  end if;
end $$;

-- ---------- 3. La contrainte ---------------------------------------------
-- `&&` = les deux plages se recoupent. Le WHERE laisse les rendez-vous
-- annulés libres de chevaucher : ils ne mobilisent personne.
alter table appointments
  drop constraint if exists appointments_pas_de_chevauchement;

alter table appointments
  add constraint appointments_pas_de_chevauchement
  exclude using gist (
    rdv_plage(scheduled_at, duration_min) with &&
  )
  where (status <> 'cancelled');

-- ---------- 4. Diagnostic (à lancer seul si l'étape 2 a échoué) ----------
-- select a.id as id_a, a.scheduled_at as debut_a, a.duration_min as duree_a, a.status as statut_a,
--        b.id as id_b, b.scheduled_at as debut_b, b.duration_min as duree_b, b.status as statut_b
-- from appointments a
-- join appointments b
--   on a.id < b.id
--  and a.status <> 'cancelled' and b.status <> 'cancelled'
--  and rdv_plage(a.scheduled_at, a.duration_min) && rdv_plage(b.scheduled_at, b.duration_min)
-- order by a.scheduled_at;
