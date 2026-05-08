# Salon — Atelier de coiffure SaaS

Site vitrine + back-office complet pour un atelier de coiffure :
RDV en ligne, gestion clients, stock, ventes (POS), équipe.

## Architecture

```
┌─────────────────────────┐
│ Storefront public       │  /             ← landing
│                         │  /reserver     ← booking
│                         │
│ Admin SaaS              │  /admin        ← dashboard
│                         │  /admin/agenda
│                         │  /admin/clients
│                         │  /admin/services
│                         │  /admin/stock
│                         │  /admin/ventes
└─────────────┬───────────┘
              │
┌─────────────▼───────────┐
│ Supabase                │
│ services, clients,      │
│ appointments, products, │
│ sales, sale_items,      │
│ staff, salon_settings   │
└─────────────────────────┘
```

## Setup

### 1. Supabase

1. https://supabase.com → New Project (region : Frankfurt ou Paris).
2. **Important** : crée un projet **dédié au salon** (ne réutilise pas celui de Pilote).
3. SQL Editor → coller `supabase/migrations/001_init.sql` → Run.
4. Project Settings → API → récupère `Project URL`, `anon public`, `service_role`.

### 2. Web local

```bash
cd salon/web
cp .env.example .env.local
# remplir les 3 variables Supabase
npm install
npm run dev
```

Ouvre http://localhost:3000

- `/` → site vitrine
- `/reserver` → page de réservation (placeholder pour l'instant)
- `/admin` → dashboard admin

## Stack

- **Next.js 15** (App Router)
- **TypeScript** strict
- **Tailwind CSS** + design system custom (`card-3d`, `glass`, `text-gold`, `eyebrow`…)
- **Supabase** Postgres + Realtime + Auth
- **Lucide** pour les icônes
- **Inter** (sans) + **Cormorant Garamond** (display, italique élégant)

## Roadmap

- [x] Storefront landing (Hero, Services, Galerie, Équipe, CTA, Footer)
- [x] Page /reserver (placeholder WhatsApp)
- [x] Schema Supabase initial
- [x] Admin shell + dashboard placeholder
- [ ] Booking en ligne avec créneaux disponibles (server action)
- [ ] Admin agenda (drag-resize comme Google Calendar)
- [ ] Admin clients (liste + fiche + historique)
- [ ] Admin POS (ajout panier, paiement, ticket)
- [ ] Admin stock (CRUD + alertes bas)
- [ ] Auth Supabase pour l'admin (magic link)
- [ ] Notifs SMS/WhatsApp de confirmation RDV
- [ ] Multi-tenant (si pertinent plus tard)

## Déploiement

**Vercel** : un projet dédié, Root Directory `salon/web`.
