-- ============================================================
-- MIGRATION 003 — Verrouillage RLS (sécurité prod)
-- À lancer APRÈS 001_init.sql et 002_sectors_accounting.sql.
--
-- Modèle : RLS ACTIVÉE partout, AUCUNE policy pour le rôle anon.
--   => la clé publishable (anon, exposée au navigateur) n'a aucun accès.
--
-- Tout l'accès aux données passe par des routes serveur en service_role
-- (qui bypass la RLS) :
--   - public : /api/booking/*   → lecture services/créneaux, création de RDV
--   - admin  : /api/admin/db    → CRUD complet, protégé par le cookie muse_admin
--
-- Remplace les `disable row level security` des migrations 001/002, qui
-- laissaient la base ouverte en lecture/écriture à quiconque possédait la
-- clé anon publique.
-- ============================================================

alter table salon_settings     enable row level security;
alter table services           enable row level security;
alter table staff              enable row level security;
alter table clients            enable row level security;
alter table appointments       enable row level security;
alter table products           enable row level security;
alter table sales              enable row level security;
alter table sale_items         enable row level security;
alter table sectors            enable row level security;
alter table categories         enable row level security;
alter table expense_categories enable row level security;
alter table expenses           enable row level security;
alter table client_events      enable row level security;
