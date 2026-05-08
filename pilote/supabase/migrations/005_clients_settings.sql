-- ============================================================
-- Settings de l'app (auto-réponse, etc.) + flags clients
-- ============================================================

create table if not exists app_settings (
  id int primary key default 1,
  auto_reply_enabled boolean default false,
  auto_reply_message text default
    'Bonjour ! Merci pour votre message. Je vous réponds dans les plus brefs délais.',
  business_name text,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

insert into app_settings (id) values (1) on conflict do nothing;

-- Flag pour ne pas spammer le même client avec l'auto-réponse
alter table clients
  add column if not exists auto_reply_sent boolean default false;

-- Realtime
alter publication supabase_realtime add table app_settings;
alter publication supabase_realtime add table clients;

-- RLS public (cohérent avec migration 004)
alter table app_settings enable row level security;
drop policy if exists "public_all" on app_settings;
create policy "public_all" on app_settings for all using (true) with check (true);
