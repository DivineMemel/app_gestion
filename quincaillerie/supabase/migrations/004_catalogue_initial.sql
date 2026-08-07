-- ============================================================
-- NADAL SERVICES — Catalogue initial
-- À lancer APRÈS 001, 002 et 003.
--
-- ⚠️ LES PRIX SONT À ZÉRO et les articles sont créés INACTIFS.
--
-- Je ne connais pas vos tarifs : les inventer serait pire que de les laisser
-- vides, parce qu'un prix plausible mais faux se vend sans que personne ne le
-- remarque. Les articles sont donc désactivés — ils n'apparaissent ni en
-- caisse ni sur la vitrine, mais sont visibles dans /admin/produits.
--
-- Marche à suivre : ouvrir chaque fiche, saisir le prix de vente (et le prix
-- d'achat si tu veux la marge), cocher « Actif en caisse », puis « Visible sur
-- la boutique » pour ceux qui méritent une photo et une place en vitrine.
--
-- Le script est idempotent : le relancer n'écrase rien et ne duplique rien.
-- ============================================================

-- Un rayon manquait pour la serrurerie.
insert into categories (name, slug, position) values
  ('Serrurerie & sécurité', 'serrurerie', 12)
on conflict (slug) do nothing;

-- ---------- Articles ------------------------------------------------------
-- base_unit = l'unité dans laquelle le stock est compté.
insert into products (sku, name, description, category_id, base_unit, min_stock, active, published)
select v.sku, v.name, v.description,
       (select id from categories where slug = v.rayon),
       v.unite, v.seuil, false, false
from (values
  -- Assainissement
  ('FOS-BIODIG',  'Fosse biodigesteur',                 'Cuve biodigesteur préfabriquée, traitement autonome des eaux usées.', 'fosse-septique', 'unité', 1::numeric),
  ('FOS-SEPT',    'Fosse septique classique',           'Fosse septique traditionnelle en béton.',                              'fosse-septique', 'unité', 1),
  ('FOS-BIOFIL',  'Fosse Biofil',                       'Système Biofil — digesteur compact à filtration.',                     'fosse-septique', 'unité', 1),
  ('FOS-REGFONT', 'Couvercle de regard en fonte ductile','Tampon de regard en fonte ductile, résistant au passage véhicule.',   'fosse-septique', 'pièce', 4),

  -- Décoration
  ('DEC-MOULB',   'Moulure blanche',                    'Moulure décorative blanche pour corniche et encadrement.',             'decoration', 'pièce', 20),
  ('DEC-MOULBD',  'Moulure blanche à bordure dorée',    'Moulure décorative blanche rehaussée d''un liseré doré.',              'decoration', 'pièce', 20),
  ('DEC-COLMOUL', 'Colle pour moulures',                'Colle de fixation pour moulures et corniches décoratives.',            'decoration', 'pot',   10),

  -- Serrurerie & sécurité
  ('SER-CARTE',   'Serrure à carte',                    'Serrure à badge/carte, pour porte d''hôtel ou de bureau.',             'serrurerie', 'pièce', 3),
  ('SER-INTEL',   'Serrure intelligente',               'Serrure connectée : code, empreinte ou téléphone.',                    'serrurerie', 'pièce', 3),

  -- Sanitaire
  ('SAN-WCINTEL', 'WC intelligent',                     'WC connecté avec abattant chauffant et lavage intégré.',               'sanitaire', 'ensemble', 2),
  ('SAN-SIPHMOD', 'Siphon de douche moderne',           'Siphon de sol design, grille inox.',                                   'sanitaire', 'pièce', 6),

  -- Électricité
  ('ELE-INTERR',  'Interrupteur',                       null,                                                                   'electricite', 'pièce', 30),
  ('ELE-PRISEPVC','Prise moderne PVC',                  'Prise encastrable PVC, finition moderne.',                             'electricite', 'pièce', 30),

  -- Outillage
  ('OUT-LASER',   'Laser de chantier',                  'Niveau laser rotatif pour implantation et nivellement.',               'outillage', 'pièce', 2)
) as v(sku, name, description, rayon, unite, seuil)
on conflict (sku) do nothing;

-- ---------- Unités de vente ----------------------------------------------
-- Prix à 0 : à renseigner dans /admin/produits avant d'activer l'article.
insert into product_units (product_id, label, factor, price_xof, is_default, position)
select p.id, v.label, v.facteur, 0, v.defaut, v.position
from (values
  ('FOS-BIODIG',  'unité',         1::numeric, true,  0),
  ('FOS-SEPT',    'unité',         1,          true,  0),
  ('FOS-BIOFIL',  'unité',         1,          true,  0),
  ('FOS-REGFONT', 'pièce',         1,          true,  0),

  ('DEC-MOULB',   'pièce',         1,          true,  0),
  ('DEC-MOULB',   'paquet de 10',  10,         false, 1),
  ('DEC-MOULBD',  'pièce',         1,          true,  0),
  ('DEC-MOULBD',  'paquet de 10',  10,         false, 1),
  ('DEC-COLMOUL', 'pot',           1,          true,  0),

  ('SER-CARTE',   'pièce',         1,          true,  0),
  ('SER-INTEL',   'pièce',         1,          true,  0),

  ('SAN-WCINTEL', 'ensemble',      1,          true,  0),
  ('SAN-SIPHMOD', 'pièce',         1,          true,  0),

  ('ELE-INTERR',  'pièce',         1,          true,  0),
  ('ELE-INTERR',  'boîte de 10',   10,         false, 1),
  ('ELE-PRISEPVC','pièce',         1,          true,  0),
  ('ELE-PRISEPVC','boîte de 10',   10,         false, 1),

  ('OUT-LASER',   'pièce',         1,          true,  0)
) as v(sku, label, facteur, defaut, position)
join products p on p.sku = v.sku
on conflict (product_id, label) do nothing;

-- ---------- Contrôle ------------------------------------------------------
-- À la fin du script, la console doit afficher 14 articles à activer.
select count(*) as articles_a_completer
from products
where not active and sku in (
  'FOS-BIODIG','FOS-SEPT','FOS-BIOFIL','FOS-REGFONT',
  'DEC-MOULB','DEC-MOULBD','DEC-COLMOUL',
  'SER-CARTE','SER-INTEL',
  'SAN-WCINTEL','SAN-SIPHMOD',
  'ELE-INTERR','ELE-PRISEPVC','OUT-LASER'
);
