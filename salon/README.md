# MUSE l&rsquo;atelier

Site vitrine + back-office complet pour MUSE l&rsquo;atelier — coiffure,
onglerie et soins, à Abidjan.

## Direction artistique

**BCBG / Old Money.** Noir d&rsquo;encre, bone white, crème chaude.
Typographie reine : **Bodoni Moda** (display, italique éditorial) + **Inter** (body).
Hairlines, beaucoup d&rsquo;air, pas de dégradés tape-à-l&rsquo;œil.

## Architecture

```
┌─────────────────────────────────────┐
│ Storefront public                    │
│   /                                  │  ← landing éditoriale
│   /reserver                          │  ← booking (placeholder WA)
│                                      │
│ Admin SaaS                           │
│   /admin                             │  ← tableau de bord
│   /admin/agenda                      │
│   /admin/ventes                      │  ── Activité
│                                      │
│   /admin/clients                     │
│   /admin/journey                     │  ── Clients (parcours, journey)
│                                      │
│   /admin/secteurs                    │
│   /admin/services                    │  ── Catalogue
│   /admin/stock                       │
│                                      │
│   /admin/depenses                    │
│   /admin/comptabilite                │  ── Finances
│                                      │
│   /admin/parametres                  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ Supabase                             │
│  sectors → categories →              │
│    services / products               │
│  clients · client_events             │
│  appointments · sales · sale_items   │
│  expense_categories · expenses       │
│  staff · salon_settings              │
│  view monthly_pnl, clients_at_risk   │
└─────────────────────────────────────┘
```

## Setup

### 1. Supabase

1. https://supabase.com → New Project (région : Frankfurt ou Paris).
2. Crée un projet **dédié à MUSE** (ne réutilise pas celui de Pilote).
3. SQL Editor → coller `supabase/migrations/001_init.sql` → Run.
4. Coller `supabase/migrations/002_sectors_accounting.sql` → Run.
5. Project Settings → API → récupère `Project URL`, `anon`, `service_role`.

### 2. Web local

```bash
cd salon/web
cp .env.example .env.local
# remplir les 3 variables Supabase
npm install
npm run dev
```

Ouvre http://localhost:3000

- `/` → site vitrine éditorial
- `/reserver` → page de réservation
- `/admin` → tableau de bord SaaS

## Modèle de données — points clés

- **`sectors`** — Coiffure, Onglerie, … (extensible). Chaque secteur regroupe ses propres catégories, services et produits.
- **`categories`** — Sous-divisions par secteur (ex Coiffure : Entretiens, Couleur, Tresses, Soins, Mèches, Articles). Champ `kind` = `'service' | 'product'`.
- **`clients`** — avec `acquisition_source`, `referrer_client_id`, `tags` pour le CRM.
- **`client_events`** — timeline du parcours client (created → first_visit → visit → review → lost).
- **`expenses`** + `expense_categories` — comptabilité dépenses.
- **vue `monthly_pnl`** — chiffre · dépenses · bénéfice par mois.
- **vue `clients_at_risk`** — clientes pas vues depuis 90 à 180 jours.

## Stack

Next.js 15 · TypeScript strict · Tailwind · Supabase · Lucide icons ·
Bodoni Moda + Inter (Google Fonts).

## Roadmap

- [x] Storefront éditorial (Hero, Secteurs, Prestations, Galerie, Maison, CTA, Footer)
- [x] Schema Supabase complet (multi-secteur, compta, journey CRM)
- [x] Admin shell organisé en 4 sections (Activité, Clients, Catalogue, Finances)
- [ ] Booking en ligne (server action, créneaux dispo)
- [ ] Auth admin (Supabase magic link)
- [ ] Admin agenda (drag-resize)
- [ ] Admin clients + fiche cliente avec timeline journey
- [ ] Admin POS (panier, paiement, ticket)
- [ ] Admin stock (CRUD + alertes)
- [ ] Admin comptabilité (P&L mensuel, export)
- [ ] Notifs SMS/WhatsApp confirmation RDV
- [ ] Anniversaires automatiques

## Déploiement

Vercel · projet dédié · Root Directory `salon/web`.
