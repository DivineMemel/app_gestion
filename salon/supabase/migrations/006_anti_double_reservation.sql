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
-- ensemble.
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
--    (en ajoutant `staff_id WITH =`, ce qui nécessite l'extension btree_gist).
-- ============================================================

create extension if not exists btree_gist;

-- ---------- 1. Repérer les chevauchements déjà en base --------------------
-- La contrainte échouerait s'il en existe. On les liste d'abord : à traiter
-- à la main, en annulant ou en déplaçant l'un des deux rendez-vous.
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
   and tstzrange(a.scheduled_at,
                 a.scheduled_at + make_interval(mins => a.duration_min)) &&
       tstzrange(b.scheduled_at,
                 b.scheduled_at + make_interval(mins => b.duration_min));

  if v_nb > 0 then
    raise exception
      'Impossible d''ajouter la contrainte : % paire(s) de rendez-vous se chevauchent déjà. Lance la requête de diagnostic en fin de fichier, corrige-les, puis relance ce script.', v_nb;
  end if;
end $$;

-- ---------- 2. La contrainte ---------------------------------------------
-- `&&` = les deux intervalles se recoupent. Le WHERE laisse les rendez-vous
-- annulés libres de chevaucher : ils ne mobilisent personne.
alter table appointments
  drop constraint if exists appointments_pas_de_chevauchement;

alter table appointments
  add constraint appointments_pas_de_chevauchement
  exclude using gist (
    tstzrange(scheduled_at, scheduled_at + make_interval(mins => duration_min)) with &&
  )
  where (status <> 'cancelled');

-- ---------- 3. Diagnostic (à lancer seul si l'étape 1 a échoué) ----------
-- select a.id, a.scheduled_at, a.duration_min, b.id, b.scheduled_at, b.duration_min
-- from appointments a
-- join appointments b
--   on a.id < b.id
--  and a.status <> 'cancelled' and b.status <> 'cancelled'
--  and tstzrange(a.scheduled_at, a.scheduled_at + make_interval(mins => a.duration_min)) &&
--      tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins => b.duration_min))
-- order by a.scheduled_at;
