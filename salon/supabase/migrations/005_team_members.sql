-- ============================================================
-- MIGRATION 005 — Comptes & rôles (équipe avec accès admin)
-- À lancer APRÈS 004_gallery.sql.
--
-- Comptes de connexion à l'admin, distincts de la table `staff`
-- (qui décrit les stylistes affichés sur la vitrine).
-- Rôles : owner (propriétaire) / manager (gérante) / employee (employée).
-- À l'inscription, le compte est `pending` : aucun accès tant que le
-- propriétaire ne l'a pas passé `active` depuis la page Comptes.
-- ============================================================

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  password_hash text not null,
  role text not null default 'employee' check (role in ('owner', 'manager', 'employee')),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  created_at timestamptz default now()
);

create index if not exists team_members_status_idx on team_members(status);

-- RLS verrouillée comme le reste : accès uniquement via service_role
-- (route /api/admin/db, réservée au propriétaire pour cette table).
alter table team_members enable row level security;
