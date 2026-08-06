# NADAL SERVICES — SaaS de gestion

Vitrine + commande en ligne + back-office complet pour NADAL SERVICES
(Adrigba Kossi Eric, Bingerville) : staff-plomberie, décoration intérieure,
fosse septique biodigesteur et vente de matériaux décoratifs.

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
                                      /admin/parametres
```

## Modèle de données — les cinq décisions

1. **Le stock est un grand livre.** `stock_movements` est la seule écriture ;
   `products.stock_qty` en est le solde, maintenu par trigger. Un mouvement est
   immuable : on le contre-passe, on ne le corrige pas.

2. **Tout est stocké en unité de base.** Un produit se vend au sac ou à la
   palette, à la barre ou à la botte : chaque unité de vente (`product_units`)
   porte son facteur de conversion. Le stock ne connaît qu'une seule unité.

3. **Une vente encaissée génère toujours un règlement.** Le solde d'un client
   est donc « total acheté − total réglé », au comptant comme à l'ardoise. Pas
   de cas particulier, pas de colonne à resynchroniser.

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
  au navigateur ne lit rien.
- Tout passe par des routes serveur en `service_role` : `/api/admin/db` et
  `/api/admin/rpc` pour le back-office, `/api/orders` et les server components
  pour la vitrine.
- **RBAC à quatre rôles** défini une seule fois dans `lib/permissions.ts`,
  appliqué à l'UI *et* revalidé sur chaque requête serveur.
- Les **colonnes de coût** (prix d'achat, marge) sont retirées des réponses
  pour vendeur et magasinier — masquer la colonne dans l'UI la laisserait
  lisible dans la réponse réseau.
- L'identité de l'opérateur (`sold_by`) vient toujours de la session, jamais
  du corps de la requête.
- Sur `/api/orders`, les prix sont relus en base : le navigateur n'envoie que
  des identifiants et des quantités.

### Rôles

| Rôle | Accès |
|---|---|
| `patron` | Tout, y compris comptes, réglages, marges et prix d'achat |
| `gerant` | Tout le quotidien, sauf comptes et réglages |
| `vendeur` | Caisse, clients, devis, commandes. Ni marge ni prix d'achat |
| `magasinier` | Stock, produits, réceptions. Pas d'accès à la caisse |

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
2. SQL Editor → coller `supabase/migrations/001_init.sql` → Run,
   puis `002_appro_inventaire.sql` → Run.
3. Créer un bucket Storage **public** nommé `media`.
4. Project Settings → API → récupérer l'URL, la clé publique et la clé secrète.

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
| Comptes & rôles | ✅ |
| Paramètres | ✅ |
| Vitrine + catalogue + commande | ✅ |
| Push (service worker, abonnement, envoi) | ✅ |

Tous les modules sont livrés. Reste à créer le projet Supabase et à passer
`001_init.sql` pour que l'app ait des données.

## Déploiement

Vercel, projet dédié, Root Directory `quincaillerie/web`.
