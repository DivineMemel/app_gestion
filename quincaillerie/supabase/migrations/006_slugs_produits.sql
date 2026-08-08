-- ============================================================
-- NADAL SERVICES — Adresse web par produit
-- À lancer APRÈS 001 → 005.
--
-- Aujourd'hui tout le catalogue tient sur /catalogue : Google n'a qu'UNE page
-- à indexer pour trente articles. Quelqu'un qui cherche « fosse biodigesteur
-- prix Abidjan » ne peut pas tomber dessus, parce qu'aucune page ne parle
-- spécifiquement de ce produit.
--
-- On donne donc à chaque article sa propre adresse lisible :
--   /produit/fosse-biodigesteur
-- plutôt que /produit/FOS-BIODIG, illisible pour un humain comme pour Google.
-- ============================================================

-- ---------- Fabrication du slug -----------------------------------------
-- `unaccent` n'est pas garanti disponible : on translitère les accents
-- français à la main, ce qui suffit largement pour des noms d'articles.
create or replace function slugifier(p_texte text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from
      regexp_replace(
        lower(translate(
          coalesce(p_texte, ''),
          'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ',
          'aaaaaaceeeeiiiinooooouuuuyyoa'
        )),
        '[^a-z0-9]+', '-', 'g'
      )
    ),
    ''
  )
$$;

alter table products add column if not exists slug text;

-- ---------- Attribution, avec gestion des doublons ----------------------
-- Deux articles peuvent porter des noms qui donnent le même slug (« Moulure
-- blanche » et « moulure  blanche »). Le premier garde le slug nu, les
-- suivants reçoivent leur référence en suffixe — stable et prévisible.
with candidats as (
  select
    id,
    coalesce(slugifier(name), 'article') as base,
    slugifier(sku) as ref,
    row_number() over (
      partition by coalesce(slugifier(name), 'article')
      order by created_at, id
    ) as rang
  from products
  where slug is null
)
update products p
   set slug = case
                when c.rang = 1 then c.base
                when c.ref is not null then c.base || '-' || c.ref
                else c.base || '-' || c.rang
              end
  from candidats c
 where p.id = c.id;

create unique index if not exists products_slug_uniq on products (slug);

-- ---------- Slug automatique à la création -------------------------------
-- Sans ça, un article créé depuis l'admin naîtrait sans adresse web et
-- resterait invisible du catalogue public.
--
-- Un slug déjà attribué n'est JAMAIS réécrit, même si l'article est renommé :
-- une adresse web est permanente. La changer casserait les liens partagés et
-- ferait repartir de zéro le référencement acquis sur cette page. Corriger une
-- faute de frappe dans un nom ne doit pas coûter ça.
create or replace function produits_slug_auto()
returns trigger
language plpgsql
as $$
declare
  v_base text;
  v_slug text;
  v_n    int := 1;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;

  v_base := coalesce(slugifier(new.name), 'article');
  v_slug := v_base;

  -- Boucle de désambiguïsation : -2, -3… jusqu'à trouver libre.
  while exists (select 1 from products where slug = v_slug and id <> new.id) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  new.slug := v_slug;
  return new;
end $$;

drop trigger if exists trg_produits_slug on products;
create trigger trg_produits_slug
  before insert or update on products
  for each row execute function produits_slug_auto();

-- ---------- Contrôle ------------------------------------------------------
select count(*) as produits_sans_slug from products where slug is null;
