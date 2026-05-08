# app-gestion — monorepo

Apps de gestion construites pour des PME basées à Abidjan.

## Apps

| Dossier | Description | Stack | Statut |
|---|---|---|---|
| [`pilote/`](./pilote) | Tri WhatsApp + agenda IA pour Eric (déco + fosse septique) | Next.js · Baileys · Groq · Supabase | 🟢 En prod |
| [`salon/`](./salon) | Site vitrine + SaaS gestion atelier de coiffure (RDV, stock, ventes, clients) | Next.js · Supabase | 🚧 En cours |

## Conventions

- Chaque app est autonome : son propre `package.json`, ses migrations Supabase, ses env vars.
- Stack commun : Next.js 15 · TypeScript · Tailwind · Supabase · Lucide icons.
- Design system partagé : tokens CSS (`--bg`, `--surface`, `--primary`…) + utilities `card-3d`, `glass`, etc.
- TZ : `Africa/Abidjan` (UTC+0) partout.

## Déploiement

- **Web** → Vercel (un projet par app, Root Directory pointant vers le sous-dossier `<app>/web`).
- **Worker** (pilote uniquement) → Render free tier, Root Directory `pilote/worker`.
- **DB** → Supabase (un projet par app pour bien isoler).

## Dev local

```bash
# Pilote — web
cd pilote/web && npm install && npm run dev

# Pilote — worker (autre terminal)
cd pilote/worker && npm install && npm run dev

# Salon — web
cd salon/web && npm install && npm run dev
```

Voir le README de chaque app pour la config détaillée des env vars.
