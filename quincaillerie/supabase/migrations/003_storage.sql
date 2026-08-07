-- ============================================================
-- NADAL SERVICES — Stockage des images
-- À lancer APRÈS 001_init.sql et 002_appro_inventaire.sql.
--
-- Les images ne sont PAS stockées en base.
--
-- Une photo de produit pèse 1 à 5 Mo. Les mettre en `bytea` dans Postgres
-- coûterait cher sur tous les plans :
--   · le quota Supabase est de 500 Mo de base contre 1 Go de stockage — on
--     saturerait la base avant le stockage ;
--   · chaque lecture passerait par le pool de connexions, en concurrence avec
--     la caisse ;
--   · les sauvegardes deviendraient lentes et volumineuses ;
--   · aucun CDN, aucun redimensionnement, aucun cache HTTP.
--
-- On utilise donc Supabase Storage — de l'objet, servi par CDN — et la base ne
-- garde que l'URL dans `products.image_url` / `categories.image_url`.
-- L'upload transite par /api/admin/upload, en service_role, avec contrôle du
-- type MIME, de la taille et du rôle appelant.
-- ============================================================

-- Bucket public : les images du catalogue sont destinées à la vitrine.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

-- Lecture publique des fichiers du bucket. L'écriture n'a aucune policy :
-- elle est donc impossible avec la clé publique, et ne passe que par le
-- service_role de la route d'upload.
drop policy if exists "media_lecture_publique" on storage.objects;
create policy "media_lecture_publique"
  on storage.objects for select
  using (bucket_id = 'media');
