-- ============================================================
-- NADAL MULTISERVICES — Mot de passe oublié
-- À lancer APRÈS 001 → 011. Idempotente.
--
-- Jusqu'ici, un employé qui perdait son mot de passe n'avait qu'une issue :
-- déranger le patron pour qu'il lui en pose un provisoire depuis Comptes. Et
-- le patron lui-même, s'il perdait le sien, dépendait du mot de passe de
-- secours en variable d'environnement — donc de quelqu'un qui a accès à
-- Vercel. Cette table ouvre le chemin autonome : un lien à usage unique,
-- envoyé par e-mail, valable une heure.
--
-- Deux décisions à retenir :
--
--  · On stocke l'EMPREINTE du jeton, jamais le jeton. Une fuite de cette
--    table (sauvegarde, capture d'écran du SQL editor) ne permet donc pas de
--    prendre la main sur un compte : sha256 ne se remonte pas.
--
--  · `used_at` plutôt qu'un DELETE. Un lien consommé reste visible une
--    semaine : c'est ce qui permet de répondre à « quelqu'un a changé mon mot
--    de passe hier » autrement qu'en haussant les épaules.
-- ============================================================

create table if not exists password_resets (
  token_hash   text primary key,          -- sha256 hex du jeton envoyé par mail
  member_id    uuid not null references team_members(id) on delete cascade,
  email        text not null,             -- tel que saisi : trace même si la fiche change
  expires_at   timestamptz not null,
  used_at      timestamptz,
  requested_ip text,
  created_at   timestamptz not null default now()
);

-- Une demande annule les précédentes : on cherche donc toujours les jetons
-- encore vivants d'un membre donné.
create index if not exists password_resets_member_idx
  on password_resets (member_id) where used_at is null;

create index if not exists password_resets_expires_idx
  on password_resets (expires_at);

-- Aucune policy : RLS activée sans policy = table fermée à anon comme à
-- authenticated. Seul le service_role, côté serveur, y touche.
alter table password_resets enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on password_resets from %I', r);
    else
      raise notice 'rôle % absent — retrait de privilèges ignoré (base hors Supabase)', r;
    end if;
  end loop;
end $$;

-- Purge : les jetons périmés ou consommés n'ont plus d'intérêt passé une
-- semaine. Même logique que purge_auth_throttle().
create or replace function purge_password_resets() returns void
language sql as $$
  delete from password_resets
   where created_at < now() - interval '7 days';
$$;

-- ============================================================
insert into schema_migrations (version) values ('012_mot_de_passe_oublie')
on conflict (version) do nothing;
