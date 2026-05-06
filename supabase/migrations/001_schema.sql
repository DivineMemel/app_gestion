-- ============================================================
-- Schema for Eric's WhatsApp management tool
-- ============================================================

-- Categories: Eric peut en ajouter / modifier dynamiquement
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,           -- ex: 'fosse_septique', 'decoration'
  label text not null,                 -- affichage : 'Fosse septique'
  description text,                    -- aide pour la classification IA
  color text default '#6366f1',
  active boolean default true,
  created_at timestamptz default now()
);

-- Categories par défaut
insert into categories (slug, label, description, color) values
  ('fosse_septique', 'Fosse septique', 'Vidange, débouchage, intervention sur fosse septique ou canalisation', '#0ea5e9'),
  ('decoration', 'Décoration', 'Décoration événementielle, salon, mariage, anniversaire, image du lieu', '#ec4899'),
  ('autre', 'Autre', 'Tout ce qui ne rentre pas dans les autres catégories', '#64748b')
on conflict (slug) do nothing;

-- Clients : un par numéro WhatsApp
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,          -- format: '237xxx@s.whatsapp.net'
  name text,                           -- nom WhatsApp (push name) si dispo
  notes text,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now()
);

-- Messages reçus
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  wa_message_id text unique,           -- id WhatsApp pour éviter doublons
  client_id uuid references clients(id) on delete cascade,
  from_phone text not null,
  body text,
  has_media boolean default false,
  media_type text,                     -- 'image' | 'audio' | 'video' | 'document'
  media_url text,                      -- url Supabase Storage si stocké
  category_id uuid references categories(id),
  intent text,                         -- 'rdv' | 'demande_info' | 'envoi_image' | 'autre'
  priority int default 3,              -- 1 (urgent) à 5 (faible)
  ai_summary text,                     -- résumé court généré par l'IA
  status text default 'nouveau',       -- 'nouveau' | 'lu' | 'traite' | 'ignore'
  received_at timestamptz default now()
);

create index if not exists messages_status_priority_idx
  on messages(status, priority, received_at desc);
create index if not exists messages_client_idx on messages(client_id);

-- Rendez-vous (planifiés à partir des messages)
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  category_id uuid references categories(id),
  title text not null,
  address text,
  scheduled_at timestamptz not null,
  duration_minutes int default 60,
  notes text,
  status text default 'planifie',      -- 'planifie' | 'confirme' | 'fait' | 'annule'
  source_message_id uuid references messages(id),
  created_at timestamptz default now()
);

create index if not exists appointments_scheduled_idx
  on appointments(scheduled_at);

-- État de connexion WhatsApp + QR code temporaire
create table if not exists whatsapp_status (
  id int primary key default 1,        -- une seule ligne
  qr_code text,                        -- QR à afficher dans l'app (data-url)
  connected boolean default false,
  phone text,                          -- numéro lié
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
insert into whatsapp_status (id) values (1) on conflict do nothing;

-- Stockage des credentials Baileys (pour reconnexion sans re-scan)
-- On stocke chaque "fichier" Baileys comme une ligne (clé-valeur).
create table if not exists wa_auth_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- ============================================================
-- Realtime : exposer les tables que le front écoute
-- ============================================================
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table appointments;
alter publication supabase_realtime add table whatsapp_status;

-- ============================================================
-- RLS minimal (un seul user — Eric — donc on garde ça simple)
-- Pour démarrer : on désactive RLS, le worker utilise service_role
-- et le web utilise anon. À durcir plus tard si besoin.
-- ============================================================
alter table categories disable row level security;
alter table clients disable row level security;
alter table messages disable row level security;
alter table appointments disable row level security;
alter table whatsapp_status disable row level security;
alter table wa_auth_state disable row level security;
