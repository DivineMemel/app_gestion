-- ============================================================
-- MIGRATION 006 — Anti-doublons (RDV + clients)
-- À lancer APRÈS 001 → 005, dans le SQL Editor Supabase.
--
-- Deux corrections, dans cet ordre :
--
--  1. RDV en double. `messages` est dédoublonné par `wa_message_id`, mais
--     l'insertion du rendez-vous ne l'était pas : WhatsApp redélivrant les
--     mêmes messages à chaque reconnexion (type 'append'), le même message
--     créait un RDV de plus à chaque passage. On nettoie l'existant puis on
--     pose un index unique sur `source_message_id` — le worker fait désormais
--     un upsert sur cette clé.
--
--  2. Clients en double. `clients.phone` stockait le jid WhatsApp complet.
--     Le même humain arrivait donc deux fois selon le format livré
--     ('225xxx@s.whatsapp.net' vs '225xxx:12@s.whatsapp.net'). On normalise
--     vers le numéro nu ('225xxx') en fusionnant les doublons.
--     Les jids '@lid' (pseudonymes WhatsApp, PAS des numéros) sont conservés
--     tels quels tant que le numéro réel n'a pas été résolu.
--
-- ⚠️ Cette migration SUPPRIME des lignes (RDV dupliqués, fiches clientes
--    fusionnées). Fais un backup Supabase avant de la lancer.
-- ============================================================

begin;

-- Helper de normalisation, supprimé en fin de migration.
create or replace function pilote_norm_phone(p text) returns text
language sql immutable as $$
  select case
    when p is null then null
    when p like '%@lid' then p
    else coalesce(
      nullif(regexp_replace(split_part(split_part(p, '@', 1), ':', 1), '\D', '', 'g'), ''),
      p
    )
  end
$$;

-- ---------- 1. RDV --------------------------------------------------------

-- Garde le plus ancien RDV par message source, supprime les copies.
delete from appointments a
where a.source_message_id is not null
  and exists (
    select 1 from appointments b
    where b.source_message_id = a.source_message_id
      and (b.created_at, b.id) < (a.created_at, a.id)
  );

-- La contrainte qui rend l'upsert du worker possible. Partielle : les RDV
-- créés à la main depuis l'app ont `source_message_id` à null et peuvent
-- évidemment être multiples.
create unique index if not exists appointments_source_message_uniq
  on appointments (source_message_id)
  where source_message_id is not null;

-- ---------- 2. Clients ----------------------------------------------------

-- Correspondance doublon → fiche conservée (la plus ancienne).
create temp table client_merge on commit drop as
with norm as (
  select id, pilote_norm_phone(phone) as np, created_at
  from clients
),
keep as (
  select distinct on (np) np, id as keep_id
  from norm
  order by np, created_at asc, id asc
)
select n.id as dup_id, k.keep_id
from norm n
join keep k on k.np = n.np;

-- Remonte les infos des doublons sur la fiche conservée AVANT de les
-- supprimer : sans `auto_reply_sent`, Eric renverrait le message d'accueil
-- à une cliente qui l'a déjà reçu.
update clients c set
  auto_reply_sent = agg.any_sent,
  last_seen_at    = greatest(c.last_seen_at, agg.max_seen),
  name            = coalesce(c.name, agg.any_name)
from (
  select m.keep_id,
         bool_or(cl.auto_reply_sent) as any_sent,
         max(cl.last_seen_at)        as max_seen,
         min(cl.name)                as any_name
  from client_merge m
  join clients cl on cl.id = m.dup_id
  group by m.keep_id
) agg
where c.id = agg.keep_id;

-- Repointer les FK AVANT le delete (clients → messages/appointments est en
-- `on delete cascade` : supprimer d'abord effacerait l'historique).
update messages m set client_id = cm.keep_id
from client_merge cm
where m.client_id = cm.dup_id and cm.dup_id <> cm.keep_id;

update appointments a set client_id = cm.keep_id
from client_merge cm
where a.client_id = cm.dup_id and cm.dup_id <> cm.keep_id;

delete from clients c
using client_merge cm
where c.id = cm.dup_id and cm.dup_id <> cm.keep_id;

-- Normalisation finale (les survivants ont des numéros distincts par
-- construction, donc pas de violation de la contrainte unique).
update clients
set phone = pilote_norm_phone(phone)
where phone is distinct from pilote_norm_phone(phone);

update messages
set from_phone = pilote_norm_phone(from_phone)
where from_phone is distinct from pilote_norm_phone(from_phone);

drop function pilote_norm_phone(text);

commit;
