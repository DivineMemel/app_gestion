-- ============================================================
-- Active RLS avec politiques publiques (read+write)
--
-- À RUNNER UNIQUEMENT si la clé publishable refuse de lire les tables
-- (status 401/403 ou data null malgré une ligne en DB).
--
-- Sécurité : pour l'instant, l'app n'a pas d'auth (un seul user — toi).
-- La clé publishable est exposée dans le navigateur, donc qui sait l'URL
-- peut déjà tout lire/écrire. On formalise juste avec des policies.
-- Quand on ajoutera l'auth multi-user (Phase 2), on durcira ces policies.
-- ============================================================

-- whatsapp_status : tout le monde peut lire/écrire
alter table whatsapp_status enable row level security;
drop policy if exists "public_all" on whatsapp_status;
create policy "public_all" on whatsapp_status
  for all using (true) with check (true);

-- categories
alter table categories enable row level security;
drop policy if exists "public_all" on categories;
create policy "public_all" on categories
  for all using (true) with check (true);

-- clients
alter table clients enable row level security;
drop policy if exists "public_all" on clients;
create policy "public_all" on clients
  for all using (true) with check (true);

-- messages
alter table messages enable row level security;
drop policy if exists "public_all" on messages;
create policy "public_all" on messages
  for all using (true) with check (true);

-- appointments
alter table appointments enable row level security;
drop policy if exists "public_all" on appointments;
create policy "public_all" on appointments
  for all using (true) with check (true);

-- push_subscriptions
alter table push_subscriptions enable row level security;
drop policy if exists "public_all" on push_subscriptions;
create policy "public_all" on push_subscriptions
  for all using (true) with check (true);

-- wa_auth_state : SEULEMENT le worker (service_role) — la clé publishable ne doit JAMAIS lire les credentials Baileys
alter table wa_auth_state enable row level security;
drop policy if exists "service_only" on wa_auth_state;
-- (pas de policy = personne ne peut accéder via anon/publishable ; service_role bypasse RLS)
