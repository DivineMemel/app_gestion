# app-gestion — monorepo

Apps de gestion construites pour des PME basées à Abidjan.

## Apps

| Dossier | Description | Stack | Statut |
|---|---|---|---|
| [`agenda/`](./agenda) | Tri WhatsApp + agenda IA : priorise les messages entrants et en extrait les rendez-vous | Next.js · Baileys · Groq · Supabase | 🟢 En prod |
| [`quincaillerie/`](./quincaillerie) | SaaS de gestion : caisse, stock, devis, ardoises, compta | Next.js · Supabase | 🚧 En cours |
| [`salon/`](./salon) | Site vitrine + SaaS gestion atelier de coiffure (RDV, stock, ventes, clients) | Next.js · Supabase | 🚧 En cours |

## Conventions

- Chaque app est autonome : son propre `package.json`, ses migrations Supabase, ses env vars.
- Stack commun : Next.js 15 · TypeScript · Tailwind · Supabase · Lucide icons.
- Design system partagé : tokens CSS (`--bg`, `--surface`, `--primary`…) + utilities `card-3d`, `glass`, etc.
- TZ : `Africa/Abidjan` (UTC+0) partout.

## Déploiement

- **Web** → Vercel (un projet par app, Root Directory pointant vers le sous-dossier `<app>/web`).
- **Worker** (agenda uniquement) → Render free tier, Root Directory `agenda/worker`.
- **DB** → Supabase (un projet par app pour bien isoler).

## Dev local

```bash
# Agenda — web
cd agenda/web && npm install && npm run dev

# Agenda — worker (autre terminal)
cd agenda/worker && npm install && npm run dev

# Salon — web
cd salon/web && npm install && npm run dev
```

Voir le README de chaque app pour la config détaillée des env vars.
