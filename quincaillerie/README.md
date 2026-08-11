# NADAL MULTISERVICES — SaaS de gestion

Vitrine + commande en ligne + back-office complet pour NADAL MULTISERVICES
(Bingerville, Abidjan) : staff-plomberie, décoration intérieure, fosse septique
biodigesteur et vente de matériaux décoratifs.

Caisse, stock, ardoises, devis de chantier, fournisseurs, comptabilité.

## Direction artistique

D'après la charte. Le logo pose deux couleurs, on leur donne des rôles
distincts plutôt que de les alterner :

- **Bleu `#1D4E9B`** → structure et action. Boutons, liens, nav active. Il
  porte le texte : sur fond clair il tient le contraste, l'orange non.
- **Orange `#EF9A1A`** → énergie et vigilance. Aplats seulement : bandeau de
  chantier, engrenage du sigle, encadrés d'alerte. Jamais en petit texte.

Le reste tient au terrain : contraste fort, cibles tactiles larges, champs
pleins (une hairline élégante devient illisible en plein soleil), chiffres
tabulaires partout. Typo : Barlow Condensed (signalétique) + Inter (texte) +
JetBrains Mono (références et montants).

Le sigle est redessiné en SVG — net à toutes les tailles, suit le thème
clair/sombre. Un vrai fichier logo peut le remplacer via Paramètres.

## Architecture

```
Vitrine publique                    Back-office
  /                 landing           /admin              tableau de bord
  /catalogue        par rayon         /admin/caisse       POS
  /commander        panier + retrait  /admin/ventes       tickets, annulation
                                      /admin/commandes    commandes en ligne
                                      /admin/devis        devis → vente
                                      /admin/clients      fiches + ardoises
                                      /admin/produits     unités multiples
                                      /admin/stock        mouvements
                                      /admin/fournisseurs
                                      /admin/achats       bons de commande
                                      /admin/depenses
                                      /admin/comptabilite
                                      /admin/comptes      rôles
                                      /admin/journal      audit
                                      /admin/parametres
```

## Modèle de données — les cinq décisions

1. **Le stock est un grand livre.** `stock_movements` est la seule écriture ;
   `products.stock_qty` en est le solde, maintenu par trigger. Un mouvement ne
   se **modifie** pas : on le contre-passe. Il peut en revanche être supprimé
   (erreur de saisie du jour), et le trigger rembobine alors le solde pour
   qu'il reste exact — c'est le journal d'audit, pas le grand livre, qui garde
   la trace de la suppression.

2. **Tout est stocké en unité de base.** Un produit se vend au sac ou à la
   palette, à la barre ou à la botte : chaque unité de vente (`product_units`)
   porte son facteur de conversion. Le stock ne connaît qu'une seule unité.

3. **Une vente encaissée génère toujours un règlement.** Le solde d'un client
   est donc « total acheté − total réglé », au comptant comme à l'ardoise. Pas
   de cas particulier, pas de colonne à resynchroniser. Le **plafond d'ardoise**
   (`customers.credit_limit_xof`) est appliqué dans `create_sale` sur l'encours
   *cumulé* — le contrôler vente par vente laisserait empiler les petites
   ardoises jusqu'à faire exploser le plafond. Le réglage
   `enforce_credit_limit` permet au patron de lever la règle.

4. **Les montants sont des entiers en francs CFA.** Le XOF n'a pas de
   centimes ; un float n'apporterait que des erreurs d'arrondi.

5. **Les quantités sont en `numeric`.** On vend du sable au m³ et de la
   peinture au litre, pas seulement des vis à l'unité.

### Approvisionnement : saisie ≠ valorisation

Deux chemins pour faire entrer de la marchandise :

- **Commandes fournisseur** (`/admin/achats`) — on commande, puis on réceptionne.
- **Arrivages** (`/admin/appro`) — la marchandise arrive sans commande préalable.

L'arrivage sépare deux gestes qui, sur le terrain, sont faits par deux personnes
différentes : celui qui réceptionne compte des sacs, celui qui connaît le prix
payé n'est pas au dépôt.

Le stock entre dès la **saisie** — la marchandise est physiquement là, la nier
jusqu'à connaître son prix rendrait le stock faux. Le coût n'est mis à jour
qu'à la **valorisation**, réservée aux rôles qui ont le droit de voir les prix
d'achat (`canSeeCosts`). Le magasinier ne peut donc pas valoriser : ce n'est pas
un interdit arbitraire, il n'a simplement pas l'information.

Un prix valorisé s'applique **aux ventes à venir**. Les ventes déjà passées
gardent le coût qu'elles ont figé — sinon les marges des mois clos changeraient
rétroactivement.

### Inventaire

`/admin/inventaire` ouvre une **campagne** : la liste des articles est figée, on
compte, on regarde les écarts, on valide. Chaque écart devient un mouvement dans
le grand livre.

- Un article laissé vide n'est **pas** un article à zéro : il n'est pas touché.
- L'ajustement est calculé sur le stock au moment de la validation, donc après
  validation le stock vaut exactement ce qui a été compté. Corollaire : une
  vente saisie pendant le comptage serait absorbée par l'écart — on inventorie
  boutique fermée.
- Le périmètre est limitable à un rayon : compter toute la boutique d'un coup
  n'est pas réaliste.

### Opérations atomiques

Dix fonctions Postgres : `create_sale`, `cancel_sale`,
`receive_purchase_order`, `convert_order_to_sale`, `convert_quote_to_sale`,
`post_supply_entry`, `value_supply_entry`, `cancel_supply_entry`,
`open_stock_count`, `validate_stock_count`.

Elles touchent chacune plusieurs tables — vente, lignes, mouvements de stock,
règlement. Les exécuter en plusieurs allers-retours laisserait, à la moindre
coupure réseau, un stock décrémenté sans vente en face.

## Sécurité

- **RLS activée partout, aucune policy pour `anon`.** La clé publique exposée
  au navigateur ne lit rien. Les **vues** sont en `security_invoker` et les
  droits d'`anon` sont retirés du schéma : sans ça, une vue appartient à
  `postgres`, qui a `BYPASSRLS` chez Supabase, et le P&L comme les ardoises
  redeviennent lisibles par-dessous la RLS.
- Tout passe par des routes serveur en `service_role` : `/api/admin/db` et
  `/api/admin/rpc` pour le back-office, `/api/orders` et les server components
  pour la vitrine.
- **RBAC à quatre rôles** défini une seule fois dans `lib/permissions.ts`,
  appliqué à l'UI *et* revalidé sur chaque requête serveur.
- **Liste blanche de colonnes** (`lib/db-schema.ts`). La chaîne `select` n'est
  jamais transmise telle quelle à PostgREST : elle est analysée puis réécrite
  à partir des colonnes déclarées. PostgREST y résout les jointures par clé
  étrangère — laisser passer `select` revient à exposer, depuis n'importe
  quelle table, toutes les tables voisines.
- Les **colonnes de coût** (prix d'achat, marge) sont retirées des réponses
  pour vendeur et magasinier, **y compris dans une table jointe**.
- Certaines colonnes sont **réservées en écriture** : un vendeur peut modifier
  une fiche client mais pas son plafond d'ardoise — sinon il lui suffirait de
  le relever avant d'encaisser à crédit.
- L'identité de l'opérateur (`sold_by`) vient toujours de la session, jamais
  du corps de la requête.
- Les **cookies portent un jeton signé**, jamais un secret en clair. `qc_admin`
  contenait auparavant la valeur d'`ADMIN_TOKEN`, qui était aussi la clé de
  signature HMAC : le lire une fois donnait de quoi forger une session pour
  n'importe quel membre. Le secret est désormais `SESSION_SECRET`, distinct et
  jamais transmis.
- **Frein anti-force brute** sur `/api/admin/login`, compté en base par e-mail
  et par IP. Un délai fixe ne freinait rien : mille requêtes parallèles
  attendaient chacune 500 ms dans leur coin.
- **Journal d'audit** (`audit_log`) : toute mutation passée par
  `/api/admin/db` est tracée avec son auteur. `stock_movements` racontait
  l'histoire de la marchandise, pas celle des décisions.
- Sur `/api/orders`, les prix sont relus en base : le navigateur n'envoie que
  des identifiants et des quantités.

### Rôles

| Rôle | Accès |
|---|---|
| `patron` | Tout, y compris comptes, réglages, marges et prix d'achat |
| `gerant` | Tout le quotidien, sauf comptes et réglages |
| `vendeur` | Caisse, clients, devis, commandes. Ni marge ni prix d'achat |
| `magasinier` | Stock, produits, réceptions. Pas d'accès à la caisse |

**Une personne peut porter plusieurs rôles**, et ses droits en sont l'**union**.
C'est le cas courant dans une quincaillerie de quartier : celui qui tient la
caisse le matin réceptionne les camions l'après-midi. Avec un rôle unique il
fallait choisir entre le priver d'un écran dont il a besoin, ou lui donner
« gérant » — et donc les marges.

Additionner deux rôles ne crée jamais un droit que ni l'un ni l'autre ne
donnait : un `vendeur` + `magasinier` tient la caisse et reçoit les livraisons,
sans jamais voir un prix d'achat. Un test parcourt exhaustivement toutes les
paires de rôles et toutes les tables pour le vérifier.

`team_members.roles` est la source de vérité. `team_members.role`, au
singulier, subsiste comme colonne **dérivée** — le rôle le plus élevé, maintenu
par déclencheur — pour l'affichage court et la compatibilité. Elle n'est jamais
modifiable directement.

## Mode démonstration

Tant que `NEXT_PUBLIC_SUPABASE_URL` est vide, l'app bascule automatiquement sur
un moteur local (`lib/demo-store.ts`) alimenté par `lib/demo-data.ts` : 37
articles NADAL avec leurs unités de vente, 5 clients, 4 fournisseurs, un
historique de ventes, deux devis et deux commandes en ligne.

Ce moteur rejoue en JavaScript les règles que le schéma applique en base — le
stock passe par un grand livre, une vente encaissée génère son règlement, les
vues sont recalculées à la volée. Le but n'est pas de simuler Postgres, mais
que le comportement à l'écran soit le même avant et après le branchement.

Les données vivent dans le `localStorage` du navigateur : une vente survit au
rechargement, rien n'est partagé entre appareils. Un bandeau orange le rappelle
en permanence dans l'admin, avec un bouton de remise à zéro — dans un outil de
caisse, confondre un jeu d'essai avec le vrai stock coûterait cher.

Renseigner les trois variables Supabase suffit à repasser en base réelle,
sans toucher une ligne de code.

## Setup

### 1. Supabase

1. Créer un projet **dédié** (ne pas réutiliser celui d'Agenda ou de MUSE).
2. SQL Editor → passer les migrations **dans l'ordre**, une par une, de
   `001_init.sql` à `010_nadal_multiservices.sql`.
3. Créer un bucket Storage **public** nommé `media`.
4. Project Settings → API → récupérer l'URL, la clé publique et la clé secrète.

Ce qui a réellement été appliqué se lit dans la table `schema_migrations` :

```sql
select version, applied_at from schema_migrations order by version;
```

C'est le minimum quand les migrations passent à la main. Sur une base déjà en
service, `007` enregistre `001` → `006` rétroactivement.

### Tests

```bash
cd quincaillerie/web && npm test        # liste blanche, sessions, permissions
```

Les opérations atomiques se testent contre une vraie base — elles sont
écrites en PL/pgSQL, aucun test JavaScript ne les couvre :

```bash
psql "$DATABASE_URL" -f supabase/tests/rpc_test.sql
psql "$DATABASE_URL" -f supabase/tests/offline_test.sql
psql "$DATABASE_URL" -f supabase/tests/roles_test.sql
```

Le script se termine par un `ROLLBACK` : il ne laisse rien derrière lui, et
peut donc tourner sur une base de recette. Pas sur la production, tant qu'à
faire — les séquences de numérotation, elles, ne se rembobinent pas.

### 2. Web

```bash
cd quincaillerie/web
cp .env.example .env.local   # puis remplir les 3 variables Supabase
npm install
npm run dev
```

`ADMIN_PASSWORD` ouvre un accès patron même sans aucun compte en base : c'est
le bootstrap. Les autres comptes se créent via `/admin/register` puis se
valident depuis `/admin/comptes`.

### 3. Notifications push (facultatif)

```bash
npx web-push generate-vapid-keys
```

Clé publique → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, privée → `VAPID_PRIVATE_KEY`.
Sans ces clés, la fonctionnalité est simplement inactive — rien ne casse.

## État

| Module | État |
|---|---|
| Schéma complet + RPC atomiques | ✅ |
| Sécurité RLS / RBAC / sessions | ✅ |
| Tableau de bord | ✅ |
| Caisse (unités multiples, crédit, ticket) | ✅ |
| Ventes : historique, réimpression, annulation | ✅ |
| Commandes en ligne → retrait → vente | ✅ |
| Devis → vente, sortie A4 imprimable | ✅ |
| Clients & ardoises | ✅ |
| Produits & unités de vente | ✅ |
| Stock & mouvements | ✅ |
| Fournisseurs | ✅ |
| Réappro : bons de commande & réception | ✅ |
| Dépenses | ✅ |
| Comptabilité (P&L, marge, top ventes) | ✅ |
| Comptes & rôles (rôles multiples) | ✅ |
| Journal d'audit (écriture + consultation) | ✅ |
| Paramètres | ✅ |
| Vitrine + catalogue + commande | ✅ |
| Push (service worker, abonnement, envoi) | ✅ |
| Caisse hors ligne (file locale, rejeu idempotent) | ✅ |

Tous les modules sont livrés. Reste à créer le projet Supabase et à passer les
migrations pour que l'app ait des données.

## Caisse hors ligne

Quand le réseau tombe à Bingerville, la caisse continue. Elle seule : le stock,
la comptabilité et les devis affichés depuis le cache d'hier seraient faux sans
le dire, et la caisse est le seul écran dont l'indisponibilité arrête la
boutique.

**Ce qui se passe.** Le service worker garde l'écran de caisse, IndexedDB garde
une photo du catalogue, et les ventes encaissées partent dans une file locale
rejouée dès le retour du réseau. Un bandeau permanent indique la date de la
dernière synchronisation — vendre à des prix périmés sans le savoir serait pire
que ne pas vendre.

**Les quatre décisions.**

1. **Le numéro de ticket ne change pas.** `V-2026-00042` reste attribué par la
   séquence Postgres. Une vente hors ligne imprime `HORS LIGNE 3F7K2A`, marqué
   comme tel : personne ne repart avec un faux numéro définitif. La clé
   technique `sales.client_ref` est invisible du client.

2. **Rejouer une vente ne l'encaisse pas deux fois.** `client_ref` porte une
   contrainte d'unicité et `create_sale` renvoie la vente existante si elle la
   reconnaît. C'est ce qui rend une file d'attente sûre — un rejeu *se
   produira*, c'est le principe.

3. **Le stock peut passer en négatif, et ça se voit.** Deux postes déconnectés
   vendent le dernier sac : les deux passent. La marchandise est sortie, la
   nier rendrait le stock faux dans l'autre sens. L'écart remonte dans
   `v_stock_negatif` et s'affiche en tête de `/admin/stock`.

4. **Pas de crédit hors ligne.** Le plafond d'ardoise se calcule sur l'encours
   réel, que la caisse déconnectée ignore. Refuser à la synchronisation
   arriverait après le départ de la marchandise : on refuse au comptoir,
   pendant que le client est encore là. Comptant uniquement.

**L'heure du comptoir, pas celle de la synchronisation.** `sold_at` est
transmis par la caisse — sinon une vente de mardi 16 h synchronisée mercredi
tomberait dans la recette de mercredi. La valeur est bornée : une tablette
déréglée ne peut pas dater une vente de l'an prochain.

**Une vente refusée par le serveur ne se rejoue pas en boucle.** Une panne
réseau se réessaie indéfiniment ; un refus métier (« produit introuvable »)
est mis de côté et signalé, parce qu'il ne s'arrangera jamais tout seul.

**Les photos du catalogue sont mises en cache elles aussi.** Elles vivent dans
Supabase Storage, donc sur une autre origine, mais transitent par
`/_next/image` — le service worker les garde là. Au comptoir, la photo est
souvent ce qui permet de reconnaître un article plus vite que son nom. Le cache
est plafonné à 400 images ; un remplacement de photo produit un nouveau nom de
fichier, donc une image en cache ne peut jamais devenir la mauvaise.

**Ce que la déconnexion efface, et ce qu'elle garde.** Trois catégories, trois
traitements :

| | Effacé à la déconnexion ? | Pourquoi |
|---|---|---|
| Liste des clients | **Oui** | Noms, téléphones, plafonds — données personnelles, et un comptoir change de mains. |
| Catalogue, prix, photos | Non | Publics sur la vitrine : les effacer ne protège rien, et laisserait la caisse muette le lendemain matin si le réseau est tombé. |
| File des ventes | **Jamais** | Elle contient de l'argent encaissé qui n'est pas encore parti au serveur. |

**Ce qui reste local à l'appareil.** La file appartient au poste : éteint, il
garde ses ventes en attente, mais aucun autre poste ne les voit.

## Limites connues

Ce qui est assumé, pas oublié — et ce que ça coûtera de le lever.

**Pas de temps réel.** Le remplaçant de `channel()` interroge le serveur
toutes les 15 secondes. C'est le prix du choix « tout en `service_role` », qui
ferme la RLS et donc le Realtime Supabase. À deux ou trois postes, invisible.

**Mono-boutique.** `shop_settings` porte une contrainte `id = 1` : une base,
une boutique. Parfait pour NADAL, à revoir entièrement pour en faire un vrai
SaaS multi-clients — soit un `tenant_id` partout (et la RLS redevient
indispensable, ce qui retourne l'architecture actuelle), soit un projet
Supabase par client (simple, mais les migrations manuelles deviennent
ingérables au-delà de quelques clients).

**La logique métier existe en deux exemplaires.** Le schéma SQL fait foi ;
`lib/demo-store.ts` la rejoue en JavaScript pour le mode démonstration. Les
deux doivent être modifiées ensemble — le plafond d'ardoise l'a été. À terme,
un Postgres jetable (PGlite) coûterait moins cher que ce doublon.

**Les prix de vente restent libres au comptoir.** `create_sale` accepte le
`unit_price_xof` envoyé par la caisse : c'est voulu (on négocie), mais rien ne
mesure encore l'écart au prix catalogue. Sans cette mesure, une marge qui fond
ne se distingue pas d'un fournisseur qui augmente.

## Déploiement

Vercel, projet dédié, Root Directory `quincaillerie/web`.
