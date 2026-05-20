-- ============================================================
-- MIGRATION 004 — Galerie photo de la vitrine
-- À lancer APRÈS 003_lock_rls.sql.
-- ============================================================

create table if not exists gallery_images (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  caption text,
  tag text,                       -- ex: 'Tresses', 'Couleur', 'Manucure'
  display_order int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists gallery_active_order_idx
  on gallery_images(active, display_order);

-- Même modèle de sécurité que le reste : RLS activée, aucune policy anon.
-- L'accès passe par les routes serveur en service_role (vitrine + admin).
alter table gallery_images enable row level security;
