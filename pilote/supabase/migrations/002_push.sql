-- ============================================================
-- Web Push subscriptions (alertes RDV)
-- ============================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now()
);

-- On marque les RDV pour lesquels on a déjà envoyé une alerte,
-- pour éviter les doublons.
alter table appointments
  add column if not exists reminded_30min boolean default false,
  add column if not exists reminded_morning boolean default false;

alter table push_subscriptions disable row level security;
